#!/usr/bin/env python3
"""
Crunchyroll-Dub-Sync (Sprach-Verfügbarkeit) — maximale Abdeckung.

Bestückt `anime_available_languages` mit echten Sprach-/Dub-Daten aus der
Crunchyroll-Content-API (`audio_locales`/`subtitle_locales`):
  de-DE Audio -> de-dub    de-DE Sub -> de-sub
  en-US Audio -> en-dub    en-US Sub -> en-sub
  ja-JP Audio -> ja

Zwei Wege zur Serie (so viele Titel wie möglich):
  A) Direkt: Anime mit modernem Crunchyroll-Link `/series/<ID>` -> Serien-API.
  B) Suche:  alle übrigen Anime -> Crunchyroll-Suche per Titel; Match über
     `slug_title` (deckt die alten `/<slug>`-Links exakt ab) oder Titel-Ähnlichkeit.
     Anime, die bereits einen (alten) Crunchyroll-Link haben, gelten als "auf CR
     bekannt" und werden großzügiger akzeptiert; Titel ganz ohne CR-Link strenger.

WICHTIG (siehe docs/BETRIEB.md):
- Läuft auf dem HOST: `pip install curl_cffi` (TLS gegen Cloudflare) + `docker` (DB).
- Host-IP sollte in DE liegen (Token-Land wird geprüft) -> deutscher Dub-Katalog.
- Grau-Zone: anonymer Web-Client-Token, konservativ rate-limitiert. Idempotent.

Aufruf:  python3 src/scripts/crunchyroll-dub.py
"""
import base64
import json
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
from urllib.parse import urlparse

try:
    from curl_cffi import requests
except ImportError:
    sys.exit("Fehlt: pip install curl_cffi  (TLS-Impersonation für Crunchyroll/Cloudflare)")

DB_CONTAINER = "otakupulse-db"
TOKEN_URL = "https://www.crunchyroll.com/auth/v1/token"
BASIC = "Basic " + base64.b64encode(b"cr_web:").decode()
SERIES_API = "https://www.crunchyroll.com/content/v2/cms/series/{sid}?locale=de-DE"
SEARCH_API = "https://www.crunchyroll.com/content/v2/discover/search"
IMPERSONATE = "chrome124"
MAX_WORKERS = 8

# Locale-Pfad-Präfixe in alten CR-URLs (dann ist der Slug das 2. Segment).
LOCALE_PREFIXES = {"de", "en-us", "en-gb", "es-es", "es-419", "fr-fr", "pt-br", "it-it", "ru-ru", "ar", "de-de"}
# Erste Segmente, die KEIN Serien-Slug sind.
NON_SLUG_FIRST = {"watch", "videos", "series", "search", "news", "games", "musicvideo", "concert"}


def psql(sql: str, read: bool = True) -> str:
    inner = 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
    if read:
        inner += " -t -A -F'|'"
    res = subprocess.run(["docker", "exec", "-i", DB_CONTAINER, "sh", "-c", inner],
                         input=sql, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"psql-Fehler: {res.stderr.strip()}")
    return res.stdout


def norm(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower()) if s else ""


def cr_slug_from_url(url: str) -> str | None:
    """Legacy-Serien-Slug aus einer alten CR-URL (oder None)."""
    try:
        parts = [p for p in urlparse(url).path.strip("/").split("/") if p]
    except Exception:
        return None
    if not parts:
        return None
    first = parts[0]
    if first in NON_SLUG_FIRST:
        return None
    if first in LOCALE_PREFIXES:
        return parts[1] if len(parts) > 1 else None
    return first


SERIES_RE = re.compile(r"/series/([A-Z0-9]+)")


def load_anime() -> list[dict]:
    """Alle Anime + Titel + ihre Crunchyroll-Links (JSON, delimiter-sicher)."""
    rows = json.loads(psql(
        "SELECT COALESCE(json_agg(json_build_object('id',a.id,'en',a.title_english,"
        "'ro',a.title_romaji,'na',a.title_native)),'[]') FROM anime a;"
    ).strip() or "[]")
    anime: dict[int, dict] = {}
    for r in rows:
        anime[r["id"]] = {
            "id": r["id"],
            "titles": [r.get("en") or "", r.get("ro") or "", r.get("na") or ""],
            "series_id": None,
            "cr_slugs": set(),
        }

    links = json.loads(psql(
        "SELECT COALESCE(json_agg(json_build_object('pid',e._parent_id,'url',e.url) "
        "ORDER BY e._parent_id, e._order),'[]') FROM anime_external_links e "
        "WHERE e.platform = 'Crunchyroll';"
    ).strip() or "[]")
    for l in links:
        a = anime.get(l["pid"])
        if not a:
            continue
        url = l["url"] or ""
        m = SERIES_RE.search(url)
        if m and not a["series_id"]:
            a["series_id"] = m.group(1)
        slug = cr_slug_from_url(url)
        if slug:
            a["cr_slugs"].add(norm(slug))
        a["has_cr_link"] = True
    return list(anime.values())


def get_token(session) -> str:
    r = session.post(TOKEN_URL,
                     headers={"Authorization": BASIC, "Content-Type": "application/x-www-form-urlencoded"},
                     data={"grant_type": "client_id"}, timeout=30)
    r.raise_for_status()
    data = r.json()
    payload = json.loads(base64.urlsafe_b64decode(data["access_token"].split(".")[1] + "=="))
    if payload.get("country") != "DE":
        print(f"⚠ Token-Land = {payload.get('country')} (nicht DE) — Ger-Dub evtl. unvollständig.", file=sys.stderr)
    return data["access_token"]


def locales_to_langs(audio, subs) -> list[str]:
    audio, subs = set(audio or []), set(subs or [])
    out = []
    if "ja-JP" in audio:
        out.append("ja")
    if "de-DE" in audio:
        out.append("de-dub")
    if "en-US" in audio:
        out.append("en-dub")
    if "de-DE" in subs:
        out.append("de-sub")
    if "en-US" in subs:
        out.append("en-sub")
    return out


def api_get(session, token, url, params=None):
    for attempt in range(4):
        r = session.get(url, params=params, headers={"Authorization": f"Bearer {token}"},
                        impersonate=IMPERSONATE, timeout=30)
        if r.status_code == 429:
            time.sleep(2 ** attempt)
            continue
        return r
    return r


def resolve(session, token, a: dict) -> tuple[list[str] | None, str]:
    """(langs, methode). langs=None bei Fehler, [] wenn kein/zu schwacher Treffer."""
    # A) Direkter Serien-Treffer
    if a["series_id"]:
        r = api_get(session, token, SERIES_API.format(sid=a["series_id"]))
        if r.status_code == 200:
            d = (r.json().get("data") or [{}])[0]
            return locales_to_langs(d.get("audio_locales"), d.get("subtitle_locales")), "id"
        if r.status_code != 404:
            return None, "err"
        # 404 -> Serie weg, weiter zur Suche

    # B) Suche per Titel
    query = next((t for t in a["titles"] if t.strip()), "")
    if not query:
        return [], "no-title"
    r = api_get(session, token, SEARCH_API, params={"q": query, "n": 6, "type": "series", "locale": "de-DE"})
    if r.status_code != 200:
        return None, "err"

    our_norm = [norm(t) for t in a["titles"] if t.strip()]
    best, best_score = None, 0.0
    for grp in r.json().get("data", []):
        if grp.get("type") != "series":
            continue
        for it in grp.get("items", []):
            c_title, c_slug = norm(it.get("title")), norm(it.get("slug_title"))
            # Slug-Exakttreffer (deckt alte /<slug>-Links ab) = höchste Sicherheit.
            if c_slug and c_slug in a["cr_slugs"]:
                score = 1.0
            else:
                score = 0.0
                for t in our_norm:
                    for c in (c_title, c_slug):
                        if not c:
                            continue
                        ratio = SequenceMatcher(None, t, c).ratio()
                        # Containment fängt Varianten wie "(2011)"/"Season 2" sicher ab
                        # (Mindestlänge gegen Kurz-/Allerwelts-Titel-Fehltreffer).
                        if len(t) >= 8 and (t in c or c in t):
                            ratio = max(ratio, 0.95)
                        score = max(score, ratio)
            if score > best_score:
                best, best_score = it, score

    if not best:
        return [], "no-match"
    # Schwelle: bekannte CR-Titel großzügiger, sonst strenger (gegen Fehltreffer).
    threshold = 0.80 if a.get("has_cr_link") else 0.88
    if best_score < threshold:
        return [], "weak"
    md = best.get("series_metadata", {})
    return locales_to_langs(md.get("audio_locales"), md.get("subtitle_locales")), "search"


def main():
    print("→ Lade Anime + Crunchyroll-Links …")
    anime = load_anime()
    with_id = sum(1 for a in anime if a["series_id"])
    with_link = sum(1 for a in anime if a.get("has_cr_link"))
    print(f"  {len(anime)} Anime — {with_link} mit CR-Link ({with_id} davon mit /series/<ID>).")

    sess = requests.Session(impersonate=IMPERSONATE)
    token = get_token(sess)
    print("  Anonymer Token geholt.")

    results: dict[int, list[str]] = {}
    stats = {"id": 0, "search": 0, "weak": 0, "no-match": 0, "no-title": 0, "err": 0}
    done = 0

    def worker(a):
        s = requests.Session()
        langs, method = resolve(s, token, a)
        return a["id"], langs, method

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futs = [ex.submit(worker, a) for a in anime]
        for f in as_completed(futs):
            aid, langs, method = f.result()
            done += 1
            stats[method] = stats.get(method, 0) + 1
            if langs:  # nur echte Treffer schreiben
                results[aid] = langs
            if done % 200 == 0:
                print(f"  {done}/{len(anime)} … (Treffer bisher: {len(results)})")

    dubs = sum(1 for v in results.values() if "de-dub" in v)
    en_dubs = sum(1 for v in results.values() if "en-dub" in v)
    print(f"  Auflösung fertig: {len(results)} Treffer "
          f"(per ID: {stats['id']}, per Suche: {stats['search']}; "
          f"verworfen schwach: {stats['weak']}, kein Match: {stats['no-match']}, Fehler: {stats['err']}).")
    print(f"  -> {dubs} mit Ger-Dub, {en_dubs} mit Eng-Dub.")

    print("→ Schreibe availableLanguages …")
    stmts = ["BEGIN;"]
    for aid, langs in results.items():
        ordered, seen = [], set()
        for lng in langs:
            if lng not in seen:
                seen.add(lng)
                ordered.append(lng)
        if not ordered:
            ordered = ["ja"]
        stmts.append(f"DELETE FROM anime_available_languages WHERE parent_id = {aid};")
        vals = ",".join(f"({i+1}, {aid}, '{l}'::enum_anime_available_languages)" for i, l in enumerate(ordered))
        stmts.append(f'INSERT INTO anime_available_languages ("order", parent_id, value) VALUES {vals};')
    stmts.append("COMMIT;")
    psql("\n".join(stmts), read=False)
    print(f"✓ {len(results)} Anime aktualisiert ({dubs} Ger-Dub, {en_dubs} Eng-Dub).")


if __name__ == "__main__":
    main()
