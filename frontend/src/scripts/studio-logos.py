#!/usr/bin/env python3
"""
Studio-Logos & Websites aus Wikidata (legal: Commons/CC, Daten CC0).

Für jedes Studio: Wikidata-Item per Namenssuche finden, das (a) im Label/Alias
zum Studionamen passt UND (b) eine Organisation ist (instance-of Animationsstudio
/ Filmproduktion / Unternehmen). Übernimmt P154 (Logo → Wikimedia-Commons-URL) und
P856 (offizielle Website). Schreibt `studios.logo_url` / `studios.website`.

Verlinkung im Frontend: ausgehende Studio-Links bekommen rel="nofollow noopener".

WICHTIG: Läuft auf dem HOST. `pip install curl_cffi` + `docker`. Idempotent.
Aufruf:  python3 src/scripts/studio-logos.py
"""
import json
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import quote

try:
    from curl_cffi import requests
except ImportError:
    sys.exit("Fehlt: pip install curl_cffi")

DB_CONTAINER = "otakupulse-db"
WD_API = "https://www.wikidata.org/w/api.php"
UA = {"User-Agent": "OtakuPulse/1.0 (Anime-DB; research)"}
IMPERSONATE = "chrome124"
MAX_WORKERS = 3

# instance-of (P31) Klassen, die wir als „Organisation/Studio" akzeptieren.
ORG_CLASSES = {
    "Q1107679",   # animation studio
    "Q1762059",   # film production company
    "Q1320047",   # video game developer (manche Studios)
    "Q4830453",   # business
    "Q891723",    # public company
    "Q1417451",   # kabushiki gaisha
    "Q18127",     # record label
    "Q2085381",   # publisher
    "Q210167",    # video game developer
    "Q1137109",   # animation
    "Q659194",    # media company / Unterhaltungsunternehmen
}


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


def wd_get(session, params):
    """Wikidata-API mit Retry/Backoff (429/5xx). None bei dauerhaftem Fehler."""
    params = {**params, "format": "json"}
    for attempt in range(5):
        try:
            r = session.get(WD_API, params=params, headers=UA, impersonate=IMPERSONATE, timeout=30)
        except Exception:
            time.sleep(1.5 * (attempt + 1))
            continue
        if r.status_code == 429:
            wait = float(r.headers.get("retry-after", 0) or 0) or 2 ** attempt
            time.sleep(wait + 0.5)
            continue
        if r.status_code >= 500:
            time.sleep(2 ** attempt)
            continue
        try:
            return r.json()
        except Exception:
            return None
    return None


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def load_studios():
    rows = json.loads(psql(
        "SELECT COALESCE(json_agg(json_build_object('id',id,'name',name,'web',website)),'[]') FROM studios;"
    ).strip() or "[]")
    return rows


def commons_url(filename: str) -> str:
    return f"https://commons.wikimedia.org/wiki/Special:FilePath/{quote(filename.replace(' ', '_'))}?width=240"


def resolve(session, name: str):
    """(logo_url, website) für ein Studio oder (None, None)."""
    target = norm(name)
    r = wd_get(session, {"action": "wbsearchentities", "search": name, "language": "en", "type": "item", "limit": 7})
    if not r:
        return None, None

    # Kandidaten, deren Label/Alias zum Studionamen passt (vor dem teuren Entity-Fetch).
    cand_ids = []
    for hit in r.get("search", []):
        label = norm(hit.get("label"))
        matchtxt = norm((hit.get("match") or {}).get("text"))
        if label == target or matchtxt == target or (len(target) >= 5 and (target in label or label in target) and label):
            cand_ids.append(hit["id"])
    if not cand_ids:
        return None, None

    for qid in cand_ids[:4]:
        j = wd_get(session, {"action": "wbgetentities", "ids": qid, "props": "claims"})
        if not j or qid not in j.get("entities", {}):
            continue
        cl = j["entities"][qid].get("claims", {})
        p31 = {c["mainsnak"]["datavalue"]["value"]["id"]
               for c in cl.get("P31", []) if c["mainsnak"].get("datavalue")}
        if not (p31 & ORG_CLASSES):
            continue
        logo = None
        if cl.get("P154"):
            v = cl["P154"][0].get("mainsnak", {}).get("datavalue", {}).get("value")
            if v:
                logo = commons_url(v)
        site = None
        if cl.get("P856"):
            site = cl["P856"][0].get("mainsnak", {}).get("datavalue", {}).get("value")
        if logo or site:
            return logo, site
    return None, None


def main():
    studios = load_studios()
    print(f"→ {len(studios)} Studios. Suche Logos/Websites bei Wikidata …")

    results = {}
    done = logos = sites = 0

    def worker(st):
        s = requests.Session(impersonate=IMPERSONATE)
        logo, site = resolve(s, st["name"])
        return st, logo, site

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futs = [ex.submit(worker, st) for st in studios]
        for f in as_completed(futs):
            st, logo, site = f.result()
            done += 1
            upd = {}
            if logo:
                upd["logo_url"] = logo
                logos += 1
            if site and not st.get("web"):
                upd["website"] = site
                sites += 1
            if upd:
                results[st["id"]] = upd
            if done % 100 == 0:
                print(f"  {done}/{len(studios)} … ({logos} Logos, {sites} Websites)")

    print(f"  Fertig: {logos} Logos, {sites} Websites für {len(results)} Studios.")
    if not results:
        return

    print("→ Schreibe in DB …")
    stmts = ["BEGIN;"]
    for sid, upd in results.items():
        sets = ", ".join(f"{k} = '{sql_escape(v)}'" for k, v in upd.items())
        stmts.append(f"UPDATE studios SET {sets} WHERE id = {sid};")
    stmts.append("COMMIT;")
    psql("\n".join(stmts), read=False)
    print(f"✓ {len(results)} Studios aktualisiert.")


if __name__ == "__main__":
    main()
