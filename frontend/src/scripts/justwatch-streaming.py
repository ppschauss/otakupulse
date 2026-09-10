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

Match-Regel: Titel-Ähnlichkeit >= 0.90 gegen die JustWatch-Suche (DE). Ohne
sicheren Match wird der Bestand NIE angetastet. Bei Match sind die Offers
IMMER autoritativ (Angebote sind der neue Wahrheitsbestand); first_seen_at
bleibt über Läufe hinweg erhalten.

Rate-Limit: 4 Worker + 0.25 s Pause pro Request (~8–10 req/s). Der frühere
Massen-Backfill mit ~85 req/s endete in 403.
"""
import json
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher

try:
    from curl_cffi import requests
except ImportError:
    sys.exit("Fehlt: pip install curl_cffi")

DB_CONTAINER = "otakupulse-db"
GQL = "https://apis.justwatch.com/graphql"
IMPERSONATE = "chrome124"
MAX_WORKERS = 4
REQUEST_PAUSE = 0.25
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
      content(country:$c,language:$l){ title originalTitle }
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
    return re.sub(r"[^a-z0-9]", "", s.lower()) if s else ""


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
        "SELECT COALESCE(json_agg(json_build_object('id',s.id,'slug',s.slug,'en',s.en,'ro',s.ro,'na',s.na)),'[]') "
        "FROM (SELECT a.id, a.slug, a.title_english en, a.title_romaji ro, a.title_native na "
        f"FROM anime a{where}{tail}) s;"
    ).strip() or "[]")
    anime = {r["id"]: {"id": r["id"], "slug": r["slug"],
                       "titles": [r.get("en") or "", r.get("ro") or "", r.get("na") or ""],
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


def api_post(session, payload):
    for attempt in range(4):
        r = session.post(GQL, json=payload, headers={"Content-Type": "application/json"},
                         impersonate=IMPERSONATE, timeout=30)
        time.sleep(REQUEST_PAUSE)
        if r.status_code in (429, 403):
            time.sleep(2 ** attempt)
            continue
        return r
    return r


def best_match(data, our_titles):
    our = [norm(t) for t in our_titles if t.strip()]
    best, best_score = None, 0.0
    for edge in data.get("edges", []):
        node = edge.get("node") or {}
        c = node.get("content") or {}
        cand = [norm(c.get("title")), norm(c.get("originalTitle"))]
        score = 0.0
        for t in our:
            for cn in cand:
                if not cn:
                    continue
                ratio = SequenceMatcher(None, t, cn).ratio()
                if len(t) >= 8 and (t in cn or cn in t):
                    ratio = max(ratio, 0.95)
                score = max(score, ratio)
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
            "provider": slug, "monetization": m, "url": None, "audio": set(), "subs": set(),
            "seasons": None, "episodes": 0, "available_to": None,
        })
        url = o.get("standardWebURL")
        if url and not e["url"]:
            # Das erste Angebot mit Deep-Link ist das primäre: Link UND Ablaufdatum
            # kommen von dort. (Ein Amazon-Channel derselben Marke, z. B. „RTL+ Max
            # Amazon Channel", darf Sprachen ergänzen, aber nicht sein Enddatum
            # auf den Direktanbieter übertragen.)
            e["url"] = url
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
        e["audio"] = ",".join(sorted(e["audio"]))
        e["subs"] = ",".join(sorted(e["subs"]))
        if not is_show:
            e["seasons"], e["episodes"] = None, None
        elif not e["episodes"]:
            e["episodes"] = None
        out.append(e)
    return out


def fetch_offers(session, a):
    """None = API-Fehler, False = kein sicherer Match, sonst Offer-Liste."""
    query = next((t for t in a["titles"] if t.strip()), "")
    if not query:
        return False
    r = api_post(session, {"query": SEARCH_Q, "variables": {"c": "DE", "l": "de", "q": query}})
    if r.status_code != 200:
        return None
    data = (r.json().get("data") or {}).get("popularTitles") or {}
    node = best_match(data, a["titles"])
    if node is None:
        return False
    return aggregate_offers(node)


def build_sql(a, offers, now_iso):
    aid = a["id"]
    stmts = [f"DELETE FROM anime_streaming_offers WHERE _parent_id = {aid};"]
    slugs = set()
    langs = set()
    for i, e in enumerate(offers, 1):
        first = a["offers"].get((e["provider"], e["monetization"])) or now_iso
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


def main():
    recent, stale, slugs = _arg("--recent"), _arg("--stale"), _arg("--slugs")
    dry = "--dry-run" in sys.argv
    print("→ Lade Anime + vorhandene Anbieter/Offers …")
    anime = load_anime(recent_days=recent, stale_limit=stale, slugs=slugs.split(",") if slugs else None)
    if "--only-missing" in sys.argv:
        anime = [a for a in anime if not a["offers"]]
    print(f"  {len(anime)} Anime.")
    if not anime:
        return

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
    sql, changed_ids, checked_ids = [], [], []
    errors = nomatch = done = 0

    def worker(a):
        s = requests.Session(impersonate=IMPERSONATE)
        return a, fetch_offers(s, a)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        for f in as_completed([ex.submit(worker, a) for a in anime]):
            a, offers = f.result()
            done += 1
            if offers is None:
                errors += 1
                continue
            checked_ids.append(a["id"])
            if offers is False:
                nomatch += 1
                continue
            stmts, changed = build_sql(a, offers, now_iso)
            if dry:
                print(f"  {a['slug']}: " + (", ".join(
                    f"{o['provider']}/{o['monetization']} a={o['audio']} s={o['subs']} S{o['seasons']} E{o['episodes']} {o['url'][:60]}"
                    for o in offers) or "(keine Streaming-Angebote)"))
                continue
            sql.extend(stmts)
            if changed:
                changed_ids.append(a["id"])
            if done % 200 == 0:
                print(f"  {done}/{len(anime)} … (geändert: {len(changed_ids)})")

    print(f"  Fertig: {len(checked_ids)} geprüft, {len(changed_ids)} geändert, {nomatch} ohne Match, {errors} Fehler.")
    if dry:
        return
    if sql:
        # Änderungen zählen als Inhaltsänderung (Sitemap-lastmod, IndexNow).
        if changed_ids:
            ids = ",".join(str(i) for i in changed_ids)
            sql.append(f"UPDATE anime SET content_updated_at = now(), updated_at = now() WHERE id IN ({ids});")
        psql("BEGIN;\n" + "\n".join(sql) + "\nCOMMIT;", read=False)
        print("✓ Offers geschrieben.")
    if checked_ids:
        ids = ",".join(str(i) for i in checked_ids)
        psql(f"UPDATE anime SET streaming_checked_at = now() WHERE id IN ({ids});", read=False)
        print(f"✓ {len(checked_ids)} Titel als geprüft markiert.")


if __name__ == "__main__":
    main()
