#!/usr/bin/env python3
"""
JustWatch-Streaming-Sync ("Wer streamt es?" — anbieter-genaue Angebote, DE).

Schreibt pro Anime die Tabelle `anime_streaming_offers` (Payload-Array-Feld
`streamingOffers`): PRO Anbieter Deep-Link, Monetarisierung (flatrate/ads/free),
Audio-/Untertitelsprachen, Staffel-/Episodenzahl beim Anbieter, Ablaufdatum und
first/last_seen. Daraus werden abgeleitet:
  - `anime_streaming_providers` (Filter-Index, Slugs)            — autoritativ auf gematchten Titeln
  - `anime_available_languages` (de-dub/de-sub/en-dub/en-sub/ja) — NUR ADDITIV
    (Crunchyroll-/Wikipedia-Skripte bleiben Quelle für ihre Sprachen)
Nur Streaming-Angebote (FLATRATE/FREE/ADS), kein Kauf/Verleih. Anbieter ohne
Mapping (Bibliotheken wie filmfriend, Shops) werden ignoriert. Anbieter ohne
Deep-Link werden nicht übernommen — lieber „nicht gelistet" als ein Link auf
eine Startseite, der die Verfügbarkeit nur behauptet.

Aufruf (HOST, `pip install curl_cffi` + docker):
  python3 src/scripts/justwatch-streaming.py                    # alle Anime (Backfill, ~30 min)
  python3 src/scripts/justwatch-streaming.py --recent 3         # Titel der letzten 3 Tage (täglich)
  python3 src/scripts/justwatch-streaming.py --only-missing     # nur Titel ohne Offers
  python3 src/scripts/justwatch-streaming.py --stale 150        # rollierend: die 150 am längsten nicht geprüften
  python3 src/scripts/justwatch-streaming.py --slugs naruto,clannad [--dry-run]
  python3 src/scripts/justwatch-streaming.py --purge-unmatched         # Backfill: Titel OHNE sicheren
                                                                       # Match verlieren ihre alten,
                                                                       # unbelegten Anbieter-Flags

Match-Regel: Titel-Ähnlichkeit >= 0.90 gegen die JustWatch-Suche (DE) über
deutschen, englischen, Romaji- und Original-Titel (Diakritika normalisiert),
Objekttyp muss passen (Film ↔ MOVIE, sonst SHOW). Die Substring-Regel greift nur
bei ähnlich langen Titeln — sonst matcht „Journey's End" (Kriegsfilm) auf
„Frieren: Beyond Journey's End". Ohne sicheren Match wird der Bestand NIE angetastet (Ausnahme: `--purge-unmatched`,
einmalig für den Backfill — die alte, lockere Heuristik hatte z. B. „Hyouge Mono"
auf „Mono" gematcht; solche Flags sind wertlos). Bei Match sind die Offers
IMMER autoritativ (Angebote sind der neue Wahrheitsbestand); first_seen_at
bleibt über Läufe hinweg erhalten.

Rate-Limit: 3 Worker + 0.4 s Pause pro Request (~4–5 req/s), Keep-Alive-Session
pro Worker. Bei 403/429 langer Backoff (30/60/120 s) — JustWatch sperrt die IP
zeitweise, wenn zu viele Verbindungen aufgebaut werden (2026-09-10: 4 Worker mit
neuer TLS-Session pro Titel reichten dafür; ein früherer Blast mit ~85 req/s ebenso).
"""
import json
import re
import subprocess
import sys
import threading
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher

try:
    from curl_cffi import requests
except ImportError:
    sys.exit("Fehlt: pip install curl_cffi")

DB_CONTAINER = "otakupulse-db"
GQL = "https://apis.justwatch.com/graphql"
IMPERSONATE = "chrome124"
MAX_WORKERS = 3
REQUEST_PAUSE = 0.4
MONETIZATION = {"FLATRATE": "flatrate", "ADS": "ads", "FREE": "free"}

# JustWatch-`clearName` (lower) -> Provider-Slug (muss zu lib/streaming.ts passen).
CLEARNAME_TO_SLUG = {
    "crunchyroll": "crunchyroll",
    "crunchyroll amazon channel": "crunchyroll",
    "wakanim": "crunchyroll",
    "netflix": "netflix",
    "netflix basic with ads": "netflix",
    "netflix standard with ads": "netflix",
    "amazon prime video": "amazon-prime-video",
    "amazon prime video with ads": "amazon-prime-video",
    "disney plus": "disney-plus",
    "wow": "wow",
    "sky go": "wow",
    "joyn": "joyn",
    "joyn plus": "joyn",
    "rtl+": "rtl-plus",
    "rtl+ max amazon channel": "rtl-plus",
    "aniverse amazon channel": "aniverse",
    "animation digital network": "adn",
    "anime digital network amazon channel": "adn",
    "toggo": "toggo",
    "anime on demand": "anime-on-demand",
    "paramount plus": "paramount-plus",
    "paramount+": "paramount-plus",
    "apple tv plus": "apple-tv",
    "apple tv+": "apple-tv",
    "magenta tv": "magenta-tv",
    "magentatv": "magenta-tv",
    "hidive": "hidive",
}

# Sprachcodes aus Offers -> availableLanguages-Enum (additiv).
AUDIO_TO_LANG = {"de": "de-dub", "en": "en-dub", "ja": "ja"}
SUB_TO_LANG = {"de": "de-sub", "en": "en-sub"}

SEARCH_Q = """
query($c:Country!,$l:Language!,$q:String!){
  popularTitles(country:$c,first:5,filter:{searchQuery:$q}){
    edges{node{
      objectType
      content(country:$c,language:$l){ title originalTitle originalReleaseYear }
      offers(country:$c,platform:WEB){
        monetizationType standardWebURL elementCount audioLanguages subtitleLanguages availableTo
        package{clearName}
      }
      ... on Show { seasons {
        offers(country:$c,platform:WEB){ monetizationType elementCount audioLanguages subtitleLanguages package{clearName} }
      } }
    }}
  }
}"""


def psql(sql: str, read: bool = True) -> str:
    inner = 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
    if read:
        inner += " -t -A"
    res = subprocess.run(["docker", "exec", "-i", DB_CONTAINER, "sh", "-c", inner],
                         input=sql, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"psql-Fehler: {res.stderr.strip()}")
    return res.stdout


def q(s):
    """SQL-String-Literal (NULL bei None)."""
    return "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"


def norm(s):
    """Kleinbuchstaben, ohne Diakritika (Sôsô → soso), nur a-z0-9."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]", "", s.lower())


# JustWatch romanisiert mit Längungszeichen („Sôsô no Furîren"), AniList mit
# Doppelvokalen („Sousou no Frieren"). Zweite Normalform: ô→ou, û→uu, â→aa, ê→ee, î→ii.
_LONG_VOWELS = str.maketrans({"ô": "ou", "ō": "ou", "û": "uu", "ū": "uu", "â": "aa", "ā": "aa",
                              "ê": "ee", "ē": "ee", "î": "ii", "ī": "ii",
                              "Ô": "ou", "Ō": "ou", "Û": "uu", "Ū": "uu", "Â": "aa", "Ā": "aa",
                              "Ê": "ee", "Ē": "ee", "Î": "ii", "Ī": "ii"})


def norm_variants(s):
    if not s:
        return []
    out = {norm(s), norm(s.translate(_LONG_VOWELS))}
    return [v for v in out if v]


def _arg(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        return sys.argv[i + 1] if i + 1 < len(sys.argv) else default
    return default


def load_anime(recent_days=None, stale_limit=None, slugs=None):
    where, tail = "", ""
    if recent_days:
        where = f" WHERE a.created_at > now() - interval '{int(recent_days)} days'"
    if slugs:
        where = " WHERE a.slug IN (" + ",".join(q(s) for s in slugs) + ")"
    if stale_limit:
        tail = f" ORDER BY a.streaming_checked_at ASC NULLS FIRST LIMIT {int(stale_limit)}"
    rows = json.loads(psql(
        "SELECT COALESCE(json_agg(json_build_object('id',s.id,'slug',s.slug,'fmt',s.fmt,'year',s.yr,'de',s.de,'en',s.en,'ro',s.ro,'na',s.na)),'[]') "
        "FROM (SELECT a.id, a.slug, a.format fmt, a.season_year yr, a.title_german de, a.title_english en, a.title_romaji ro, a.title_native na "
        f"FROM anime a{where}{tail}) s;"
    ).strip() or "[]")
    anime = {r["id"]: {"id": r["id"], "slug": r["slug"],
                       "want": "MOVIE" if r.get("fmt") == "MOVIE" else "SHOW",
                       "year": r.get("year"),
                       "titles": [r.get("de") or "", r.get("en") or "", r.get("ro") or "", r.get("na") or ""],
                       "have": set(), "offers": {}}
             for r in rows}
    if not anime:
        return []
    ids = ",".join(str(i) for i in anime)
    for p in json.loads(psql(
        "SELECT COALESCE(json_agg(json_build_object('pid',parent_id,'v',value)),'[]') "
        f"FROM anime_streaming_providers WHERE parent_id IN ({ids});").strip() or "[]"):
        anime[p["pid"]]["have"].add(p["v"])
    # bestehende Offers: first_seen_at je (provider, monetization) erhalten
    for o in json.loads(psql(
        "SELECT COALESCE(json_agg(json_build_object('pid',_parent_id,'p',provider,'m',monetization,'f',first_seen_at)),'[]') "
        f"FROM anime_streaming_offers WHERE _parent_id IN ({ids});").strip() or "[]"):
        anime[o["pid"]]["offers"][(o["p"], o["m"])] = o["f"]
    return list(anime.values())


BLOCK_BACKOFF = (30, 60, 120)


def api_post(session, payload):
    for attempt in range(len(BLOCK_BACKOFF) + 1):
        r = session.post(GQL, json=payload, headers={"Content-Type": "application/json"},
                         impersonate=IMPERSONATE, timeout=30)
        time.sleep(REQUEST_PAUSE)
        if r.status_code in (429, 403) and attempt < len(BLOCK_BACKOFF):
            # IP-Sperre/Rate-Limit: lange warten statt weiter zu hämmern.
            time.sleep(BLOCK_BACKOFF[attempt])
            continue
        return r
    return r


def best_match(data, our_titles, want="SHOW", year=None):
    our = [v for t in our_titles for v in norm_variants(t)]
    best, best_score = None, 0.0
    for edge in data.get("edges", []):
        node = edge.get("node") or {}
        if node.get("objectType") != want:
            continue  # Film vs. Serie darf nie verwechselt werden
        c = node.get("content") or {}
        cand = norm_variants(c.get("title")) + norm_variants(c.get("originalTitle"))
        score = 0.0
        for t in our:
            for cn in cand:
                ratio = SequenceMatcher(None, t, cn).ratio()
                # Substring nur bei ähnlicher Länge: „journeysend" steckt zwar in
                # „frierenbeyondjourneysend", ist aber ein anderer Film.
                short, long_ = sorted((t, cn), key=len)
                if len(short) >= 8 and short in long_ and len(short) / len(long_) >= 0.6:
                    ratio = max(ratio, 0.95)
                score = max(score, ratio)
        # Jahr als Tie-Breaker: gleicher Titel, anderes Werk (Netflix-Realserie „One
        # Piece" 2023 vs. Anime 1999). Nur wenn beide Jahre bekannt sind.
        cy = c.get("originalReleaseYear")
        if score > 0 and year and cy:
            diff = abs(int(year) - int(cy))
            if diff <= 1:
                score = min(1.0, score + 0.03)
            elif diff >= 5:
                score -= 0.15
        if score > best_score:
            best, best_score = node, score
    return best if best and best_score >= 0.90 else None


def _slug_and_monet(o):
    m = MONETIZATION.get(o.get("monetizationType"))
    slug = CLEARNAME_TO_SLUG.get(((o.get("package") or {}).get("clearName") or "").lower())
    return slug, m


def aggregate_offers(node):
    """JustWatch-Node -> Liste von Offer-Dicts (SD/HD dedupliziert, Sprachen vereinigt).

    Show-Ebene: elementCount = Staffeln beim Anbieter. Season-Ebene: elementCount =
    Episoden der Staffel → aufsummiert. Filme haben keine seasons.
    """
    is_show = node.get("objectType") == "SHOW"
    offers = {}
    for o in node.get("offers") or []:
        slug, m = _slug_and_monet(o)
        if not m or not slug:
            continue
        e = offers.setdefault((slug, m), {
            "provider": slug, "monetization": m, "url": None, "is_channel": False, "audio": set(), "subs": set(),
            "seasons": None, "episodes": 0, "available_to": None,
        })
        url = o.get("standardWebURL")
        is_channel = "amazon channel" in ((o.get("package") or {}).get("clearName") or "").lower()
        if url and (not e["url"] or (e["is_channel"] and not is_channel)):
            # Primäres Angebot = erster Deep-Link, wobei der Direktanbieter einen
            # Amazon-Channel derselben Marke ersetzt (crunchyroll.com statt
            # watch.amazon.de). Link UND Ablaufdatum kommen vom primären Angebot;
            # ein Channel darf Sprachen ergänzen, aber nicht sein Enddatum auf den
            # Direktanbieter übertragen.
            e["url"] = url
            e["is_channel"] = is_channel
            e["available_to"] = o.get("availableTo") or None
        e["audio"] |= set(o.get("audioLanguages") or [])
        e["subs"] |= set(o.get("subtitleLanguages") or [])
        if is_show and o.get("elementCount"):
            e["seasons"] = max(e["seasons"] or 0, int(o["elementCount"]))
    for season in node.get("seasons") or []:
        per = {}
        for o in season.get("offers") or []:
            slug, m = _slug_and_monet(o)
            if not m or not slug or (slug, m) not in offers:
                continue
            per[(slug, m)] = max(per.get((slug, m), 0), int(o.get("elementCount") or 0))
            offers[(slug, m)]["audio"] |= set(o.get("audioLanguages") or [])
            offers[(slug, m)]["subs"] |= set(o.get("subtitleLanguages") or [])
        for k, n in per.items():
            offers[k]["episodes"] += n
    out = []
    for e in offers.values():
        if not e["url"]:
            continue  # ohne Deep-Link zeigen wir keinen Anbieter
        e.pop("is_channel", None)
        e["audio"] = ",".join(sorted(e["audio"]))
        e["subs"] = ",".join(sorted(e["subs"]))
        if not is_show:
            e["seasons"], e["episodes"] = None, None
        elif not e["episodes"]:
            e["episodes"] = None
        out.append(e)
    return out


def fetch_offers(session, a):
    """None = API-Fehler, False = kein sicherer Match, sonst Offer-Liste.

    Sucht nacheinander mit deutschem, englischem und Romaji-Titel (dedupliziert),
    bis ein sicherer Match kommt — die JustWatch-Suche findet „Frieren – Nach dem
    Ende der Reise" nicht zuverlässig über den englischen Titel.
    """
    queries = []
    for t in a["titles"][:3]:
        t = (t or "").strip()
        if t and t not in queries:
            queries.append(t)
    if not queries:
        return False
    for query in queries:
        r = api_post(session, {"query": SEARCH_Q, "variables": {"c": "DE", "l": "de", "q": query}})
        if r.status_code != 200:
            return None
        data = (r.json().get("data") or {}).get("popularTitles") or {}
        node = best_match(data, a["titles"], a["want"], a.get("year"))
        if node is not None:
            return aggregate_offers(node)
    return False


def build_sql(a, offers, now_iso):
    aid = a["id"]
    stmts = [f"DELETE FROM anime_streaming_offers WHERE _parent_id = {aid};"]
    slugs = set()
    langs = set()
    for i, e in enumerate(offers, 1):
        # first_seen_at bleibt über Läufe erhalten — AUCH wenn es NULL ist: Zeilen des
        # Erst-Backfills tragen bewusst NULL („seit Beginn bekannt"), sonst wäre der
        # komplette Katalog 30 Tage lang „Neu". Nur wirklich neue (provider, monet)-
        # Paare bekommen den aktuellen Zeitstempel.
        key = (e["provider"], e["monetization"])
        first = a["offers"][key] if key in a["offers"] else now_iso
        slugs.add(e["provider"])
        for code in e["audio"].split(","):
            if code in AUDIO_TO_LANG:
                langs.add(AUDIO_TO_LANG[code])
        for code in e["subs"].split(","):
            if code in SUB_TO_LANG:
                langs.add(SUB_TO_LANG[code])
        stmts.append(
            "INSERT INTO anime_streaming_offers "
            "(_order,_parent_id,id,provider,monetization,url,audio,subs,seasons,episodes,available_to,first_seen_at,last_seen_at) VALUES ("
            f"{i}, {aid}, substr(md5(random()::text || clock_timestamp()::text), 1, 24), "
            f"{q(e['provider'])}, {q(e['monetization'])}::enum_anime_streaming_offers_monetization, {q(e['url'])}, "
            f"{q(e['audio'] or None)}, {q(e['subs'] or None)}, "
            f"{e['seasons'] if e['seasons'] is not None else 'NULL'}, {e['episodes'] if e['episodes'] is not None else 'NULL'}, "
            f"{q(e['available_to'])}, {q(first)}, {q(now_iso)});"
        )
    stmts.append(f"DELETE FROM anime_streaming_providers WHERE parent_id = {aid};")
    if slugs:
        vals = ",".join(f"({i+1}, {aid}, {q(s)}::enum_anime_streaming_providers)" for i, s in enumerate(sorted(slugs)))
        stmts.append(f'INSERT INTO anime_streaming_providers ("order", parent_id, value) VALUES {vals};')
    for lang in sorted(langs):
        stmts.append(
            'INSERT INTO anime_available_languages ("order", parent_id, value) '
            f"SELECT COALESCE((SELECT max(\"order\") FROM anime_available_languages WHERE parent_id = {aid}), 0) + 1, {aid}, "
            f"{q(lang)}::enum_anime_available_languages "
            f"WHERE NOT EXISTS (SELECT 1 FROM anime_available_languages WHERE parent_id = {aid} AND value = {q(lang)});"
        )
    changed = slugs != a["have"] or set((e["provider"], e["monetization"]) for e in offers) != set(a["offers"])
    return stmts, changed


_tls = threading.local()


def session():
    """Eine TLS-Session pro Worker-Thread (Keep-Alive statt Handshake pro Titel)."""
    if not getattr(_tls, "session", None):
        _tls.session = requests.Session(impersonate=IMPERSONATE)
    return _tls.session


def main():
    recent, stale, slugs = _arg("--recent"), _arg("--stale"), _arg("--slugs")
    dry = "--dry-run" in sys.argv
    purge = "--purge-unmatched" in sys.argv
    print("→ Lade Anime + vorhandene Anbieter/Offers …")
    anime = load_anime(recent_days=recent, stale_limit=stale, slugs=slugs.split(",") if slugs else None)
    if "--only-missing" in sys.argv:
        anime = [a for a in anime if not a["offers"]]
    print(f"  {len(anime)} Anime.")
    if not anime:
        return

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
    sql, changed_ids, checked_ids = [], [], []
    stats = {"checked": 0, "changed": 0, "nomatch": 0, "errors": 0}
    done = 0
    t0 = time.time()

    def flush():
        """Angesammelte Änderungen in EINER Transaktion schreiben + Prüfstempel setzen.
        Wird alle FLUSH_EVERY Titel aufgerufen, damit ein Abbruch nicht alles verliert."""
        nonlocal sql, changed_ids, checked_ids
        if dry:
            return
        if sql:
            if changed_ids:
                ids = ",".join(str(i) for i in changed_ids)
                # Änderungen zählen als Inhaltsänderung (Sitemap-lastmod, IndexNow).
                sql.append(f"UPDATE anime SET content_updated_at = now(), updated_at = now() WHERE id IN ({ids});")
            psql("BEGIN;\n" + "\n".join(sql) + "\nCOMMIT;", read=False)
        if checked_ids:
            ids = ",".join(str(i) for i in checked_ids)
            psql(f"UPDATE anime SET streaming_checked_at = now() WHERE id IN ({ids});", read=False)
        sql, changed_ids, checked_ids = [], [], []

    FLUSH_EVERY = 500

    def worker(a):
        return a, fetch_offers(session(), a)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        for f in as_completed([ex.submit(worker, a) for a in anime]):
            a, offers = f.result()
            done += 1
            if offers is None:
                stats["errors"] += 1  # API-Fehler → nicht stempeln, nächste Runde erneut
            else:
                checked_ids.append(a["id"])
                stats["checked"] += 1
                if offers is False:
                    stats["nomatch"] += 1
                    if purge and not dry and (a["have"] or a["offers"]):
                        sql.append(f"DELETE FROM anime_streaming_offers WHERE _parent_id = {a['id']};")
                        sql.append(f"DELETE FROM anime_streaming_providers WHERE parent_id = {a['id']};")
                        changed_ids.append(a["id"])
                        stats["changed"] += 1
                else:
                    stmts, changed = build_sql(a, offers, now_iso)
                    if dry:
                        print(f"  {a['slug']}: " + (", ".join(
                            f"{o['provider']}/{o['monetization']} a={o['audio']} s={o['subs']} S{o['seasons']} E{o['episodes']} {o['url'][:60]}"
                            for o in offers) or "(keine Streaming-Angebote)"))
                    else:
                        sql.extend(stmts)
                        if changed:
                            changed_ids.append(a["id"])
                            stats["changed"] += 1
            if done % 250 == 0:
                rate = done / max(1.0, time.time() - t0)
                eta = (len(anime) - done) / max(0.01, rate) / 60
                print(f"  {done}/{len(anime)} … geändert {stats['changed']}, ohne Match {stats['nomatch']}, "
                      f"Fehler {stats['errors']} ({rate:.1f} Titel/s, ETA {eta:.0f} min)", flush=True)
            if done % FLUSH_EVERY == 0:
                flush()

    flush()
    print(f"  Fertig: {stats['checked']} geprüft, {stats['changed']} geändert, {stats['nomatch']} ohne Match, "
          f"{stats['errors']} Fehler in {(time.time() - t0) / 60:.1f} min.")
    if not dry:
        print("✓ Offers geschrieben, geprüfte Titel gestempelt.")


if __name__ == "__main__":
    main()
