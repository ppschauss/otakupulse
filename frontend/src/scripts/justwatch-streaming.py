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

Aufruf:  python3 src/scripts/justwatch-streaming.py                 (voll, alle Anime — additiv)
         python3 src/scripts/justwatch-streaming.py --recent 3      (nur Titel der letzten 3 Tage — täglich, additiv)
         python3 src/scripts/justwatch-streaming.py --only-missing  (nur Titel ohne Anbieter — additiv)
         python3 src/scripts/justwatch-streaming.py --stale 250     (rollierend: die 250 am längsten nicht
                                                                      geprüften Titel AUTORITATIV neu abgleichen
                                                                      — Anbieter hinzufügen UND entfernen — und
                                                                      streaming_checked_at stempeln. Für den Cron:
                                                                      rotiert über viele kleine Läufe den ganzen
                                                                      Katalog durch, ohne die Quelle zu hämmern.)

Modi-Unterschied: --recent/--only-missing/voll sind ADDITIV (ergänzen nur, löschen nie —
robust gegen Fehl-Matches). --stale ist AUTORITATIV auf gematchten Titeln (spiegelt den
echten JustWatch-Stand, entfernt also auch verschwundene Anbieter). Bei fehlendem Titel-
Match wird der Bestand NIE angetastet.
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


def load_anime(recent_days=None, stale_limit=None):
    # Optional nur kürzlich hinzugefügte Titel (täglicher Lauf) ODER die am
    # längsten nicht geprüften N (rollierender --stale-Refresh, NULL zuerst).
    where = ""
    if recent_days:
        where = f" WHERE a.created_at > now() - interval '{int(recent_days)} days'"
    tail = ""
    if stale_limit:
        tail = f" ORDER BY a.streaming_checked_at ASC NULLS FIRST LIMIT {int(stale_limit)}"
    rows = json.loads(psql(
        "SELECT COALESCE(json_agg(json_build_object('id',s.id,'en',s.en,"
        "'ro',s.ro,'na',s.na)),'[]') FROM (SELECT a.id, a.title_english en, "
        f"a.title_romaji ro, a.title_native na FROM anime a{where}{tail}) s;"
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
        return False  # kein sicherer Titel-Match → Aufrufer lässt den Bestand unangetastet
    slugs = set()
    for o in best.get("offers", []) or []:
        if o.get("monetizationType") not in STREAM_MONETIZATION:
            continue
        cn = (o.get("package") or {}).get("clearName", "")
        slug = CLEARNAME_TO_SLUG.get(cn.lower())
        if slug:
            slugs.add(slug)
    return slugs


def _arg(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        return sys.argv[i + 1] if i + 1 < len(sys.argv) else default
    return default


def main():
    recent = _arg("--recent")
    stale = _arg("--stale")
    # --stale = rollierender Refresh: die N am längsten nicht geprüften Titel
    # AUTORITATIV neu abgleichen (Anbieter hinzufügen UND entfernen) + stempeln.
    authoritative = bool(stale)
    print("→ Lade Anime + vorhandene Anbieter …")
    anime = load_anime(recent_days=recent, stale_limit=stale)
    if recent:
        print(f"  --recent {recent}: {len(anime)} Titel der letzten {recent} Tage.")
    if stale:
        print(f"  --stale {stale}: {len(anime)} am längsten nicht geprüfte Titel.")
    print(f"  {len(anime)} Anime.")
    if not anime:
        print("  Nichts zu tun.")
        return

    # --only-missing: nur Anime OHNE bisherige Anbieter abfragen (für den
    # täglichen Lauf nach dem Sync — billig, deckt neu importierte Titel ab).
    if "--only-missing" in sys.argv:
        before = len(anime)
        anime = [a for a in anime if not a["have"]]
        print(f"  --only-missing: {len(anime)} ohne Anbieter (von {before}).")
        if not anime:
            print("  Nichts zu tun.")
            return

    results, added, removed, errors, nomatch, done = {}, 0, 0, 0, 0, 0
    checked_ids = []  # alle definitiv geprüften (Match ODER No-Match, NICHT Fehler)

    def worker(a):
        s = requests.Session(impersonate=IMPERSONATE)
        return a, providers_for(s, a)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futs = [ex.submit(worker, a) for a in anime]
        for f in as_completed(futs):
            a, found = f.result()
            done += 1
            if found is None:
                errors += 1  # API-Fehler → NICHT stempeln, nächste Runde erneut
            else:
                checked_ids.append(a["id"])
                if found is False:
                    nomatch += 1  # kein sicherer Match → Bestand nicht anfassen
                elif authoritative:
                    if set(found) != a["have"]:
                        results[a["id"]] = set(found)  # exakt auf JW-Stand setzen
                        added += len(found - a["have"])
                        removed += len(a["have"] - found)
                else:
                    new = found - a["have"]
                    if new:
                        results[a["id"]] = a["have"] | found  # additiv: nur ergänzen
                        added += len(new)
            if done % 200 == 0:
                print(f"  {done}/{len(anime)} … (geändert: {len(results)})")

    if authoritative:
        print(f"  Fertig: {len(results)} geändert (+{added} / -{removed} Anbieter), "
              f"{nomatch} ohne Match, {errors} Fehler.")
    else:
        print(f"  Fertig: {len(results)} Anime erweitert, {added} neue Anbieter-Zuordnungen, {errors} Fehler.")

    if results:
        print("→ Schreibe streamingProviders …")
        stmts = ["BEGIN;"]
        for aid, slugs in results.items():
            ordered = sorted(slugs)
            stmts.append(f"DELETE FROM anime_streaming_providers WHERE parent_id = {aid};")
            if ordered:  # leeres Set (autoritativ „nirgends mehr") → nur löschen
                vals = ",".join(f"({i+1}, {aid}, '{s}'::enum_anime_streaming_providers)" for i, s in enumerate(ordered))
                stmts.append(f'INSERT INTO anime_streaming_providers ("order", parent_id, value) VALUES {vals};')
        stmts.append("COMMIT;")
        psql("\n".join(stmts), read=False)
        print(f"✓ {len(results)} Anime aktualisiert.")

    # Rollierender Refresh: alle geprüften Titel stempeln (auch unveränderte /
    # ohne Match), damit die Rotation weiterläuft. Fehler bleiben ungestempelt.
    if authoritative and checked_ids:
        ids = ",".join(str(i) for i in checked_ids)
        psql(f"UPDATE anime SET streaming_checked_at = now() WHERE id IN ({ids});", read=False)
        print(f"✓ {len(checked_ids)} Titel als geprüft markiert (rollierend).")


if __name__ == "__main__":
    main()
