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
Streaming-Angebote (FLATRATE/FREE/ADS) UND Kauf/Leih (BUY/RENT bei Amazon Video,
Apple TV, Google Play …) — letztere nur informativ: `streamingProviders` und
Sprachen werden ausschließlich aus Streaming-Angeboten abgeleitet. Anbieter ohne
Mapping (Bibliotheken wie filmfriend, DVD-Shops) werden ignoriert. Anbieter ohne
Deep-Link werden nicht übernommen — lieber „nicht gelistet" als ein Link auf
eine Startseite, der die Verfügbarkeit nur behauptet.

Aufruf (HOST, `pip install curl_cffi` + docker):
  python3 src/scripts/justwatch-streaming.py                    # alle Anime (nur kleine Kataloge — sonst 403, siehe unten)
  python3 src/scripts/justwatch-streaming.py --recent 3         # Titel der letzten 3 Tage (täglich)
  python3 src/scripts/justwatch-streaming.py --only-missing     # nur Titel ohne Offers
  python3 src/scripts/justwatch-streaming.py --stale 150        # rollierend: die 150 am längsten nicht geprüften
  python3 src/scripts/justwatch-streaming.py --slugs naruto,clannad [--dry-run]
  python3 src/scripts/justwatch-streaming.py --unmatched-top 150 --not-checked-since 2026-09-13T00:00:00Z
                                                                       # die 150 beliebtesten Titel OHNE Offers, die seit
                                                                       # dem Datum nicht geprüft wurden (2. Durchlauf)
  python3 src/scripts/justwatch-streaming.py --initial                 # Erst-Backfill: kein first_seen_at
                                                                       # für Titel ohne bisherige Offers
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

Rate-Limit: 1 Worker + 1.2 s Pause pro Request (~0.7 req/s), Keep-Alive-Session,
max. 2 Suchanfragen pro Titel. Bei 403/429 langer Backoff (30/60/120 s). JustWatch
sperrt die IP für ~1 h, sobald zu viel Volumen kommt — am 2026-09-10 reichten dafür
nacheinander 4 Worker (TLS pro Titel), 3 Worker bei ~5 Titel/s über 15 min und
2 Worker bei ~3 req/s nach ~4 min (mit parallelem Cron). Große Läufe deshalb nur in
Batches (--stale N, ~500 Titel pro halbe Stunde) und NIE zwei Instanzen parallel
(Instanz-Sperre unten).
"""
import json
import os
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
MAX_WORKERS = 1
REQUEST_PAUSE = 1.2
MONETIZATION = {"FLATRATE": "flatrate", "ADS": "ads", "FREE": "free", "BUY": "buy", "RENT": "rent"}
STREAMING = {"flatrate", "ads", "free"}  # Kauf/Leih zählt nicht als „läuft bei"

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
    # Kauf/Leih-Stores (BUY/RENT) — nur informativ, kein Streaming-Index
    "amazon video": "amazon-video",
    "apple tv": "apple-tv",
    "google play movies": "google-play",
    "rakuten tv": "rakuten-tv",
    "microsoft store": "microsoft-store",
    "sky store": "sky-store",
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
        content(country:$c,language:$l){ title seasonNumber originalReleaseYear }
        offers(country:$c,platform:WEB){
          monetizationType standardWebURL elementCount audioLanguages subtitleLanguages availableTo
          package{clearName}
        }
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


_PAREN = re.compile(r"\s*\((?:tv|ova|ona|movie|film|\d{4})\)\s*$", re.I)
_ROMAN = {"ii": "2", "iii": "3", "iv": "4", "v": "5", "vi": "6"}


def norm_variants(s):
    """Normalformen eines Titels: ohne Diakritika, mit Doppelvokal-Romanisierung,
    ohne Klammerzusatz („JoJo's Bizarre Adventure (TV)"), römische Staffelziffer
    als Zahl („Sword Art Online II" → „swordartonline2")."""
    if not s:
        return []
    base = _PAREN.sub("", s)
    out = {norm(base), norm(base.translate(_LONG_VOWELS))}
    m = re.search(r"\s(ii|iii|iv|v|vi)$", base.strip(), re.I)
    if m:
        out.add(norm(base[: m.start()] + " " + _ROMAN[m.group(1).lower()]))
    return [v for v in out if v]


def title_base(s):
    """Teil vor dem ersten Untertitel-Trenner („Wotakoi: Love is Hard…" → „wotakoi")."""
    if not s:
        return ""
    head = re.split(r"\s*[:\-–—]\s+|\s-", _PAREN.sub("", s), maxsplit=1)[0]
    return norm(head)


def _arg(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        return sys.argv[i + 1] if i + 1 < len(sys.argv) else default
    return default


def load_anime(recent_days=None, stale_limit=None, slugs=None, unmatched_top=None, not_checked_since=None):
    where, tail = "", ""
    if recent_days:
        where = f" WHERE a.created_at > now() - interval '{int(recent_days)} days'"
    if slugs:
        where = " WHERE a.slug IN (" + ",".join(q(s) for s in slugs) + ")"
    if stale_limit:
        tail = f" ORDER BY a.streaming_checked_at ASC NULLS FIRST LIMIT {int(stale_limit)}"
    if unmatched_top:
        where = " WHERE NOT EXISTS (SELECT 1 FROM anime_streaming_offers o WHERE o._parent_id = a.id) AND a.is_hentai IS NOT TRUE"
        tail = f" ORDER BY a.popularity DESC NULLS LAST LIMIT {int(unmatched_top)}"
    if not_checked_since:
        # Zweiter Durchlauf nach Matcher-Änderungen: nur Titel, die seitdem nicht geprüft wurden.
        clause = f"(a.streaming_checked_at IS NULL OR a.streaming_checked_at < {q(not_checked_since)})"
        where = f"{where} AND {clause}" if where else f" WHERE {clause}"
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
    """Bester JustWatch-Node oder None.

    Rückgabe: (node, remainder). remainder="" = exakter Titel-Match (Serie/Film als
    Ganzes). remainder="stardustcrusaders" = unser Titel beginnt mit dem Serien-
    titel und ist eine Fortsetzung/Staffel → der Aufrufer wählt die Staffel.
    """
    our = [v for t in our_titles for v in norm_variants(t)]
    best, best_score, best_rem = None, 0.0, ""
    for edge in data.get("edges", []):
        node = edge.get("node") or {}
        if node.get("objectType") != want:
            continue  # Film vs. Serie darf nie verwechselt werden
        c = node.get("content") or {}
        cand = norm_variants(c.get("title")) + norm_variants(c.get("originalTitle"))
        cy = c.get("originalReleaseYear")
        score, rem = 0.0, ""
        # Gleicher Basistitel vor „:"/„-" und gleiches Jahr → derselbe Titel, nur der Untertitel
        # ist übersetzt („Wotakoi: Love is Hard for Otaku" vs. „Wotakoi: Keine Chance für …").
        if year and cy and abs(int(year) - int(cy)) <= 1:
            ours_base = {title_base(t) for t in our_titles if t}
            cand_base = {title_base(c.get("title")), title_base(c.get("originalTitle"))}
            if any(b and len(b) >= 6 and b in cand_base for b in ours_base):
                score, rem = max(score, 0.92), ""
        for t in our:
            for cn in cand:
                ratio = SequenceMatcher(None, t, cn).ratio()
                # Fortsetzung: UNSER Titel beginnt mit dem JW-Serientitel („spyxfamily" +
                # „season3"). Nur Präfix, nie Suffix; Serie darf nicht jünger sein als wir.
                # Hat Vorrang vor der Substring-Regel — sonst gilt „JoJo … Golden Wind"
                # als exakter Treffer der Serie und fällt am Jahres-Tie-Break (2012/2018).
                if (want == "SHOW" and len(cn) >= 6 and t.startswith(cn) and len(t) > len(cn)
                        and (not year or not cy or int(cy) <= int(year) + 1)):
                    # Auch bei hoher Roh-Ähnlichkeit („swordartonlineii" ≈ „swordartonline") gilt:
                    # Serientitel + Rest = Fortsetzung → Staffel wählen, nicht die ganze Serie.
                    if score <= 0.9:
                        score, rem = 0.9, t[len(cn):]
                    continue
                # Umkehrung: JW hängt einen Untertitel an („Nichijou – Das ganz normale
                # Leben"). Nur mit gleichem Jahr, sonst würde „Naruto" auf „Naruto Shippuden" passen.
                if (len(t) >= 6 and cn.startswith(t) and len(cn) > len(t)
                        and year and cy and abs(int(year) - int(cy)) <= 1):
                    ratio = max(ratio, 0.95)
                short, long_ = sorted((t, cn), key=len)
                # Substring nur bei ähnlicher Länge: „journeysend" steckt zwar in
                # „frierenbeyondjourneysend", ist aber ein anderer Film.
                if len(short) >= 8 and short in long_ and len(short) / len(long_) >= 0.6:
                    ratio = max(ratio, 0.95)
                if ratio > score:
                    score, rem = ratio, ""
        # Jahr als Tie-Breaker: gleicher Titel, anderes Werk (Netflix-Realserie „One
        # Piece" 2023 vs. Anime 1999). Nur bei exaktem Match und bekannten Jahren.
        if score > 0 and not rem and year and cy:
            diff = abs(int(year) - int(cy))
            if diff <= 1:
                score = min(1.0, score + 0.03)
            elif diff >= 5:
                score -= 0.15
        if score > best_score:
            best, best_score, best_rem = node, score, rem
    return (best, best_rem) if best and best_score >= 0.90 else None


_SEASON_NUM = re.compile(r"(?:season|staffel|part|cour|s|r)(\d{1,2})$|^(\d{1,2})(?:nd|rd|th)?(?:season|staffel)?$")


def pick_season(node, remainder, year):
    """Staffel einer Fortsetzung bestimmen: explizite Nummer → Staffeltitel → Jahr.
    None, wenn nichts eindeutig passt (dann lieber kein Match als falsche Anbieter)."""
    seasons = [se for se in (node.get("seasons") or []) if (se.get("content") or {}).get("seasonNumber")]
    if not seasons:
        return None
    m = _SEASON_NUM.search(remainder)
    if m:
        n = int(m.group(1) or m.group(2))
        hit = [se for se in seasons if se["content"]["seasonNumber"] == n]
        if len(hit) == 1:
            return hit[0]
    # Staffeltitel („Stardust Crusaders", „SCIENCE FUTURE") gegen den Rest unseres Titels
    for se in seasons:
        for st in norm_variants(se["content"].get("title")):
            if st and not re.fullmatch(r"(staffel|season)\d+", st) and (
                    SequenceMatcher(None, remainder, st).ratio() >= 0.85 or (len(st) >= 6 and st in remainder)):
                return se
    if year:
        hit = [se for se in seasons if se["content"].get("originalReleaseYear") == int(year)]
        if len(hit) == 1:
            return hit[0]
    return None


def is_base_entry(node, remainder, year):
    """„Seraph of the End: Vampire Reign" = die Serie selbst (Untertitel der ersten Staffel):
    kein Staffelmarker im Rest und unser Jahr = Startjahr der Serie → Serien-Angebote."""
    cy = (node.get("content") or {}).get("originalReleaseYear")
    return bool(year and cy and int(year) == int(cy) and not _SEASON_NUM.search(remainder))


def _slug_and_monet(o):
    m = MONETIZATION.get(o.get("monetizationType"))
    slug = CLEARNAME_TO_SLUG.get(((o.get("package") or {}).get("clearName") or "").lower())
    return slug, m


def aggregate_offers(node, season=None):
    """JustWatch-Node -> Liste von Offer-Dicts (SD/HD dedupliziert, Sprachen vereinigt).

    Show-Ebene: elementCount = Staffeln beim Anbieter. Season-Ebene: elementCount =
    Episoden der Staffel → aufsummiert. Filme haben keine seasons.
    Mit `season` (Fortsetzungs-Eintrag) zählen NUR die Angebote dieser Staffel:
    seasons=1, episodes=elementCount der Staffel.
    """
    is_show = node.get("objectType") == "SHOW"
    if season is not None:
        node = {"objectType": "SHOW", "offers": season.get("offers") or [], "seasons": []}
        single = True
    else:
        single = False
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
        if single and o.get("elementCount"):
            e["seasons"], e["episodes"] = 1, max(e["episodes"] or 0, int(o["elementCount"]))
        elif is_show and o.get("elementCount"):
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
    # Max. 2 Suchanfragen: deutscher (falls vorhanden) oder englischer Titel, dann Romaji.
    queries = []
    for t in [a["titles"][0] or a["titles"][1], a["titles"][2]]:
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
        hit = best_match(data, a["titles"], a["want"], a.get("year"))
        if hit is None:
            continue
        node, remainder = hit
        if not remainder:
            return aggregate_offers(node)
        season = pick_season(node, remainder, a.get("year"))
        if season is not None:
            return aggregate_offers(node, season)
        if is_base_entry(node, remainder, a.get("year")):
            return aggregate_offers(node)
        # Serie erkannt, aber Staffel nicht eindeutig → kein Match (keine Serien-
        # Anbieter pauschal auf eine Fortsetzung übertragen).
    return False


def build_sql(a, offers, now_iso, initial=False):
    aid = a["id"]
    stmts = [f"DELETE FROM anime_streaming_offers WHERE _parent_id = {aid};"]
    slugs = set()
    langs = set()
    for i, e in enumerate(offers, 1):
        streaming = e["monetization"] in STREAMING
        # first_seen_at bleibt über Läufe erhalten — AUCH wenn es NULL ist: Zeilen des
        # Erst-Backfills tragen bewusst NULL („seit Beginn bekannt"), sonst wäre der
        # komplette Katalog 30 Tage lang „Neu". Nur wirklich neue (provider, monet)-
        # Paare bekommen den aktuellen Zeitstempel.
        key = (e["provider"], e["monetization"])
        # --initial (Erst-Backfill): Titel, die noch nie Offers hatten, bekommen KEIN
        # first_seen_at — sonst wäre der ganze Katalog 30 Tage lang „Neu auf …".
        # Danach (Cron ohne Flag) gilt: neues (Anbieter, Monetarisierung)-Paar = jetzt.
        first = a["offers"][key] if key in a["offers"] else (None if (initial and not a["offers"]) else now_iso)
        if streaming:  # Filter-Index und Sprachen nur aus echten Streaming-Angeboten
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


def other_instance_running():
    """Instanz-Sperre: Cron (--stale) und Backfill dürfen nie parallel laufen — zwei
    Läufe verdoppeln das Volumen und JustWatch sperrt die IP."""
    me, parent = str(os.getpid()), str(os.getppid())
    out = subprocess.run(["pgrep", "-f", "src/scripts/justwatch-streaming.py"], capture_output=True, text=True).stdout.split()
    return any(pid not in (me, parent) for pid in out)


def main():
    if other_instance_running():
        print("→ Eine andere Instanz von justwatch-streaming.py läuft bereits — Abbruch (Instanz-Sperre).")
        return
    recent, stale, slugs = _arg("--recent"), _arg("--stale"), _arg("--slugs")
    dry = "--dry-run" in sys.argv
    purge = "--purge-unmatched" in sys.argv
    initial = "--initial" in sys.argv
    print("→ Lade Anime + vorhandene Anbieter/Offers …")
    anime = load_anime(recent_days=recent, stale_limit=stale, slugs=slugs.split(",") if slugs else None,
                       unmatched_top=_arg("--unmatched-top"), not_checked_since=_arg("--not-checked-since"))
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
                    stmts, changed = build_sql(a, offers, now_iso, initial)
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
