#!/usr/bin/env python3
"""
Wikidata/Wikipedia-Dub-Sync (legale Ergänzung für deutschen Dub).

Mappt unsere Anime über Wikidata (MAL-ID P4086, Fallback AniList-ID P8729) auf
ihren deutschen Wikipedia-Artikel und prüft, ob dieser einen Abschnitt
„Synchronisation" hat — ein verlässliches Signal dafür, dass eine deutsche
Synchronfassung existiert. Trifft v. a. Klassiker/Filme, die Crunchyroll fehlen
(z. B. FMA: Brotherhood, Code Geass, Your Name).

Setzt `de-dub` in `availableLanguages` (gemerged, nichts wird überschrieben).
100% legal: Wikidata (CC0) + Wikipedia (CC BY-SA) — es wird nur die Tatsache
„hat dt. Synchro" abgeleitet, kein Text übernommen.

WICHTIG: Läuft auf dem HOST. `pip install curl_cffi` + `docker`. Idempotent.
Aufruf:  python3 src/scripts/wikipedia-dub.py
"""
import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import unquote

try:
    from curl_cffi import requests
except ImportError:
    sys.exit("Fehlt: pip install curl_cffi")

DB_CONTAINER = "otakupulse-db"
SPARQL = "https://query.wikidata.org/sparql"
WIKI_API = "https://de.wikipedia.org/w/api.php"
UA = "OtakuPulse/1.0 (Anime-DB; research)"
IMPERSONATE = "chrome124"
SPARQL_BATCH = 150
MAX_WORKERS = 6


def psql(sql: str, read: bool = True) -> str:
    inner = 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
    if read:
        inner += " -t -A"
    res = subprocess.run(["docker", "exec", "-i", DB_CONTAINER, "sh", "-c", inner],
                         input=sql, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"psql-Fehler: {res.stderr.strip()}")
    return res.stdout


def chunk(seq, n):
    return [seq[i:i + n] for i in range(0, len(seq), n)]


def load_anime():
    rows = json.loads(psql(
        "SELECT COALESCE(json_agg(json_build_object('id',a.id,'mal',a.mal_id,'al',a.anilist_id)),'[]') FROM anime a;"
    ).strip() or "[]")
    anime = {r["id"]: {"id": r["id"], "mal": r.get("mal"), "al": r.get("al"), "have": set(), "article": None}
             for r in rows}
    langs = json.loads(psql(
        "SELECT COALESCE(json_agg(json_build_object('pid',parent_id,'v',value)),'[]') FROM anime_available_languages;"
    ).strip() or "[]")
    for l in langs:
        a = anime.get(l["pid"])
        if a:
            a["have"].add(l["v"])
    return anime


def sparql_articles(session, prop, id_to_anime: dict) -> int:
    """Trägt für gefundene IDs den de.wiki-Artikel ein. Gibt #Treffer zurück."""
    hits = 0
    ids = list(id_to_anime.keys())
    for batch in chunk(ids, SPARQL_BATCH):
        values = " ".join(f'"{i}"' for i in batch)
        q = (f"SELECT ?id ?deArticle WHERE {{ VALUES ?id {{ {values} }} "
             f"?item wdt:{prop} ?id . "
             f"?deArticle schema:about ?item ; schema:isPartOf <https://de.wikipedia.org/> . }}")
        for attempt in range(4):
            r = session.get(SPARQL, params={"query": q, "format": "json"},
                            headers={"User-Agent": UA, "Accept": "application/sparql-results+json"},
                            impersonate=IMPERSONATE, timeout=60)
            if r.status_code == 429:
                time.sleep(2 ** attempt + 1)
                continue
            break
        if r.status_code != 200:
            print(f"  ⚠ SPARQL {prop} HTTP {r.status_code}", file=sys.stderr)
            continue
        for b in r.json().get("results", {}).get("bindings", []):
            rid = b["id"]["value"]
            url = b.get("deArticle", {}).get("value", "")
            a = id_to_anime.get(rid)
            if a and url and not a["article"]:
                a["article"] = unquote(url.split("/wiki/")[-1]).replace("_", " ")
                hits += 1
        time.sleep(0.3)  # höflich zum WDQS
    return hits


def has_german_dub(session, title: str) -> bool | None:
    for attempt in range(4):
        r = session.get(WIKI_API,
                        params={"action": "parse", "page": title, "prop": "sections",
                                "format": "json", "redirects": 1},
                        headers={"User-Agent": UA}, impersonate=IMPERSONATE, timeout=30)
        if r.status_code == 429:
            time.sleep(2 ** attempt)
            continue
        if r.status_code != 200:
            return None
        secs = r.json().get("parse", {}).get("sections", [])
        return any("synchron" in (x.get("line") or "").lower() for x in secs)
    return None


def main():
    print("→ Lade Anime + Sprachen …")
    anime = load_anime()
    by_mal = {str(a["mal"]): a for a in anime.values() if a.get("mal")}
    by_al = {str(a["al"]): a for a in anime.values() if a.get("al")}
    print(f"  {len(anime)} Anime ({len(by_mal)} mit MAL-ID, {len(by_al)} mit AniList-ID).")

    sess = requests.Session(impersonate=IMPERSONATE)
    print("→ Wikidata: MAL-ID → de.wikipedia …")
    m1 = sparql_articles(sess, "P4086", by_mal)
    # Fallback über AniList-ID nur für noch ohne Artikel
    remaining = {str(a["al"]): a for a in anime.values() if a.get("al") and not a["article"]}
    print(f"  {m1} via MAL. → Fallback AniList-ID für {len(remaining)} …")
    m2 = sparql_articles(sess, "P8729", remaining)

    articles = {a["id"]: a for a in anime.values() if a["article"]}
    print(f"  {len(articles)} Anime mit de.wikipedia-Artikel ({m1} MAL + {m2} AniList).")

    # Synchronisations-Abschnitt prüfen (Artikel cachen — Seasons teilen sich Artikel).
    cache: dict[str, bool | None] = {}
    dubbed_ids = []
    done = 0

    def worker(a):
        s = requests.Session(impersonate=IMPERSONATE)
        title = a["article"]
        if title in cache:
            return a["id"], cache[title]
        res = has_german_dub(s, title)
        cache[title] = res
        return a["id"], res

    print("→ Prüfe Synchronisation-Abschnitte …")
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futs = [ex.submit(worker, a) for a in articles.values()]
        for f in as_completed(futs):
            aid, dub = f.result()
            done += 1
            if dub:
                dubbed_ids.append(aid)
            if done % 100 == 0:
                print(f"  {done}/{len(articles)} … ({len(dubbed_ids)} mit dt. Synchro)")

    # Nur Anime schreiben, die de-dub noch NICHT haben (neue Treffer).
    new = [aid for aid in dubbed_ids if "de-dub" not in anime[aid]["have"]]
    print(f"  {len(dubbed_ids)} Artikel mit Synchronisation, davon {len(new)} neu (noch kein de-dub).")
    if not new:
        return

    print("→ Schreibe de-dub (gemerged) …")
    stmts = ["BEGIN;"]
    for aid in new:
        langs = sorted(anime[aid]["have"] | {"de-dub"})
        stmts.append(f"DELETE FROM anime_available_languages WHERE parent_id = {aid};")
        vals = ",".join(f"({i+1}, {aid}, '{l}'::enum_anime_available_languages)" for i, l in enumerate(langs))
        stmts.append(f'INSERT INTO anime_available_languages ("order", parent_id, value) VALUES {vals};')
    stmts.append("COMMIT;")
    psql("\n".join(stmts), read=False)
    print(f"✓ {len(new)} Anime um deutschen Dub (Wikipedia) ergänzt.")


if __name__ == "__main__":
    main()
