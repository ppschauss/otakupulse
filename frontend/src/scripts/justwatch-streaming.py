#!/usr/bin/env python3
"""
JustWatch-Streaming-Sync ("Wer streamt es?" — volle Anbieter-Breite, DE).

AniList kennt nur einen Teil der Streaming-Links. JustWatch aggregiert ALLE
DE-Anbieter (Netflix, Amazon, Disney+, WOW, Joyn, RTL+, Crunchyroll …). Dieses
Skript sucht jeden Anime bei JustWatch (Region DE), matcht per Titel-Ähnlichkeit
und schreibt die gefundenen Anbieter (nur FLATRATE/FREE/ADS — echtes Streaming,
kein Kauf/Verleih) ins normalisierte Feld `streamingProviders` (gemerged).

Hinweis: JustWatch liefert KEINE Audio-/Dub-Sprache — nur Verfügbarkeit.
Für Dub siehe `crunchyroll-dub.py`.

WICHTIG: Läuft auf dem HOST. `pip install curl_cffi` + `docker`. Grau-Zone
(inoffizielle GraphQL-API), konservativ rate-limitiert, idempotent.

Aufruf:  python3 src/scripts/justwatch-streaming.py
"""
import json
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
import re

try:
    from curl_cffi import requests
except ImportError:
    sys.exit("Fehlt: pip install curl_cffi")

DB_CONTAINER = "otakupulse-db"
GQL = "https://apis.justwatch.com/graphql"
IMPERSONATE = "chrome124"
MAX_WORKERS = 8
STREAM_MONETIZATION = {"FLATRATE", "FREE", "ADS"}

# JustWatch-`clearName` -> unser Provider-Slug (muss zu lib/streaming.ts passen).
CLEARNAME_TO_SLUG = {
    "crunchyroll": "crunchyroll",
    "crunchyroll amazon channel": "crunchyroll",
    "wakanim": "crunchyroll",
    "netflix": "netflix",
    "netflix basic with ads": "netflix",
    "amazon prime video": "amazon-prime-video",
    "amazon prime video with ads": "amazon-prime-video",
    "disney plus": "disney-plus",
    "wow": "wow",
    "sky go": "wow",
    "joyn": "joyn",
    "joyn plus": "joyn",
    "rtl+": "rtl-plus",
    "anime on demand": "anime-on-demand",
    "paramount plus": "paramount-plus",
    "paramount+": "paramount-plus",
    "apple tv plus": "apple-tv",
    "apple tv+": "apple-tv",
    "magenta tv": "magenta-tv",
    "magentatv": "magenta-tv",
    "hidive": "hidive",
}

SEARCH_Q = """
query($c:Country!,$l:Language!,$q:String!){
  popularTitles(country:$c,first:5,filter:{searchQuery:$q}){
    edges{node{
      objectType
      content(country:$c,language:$l){ title originalTitle }
      offers(country:$c,platform:WEB){ monetizationType package{clearName} }
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


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower()) if s else ""


def load_anime():
    rows = json.loads(psql(
        "SELECT COALESCE(json_agg(json_build_object('id',a.id,'en',a.title_english,"
        "'ro',a.title_romaji,'na',a.title_native)),'[]') FROM anime a;"
    ).strip() or "[]")
    anime = {r["id"]: {"id": r["id"], "titles": [r.get("en") or "", r.get("ro") or "", r.get("na") or ""], "have": set()}
             for r in rows}
    # bereits gesetzte Provider (zum Mergen)
    prov = json.loads(psql(
        "SELECT COALESCE(json_agg(json_build_object('pid',parent_id,'v',value)),'[]') "
        "FROM anime_streaming_providers;"
    ).strip() or "[]")
    for p in prov:
        a = anime.get(p["pid"])
        if a:
            a["have"].add(p["v"])
    return list(anime.values())


def api_post(session, payload):
    for attempt in range(4):
        r = session.post(GQL, json=payload, headers={"Content-Type": "application/json"},
                         impersonate=IMPERSONATE, timeout=30)
        if r.status_code == 429:
            time.sleep(2 ** attempt)
            continue
        return r
    return r


def providers_for(session, a):
    """JustWatch-Anbieter-Slugs für einen Anime (best match) oder leer."""
    query = next((t for t in a["titles"] if t.strip()), "")
    if not query:
        return set()
    r = api_post(session, {"query": SEARCH_Q,
                           "variables": {"c": "DE", "l": "de", "q": query}})
    if r.status_code != 200:
        return None
    data = (r.json().get("data") or {}).get("popularTitles") or {}
    our = [norm(t) for t in a["titles"] if t.strip()]
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
    if not best or best_score < 0.90:
        return set()
    slugs = set()
    for o in best.get("offers", []) or []:
        if o.get("monetizationType") not in STREAM_MONETIZATION:
            continue
        cn = (o.get("package") or {}).get("clearName", "")
        slug = CLEARNAME_TO_SLUG.get(cn.lower())
        if slug:
            slugs.add(slug)
    return slugs


def main():
    print("→ Lade Anime + vorhandene Anbieter …")
    anime = load_anime()
    print(f"  {len(anime)} Anime.")

    results, added, errors, done = {}, 0, 0, 0

    def worker(a):
        s = requests.Session(impersonate=IMPERSONATE)
        return a, providers_for(s, a)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futs = [ex.submit(worker, a) for a in anime]
        for f in as_completed(futs):
            a, found = f.result()
            done += 1
            if found is None:
                errors += 1
            elif found:
                merged = a["have"] | found
                new = found - a["have"]
                if new:
                    results[a["id"]] = merged
                    added += len(new)
            if done % 200 == 0:
                print(f"  {done}/{len(anime)} … (Anime mit neuen Anbietern: {len(results)})")

    print(f"  Fertig: {len(results)} Anime erweitert, {added} neue Anbieter-Zuordnungen, {errors} Fehler.")
    if not results:
        return

    print("→ Schreibe streamingProviders …")
    stmts = ["BEGIN;"]
    for aid, slugs in results.items():
        ordered = sorted(slugs)
        stmts.append(f"DELETE FROM anime_streaming_providers WHERE parent_id = {aid};")
        vals = ",".join(f"({i+1}, {aid}, '{s}'::enum_anime_streaming_providers)" for i, s in enumerate(ordered))
        stmts.append(f'INSERT INTO anime_streaming_providers ("order", parent_id, value) VALUES {vals};')
    stmts.append("COMMIT;")
    psql("\n".join(stmts), read=False)
    print(f"✓ {len(results)} Anime aktualisiert.")


if __name__ == "__main__":
    main()
