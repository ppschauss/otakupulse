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
         python3 src/scripts/crunchyroll-dub.py --availability [--dry-run]
           Verfügbarkeits-Modus: belegt laufende Titel (RELEASING + laufender und
           vorheriger Jahrgang) direkt bei Crunchyroll (`confirmed`, `source='crunchyroll'`)
           und schreibt über `build_catalog_sql` des JustWatch-Katalog-Skripts.
           Am Ende eines ERFOLGREICHEN Durchlaufs räumt der Frische-Verfall
           Crunchyroll-Zeilen ab, die seit `AVAIL_STALE_DAYS` Tagen nicht mehr bestätigt
           wurden — der einzige Löschweg für Fortsetzungsstaffeln.
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


def resolve_series(session, token, a: dict) -> tuple[dict | None, str]:
    """(serien_eintrag, methode). Der Eintrag ist die Crunchyroll-Serie mit gesetzter
    `id`; `None` bei Fehler (Methode `err`) oder wenn es keinen/zu schwachen Treffer gibt.

    Das ist die Auflösung, die früher in `resolve` stand — herausgelöst, damit der
    Verfügbarkeits-Modus dieselbe Titelzuordnung mit denselben Schwellen benutzt und
    zusätzlich die Serien-ID (für den Deep-Link) bekommt. `resolve` ruft diese Funktion
    und liefert unverändert die Dub-Sprachen."""
    # A) Direkter Serien-Treffer
    if a["series_id"]:
        r = api_get(session, token, SERIES_API.format(sid=a["series_id"]))
        if r.status_code == 200:
            d = dict((r.json().get("data") or [{}])[0])
            d.setdefault("id", a["series_id"])
            return d, "id"
        if r.status_code != 404:
            return None, "err"
        # 404 -> Serie weg, weiter zur Suche

    # B) Suche per Titel
    query = next((t for t in a["titles"] if t.strip()), "")
    if not query:
        return None, "no-title"
    r = api_get(session, token, SEARCH_API, params={"q": query, "n": 6, "type": "series", "locale": "de-DE"})
    if r.status_code != 200:
        return None, "err"

    our_norm = [norm(t) for t in a["titles"] if t.strip()]
    best, best_score, best_exact = None, 0.0, False
    for grp in r.json().get("data", []):
        if grp.get("type") != "series":
            continue
        for it in grp.get("items", []):
            c_title, c_slug = norm(it.get("title")), norm(it.get("slug_title"))
            # Slug-Exakttreffer (deckt alte /<slug>-Links ab) = höchste Sicherheit.
            exact = bool(c_slug and c_slug in a["cr_slugs"])
            if exact:
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
                best, best_score, best_exact = it, score, exact

    if not best:
        return None, "no-match"
    # Schwelle: bekannte CR-Titel großzügiger, sonst strenger (gegen Fehltreffer).
    threshold = 0.80 if a.get("has_cr_link") else 0.88
    if best_score < threshold:
        return None, "weak"
    # Die Herkunft des Treffers wandert im Eintrag mit (Kopie, `resolve` liest sie nicht):
    # nur ein Slug-Exakttreffer ist ein Beleg, ein Ähnlichkeitstreffer eine Schätzung.
    return {**best, "_slug_exact": best_exact}, "search"


def resolve(session, token, a: dict) -> tuple[list[str] | None, str]:
    """(langs, methode). langs=None bei Fehler, [] wenn kein/zu schwacher Treffer."""
    entry, method = resolve_series(session, token, a)
    if entry is None:
        return (None if method == "err" else []), method
    if method == "id":
        return locales_to_langs(entry.get("audio_locales"), entry.get("subtitle_locales")), "id"
    md = entry.get("series_metadata", {})
    return locales_to_langs(md.get("audio_locales"), md.get("subtitle_locales")), "search"


# --- Verfügbarkeits-Modus (Aufgabe 14) ---------------------------------------------
# Dieselbe Content-API, die die Dub-Sprachen liefert, beantwortet auch "läuft die
# Serie bei Crunchyroll Deutschland?". Das ist eine BELEGTE Angabe (`confirmed`,
# `source='crunchyroll'`) und ersetzt die von JustWatch geerbte, unbestätigte Zeile bei
# laufenden Fortsetzungsstaffeln. Der Dub-Lauf (`main`) bleibt davon unberührt.

AVAIL_PROVIDER = "crunchyroll"
SERIES_LINK = "https://www.crunchyroll.com/de/series/{sid}"
# Serien-IDs sind Großbuchstaben + Ziffern (`SERIES_RE`); alles andere gehört weder in
# eine URL noch in ein SQL-Statement.
SERIES_ID_RE = re.compile(r"^[A-Z0-9]+$")
# Crunchyroll-Locale -> Kurzcode der Angebotszeilen (`AUDIO_TO_LANG`/`SUB_TO_LANG` im
# JustWatch-Skript kennen genau diese Codes). Andere Sprachen werden nicht aufgeführt.
AUDIO_CODES = {"de-DE": "de", "en-US": "en", "ja-JP": "ja"}
SUB_CODES = {"de-DE": "de", "en-US": "en"}


def _codes(locales, table) -> str:
    return ",".join(sorted({table[l] for l in (locales or []) if l in table}))


def _entry(js) -> dict:
    data = js.get("data") if isinstance(js, dict) else None
    return data[0] if data and isinstance(data[0], dict) else {}


def availability_from_series(series_json, season_json=None) -> list[dict]:
    """Angebotszeile(n) aus einer Crunchyroll-Serien-Antwort (`{"data": [...]}`).

    Rein: kein Netz, keine DB. Das Ergebnis hat die Form, die `build_catalog_sql`
    erwartet (`audio`/`subs` als Komma-Strings der Kurzcodes, `confidence`, `source`).

    Verworfen wird (leere Liste), wenn
      - die Antwort leer ist,
      - keine brauchbare Serien-ID da ist: ohne sie gäbe es keinen Deep-Link
        (`/de/series/<id>`), und "lieber nicht gelistet als ein Link auf eine
        Startseite",
      - weder Audio- noch Untertitelsprache gemeldet wird: eine Serie ohne jede Sprache
        ist im deutschen Katalog nicht abspielbar.

    `season_json` (optional, Antwort der Staffel-Schnittstelle) präzisiert Sprachen und
    Episodenzahl für eine einzelne Staffel; ohne sie gilt die Serien-Ebene.
    Preis ist immer `flatrate`: Crunchyroll ist hier Abo-Angebot."""
    e = _entry(series_json)
    if not e:
        return []
    sid = str(e.get("id") or "").strip()
    if not SERIES_ID_RE.match(sid):
        return []
    md = e.get("series_metadata") or e
    audio_loc, sub_loc = md.get("audio_locales"), md.get("subtitle_locales")
    episodes = md.get("episode_count")
    se = _entry(season_json)
    if se:
        audio_loc = se.get("audio_locales") or audio_loc
        sub_loc = se.get("subtitle_locales") or sub_loc
        episodes = se.get("number_of_episodes") or episodes
    if not audio_loc and not sub_loc:
        return []
    return [{
        "provider": AVAIL_PROVIDER,
        "monetization": "flatrate",
        "url": SERIES_LINK.format(sid=sid),
        "audio": _codes(audio_loc, AUDIO_CODES),
        "subs": _codes(sub_loc, SUB_CODES),
        "seasons": md.get("season_count"),
        "episodes": episodes,
        "available_to": None,
        "confidence": "confirmed",
        "source": "crunchyroll",
    }]


def in_availability_scope(status, year, current_year) -> bool:
    """Umfang des Verfügbarkeits-Modus: `RELEASING` plus laufender und vorheriger
    Jahrgang — NICHT der Gesamtkatalog. Der Token ist ein anonymer Web-Client-Token in
    einer Grauzone; 11.000 Suchanfragen je Runde würden auch den Dub-Sync in eine Sperre
    ziehen. Die Breite liefert der JustWatch-Katalog-Abgleich."""
    if status == "RELEASING":
        return True
    try:
        return year is not None and int(year) >= current_year - 1
    except (TypeError, ValueError):
        return False


def _catalog_module():
    """Das JustWatch-Katalog-Skript (Bindestrich im Dateinamen), relativ zu DIESER Datei.
    Erst im Verfügbarkeits-Modus geladen — der Dub-Lauf braucht es nicht."""
    import importlib.util
    from pathlib import Path
    path = Path(__file__).resolve().parent / "justwatch-catalog.py"
    spec = importlib.util.spec_from_file_location("justwatch_catalog", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def availability_sql(anime: dict, offers: list[dict], now_iso: str) -> list[str]:
    """SQL-Anweisungen für EINEN Titel über `build_catalog_sql` — oder `[]`.

    Argumentform von `build_catalog_sql`: `anime` ist ein Eintrag aus
    `load_all_anime()` (`id`, `offers` {(provider, monetization): first_seen_at},
    `manual`, `rejected` als Mengen solcher Paare); `offers` sind fertige Zeilen mit
    `audio`/`subs` als Komma-Strings (Mengen gingen ebenfalls), `confidence` und
    `source`; `now_iso` ein ISO-Zeitstempel.

    *** `only_provider='crunchyroll'` ist Pflicht. *** Ohne den Parameter ist
    `build_catalog_sql` autoritativ über ALLE Abo-/Werbe-/Gratis-Zeilen des Titels und
    löschte bei einer Quelle, die nur Crunchyroll kennt, Netflix, Prime und alle anderen.

    Ohne Angebot kommt `[]` zurück, nicht ein reines `DELETE`: "nicht gefunden" ist auch
    der Zustand eines fehlgeschlagenen Matches oder eines API-Fehlers und darf nichts
    löschen — pro Titel ist das die richtige Vorsicht, aber es ist KEIN Löschweg. Ein
    echtes Lizenzende entfernt deshalb nicht dieser Aufruf, sondern der Frische-Verfall
    am Ende des Durchlaufs (`expiry_sql`): nur er erreicht auch die Fortsetzungsstaffeln,
    die der JustWatch-Sweep nie anfasst (`match_node` trifft sie bewusst nie)."""
    mine = [o for o in offers if o.get("provider") == AVAIL_PROVIDER]
    if not mine:
        return []
    return _catalog_module().build_catalog_sql(anime, mine, now_iso, discovery=False,
                                               only_provider=AVAIL_PROVIDER)


# Frische-Verfall: wie viele Tage eine Crunchyroll-Zeile ohne neue Bestätigung überlebt.
# Jeder Lauf löscht und schreibt seine Zeilen neu, eine gepflegte Zeile trägt also immer
# ein frisches `last_seen_at`; eine nicht mehr bestätigte veraltet sichtbar. Sieben Tage
# bei täglichem Cron heißt: sechs ausgefallene Läufe in Folge sind geduldet, bevor ein
# Beleg verschwindet — und ein Lizenzende ist spätestens nach einer Woche weg.
AVAIL_STALE_DAYS = 7


def availability_complete(stats: dict, versucht: int, belegt: int) -> bool:
    """War DER GANZE Durchlauf erfolgreich genug, um Zeilen abräumen zu dürfen?

    Derselbe Begriff wie `run_complete` im Katalog-Skript, übertragen auf diesen Lauf:
      - `versucht == 0`: es wurde nichts abgefragt, also ist nichts belegt;
      - ein einziger Abruffehler (Methode `err`: HTTP 403/429 nach Backoff, 5xx) macht
        den Durchlauf unvollständig. Eine IP-Sperre mitten im Lauf sieht sonst aus wie
        "Crunchyroll führt den Titel nicht mehr";
      - `belegt == 0`: kein einziger Beleg im ganzen Durchlauf. Auslöser ist hier kein
        Netzwerkfehler, sondern eine stille Semantikänderung (Suche/Serien-API
        antworten mit HTTP 200 und leerer Liste) — genau die Falle, gegen die im
        Katalog-Skript `knoten > 0` steht.
    Die Token-Beschaffung scheitert davor laut (`raise_for_status`), der Lauf kommt dann
    gar nicht bis hierher."""
    if versucht <= 0 or belegt <= 0:
        return False
    return stats.get("err", 0) == 0


def expiry_sql(complete: bool) -> list[str]:
    """Frische-Verfall für `source = 'crunchyroll'` — oder `[]`.

    Der Löschweg, den es sonst nicht gibt: eine `confirmed`-Zeile auf einer
    Fortsetzungsstaffel erreicht weder der wöchentliche Sweep (`match_node` trifft die
    Fortsetzung bewusst nie) noch die Titelsuche (`build_sql` spart
    `source = 'crunchyroll'` aus) noch `--purge-unmatched`. Ohne diese Anweisung zeigte
    die Seite nach einem Lizenzende dauerhaft eine als BELEGT gekennzeichnete
    Verfügbarkeit samt Deep-Link, `WatchAction` und Platz in den Plattform-Listen.

    Eingegrenzt wird über `source`: fremde Quellen bleiben unberührt, für die ist der
    JustWatch-Abgleich autoritativ. Eine unbestätigte Crunchyroll-Zeile gibt es nicht
    (dieser Lauf schreibt ausschließlich Belege), auf `confidence` wird deshalb NICHT
    eingeschränkt — mit einer Ausnahme, und die ist dieselbe wie in `build_catalog_sql`:
    das VETO (`confidence = 'rejected'`) bleibt stehen. Der Lader erkennt ein Veto allein
    an `confidence`, unabhängig von `source` (`load_all_anime`); verwirft ein Redakteur
    die Crunchyroll-Zeile an Ort und Stelle, trägt die Veto-Zeile weiter
    `source = 'crunchyroll'`. Der Verfall löschte sie dann nach sieben Tagen, der nächste
    Lauf sähe kein Veto mehr und legte das Angebot wieder als Beleg an — das Veto hätte
    sich selbst gelöscht (Entscheidung 21). `IS DISTINCT FROM`, nie `<>`: der Altbestand
    trägt `confidence IS NULL` und muss erfasst bleiben.

    `last_seen_at IS NULL` gilt als veraltet, nicht als frisch. Dieser Lauf schreibt den
    Stempel immer mit, NULL kann also nur von Hand entstehen: `source` ist im Admin ein
    editierbares Select mit der Option `crunchyroll`, `lastSeenAt` ist nicht `required`.
    Ohne diesen Zweig wäre `NULL < now() - …` UNKNOWN, die Zeile bliebe liegen — und auf
    einer Fortsetzungsstaffel räumte sie niemand mehr ab (Sweep kein Match, Titelsuche
    spart `source='crunchyroll'` aus, Verfall greift nicht). Genau der Zustand, gegen den
    diese Funktion gebaut ist, nur über den redaktionellen Eingang. Wer eine Zeile von
    Hand setzt, nimmt `source='manual'` — die ist in beiden Schreibwegen ausgespart und
    bleibt dauerhaft stehen.

    `complete=False` erzeugt NICHTS (siehe `availability_complete`): ein Lauf, der an
    der Token-Beschaffung oder an 403/429 scheitert, darf keine belegten Zeilen
    abräumen."""
    if not complete:
        return []
    q = _catalog_module().q
    return [f"DELETE FROM anime_streaming_offers WHERE source = {q(AVAIL_PROVIDER)} "
            f"AND confidence IS DISTINCT FROM 'rejected' "
            f"AND (last_seen_at IS NULL "
            f"OR last_seen_at < now() - interval '{int(AVAIL_STALE_DAYS)} days');"]


def is_direct_evidence(series, method) -> bool:
    """Darf aus dieser Zuordnung eine `confirmed`-Zeile werden?

    `confirmed` ist ein Versprechen, eine Schätzung darf nicht so heißen. Belegt ist
    nur, was
      (a) über den EIGENEN `/series/<ID>`-Link des Titels aufgelöst wurde (Methode `id`:
          ein Redakteur hat genau diesen Eintrag dieser CR-Serie zugeordnet), oder
      (b) per exaktem `slug_title`-Treffer gefunden wurde (Zeichengleichheit).
    Reine Ähnlichkeitstreffer (Containment, `SequenceMatcher`) schreiben NICHTS — sie
    könnten die Fortsetzung auf die Serie der ersten Staffel abbilden. Für diese Titel
    bleibt der JustWatch-Weg mit seiner als `unconfirmed` gekennzeichneten Zeile."""
    if not series:
        return False
    return method == "id" or (method == "search" and bool(series.get("_slug_exact")))


def availability_main(dry_run: bool):
    """Verfügbarkeits-Modus: laufende Titel direkt bei Crunchyroll belegen.

    REIHENFOLGE (Cron, Aufgabe 15): dieser Lauf muss NACH dem JustWatch-Sweep kommen.
    Dessen `DELETE` löscht alle Abo-Zeilen des Titels unabhängig von `source` und legt
    für laufende Fortsetzungen wieder die geerbte `unconfirmed`-Zeile an; erst dieser
    Lauf stellt den Beleg wieder her. Der Sweep darf `source='crunchyroll'` bewusst
    NICHT aussparen, sonst könnte er für Titel im Crunchyroll-Umfang ein echtes
    Lizenzende nie mehr entfernen.

    LÖSCHEN kann dieser Lauf nur über den Frische-Verfall (`expiry_sql`), und er ist
    dafür die einzige Stelle: eine Fortsetzungsstaffel erreicht der Sweep nie
    (`match_node` trifft sie bewusst nicht), die Titelsuche spart `source='crunchyroll'`
    aus. Der Verfall hängt am Erfolgspfad (`availability_complete`) — ein Lauf, der an
    403/429 oder an leeren Antworten scheitert, räumt nichts ab.

    EINE Schleife mit demselben `MAX_WORKERS` wie der Dub-Lauf; sie läuft nur, wenn der
    Modus aufgerufen wird. Nicht gleichzeitig mit dem Dub-Lauf starten — beide teilen
    sich denselben Token und dasselbe Rate-Limit."""
    import datetime
    cat = _catalog_module()
    now = datetime.datetime.now(datetime.timezone.utc)
    now_iso, year = now.strftime("%Y-%m-%dT%H:%M:%SZ"), now.year

    print("→ Lade Titel + Bestandsangebote …")
    stock = {a["id"]: a for a in cat.load_all_anime()}
    scope = {i for i, a in stock.items() if in_availability_scope(a.get("status"), a.get("year"), year)}
    anime = [a for a in load_anime() if a["id"] in scope]
    print(f"  {len(anime)} von {len(stock)} Titeln im Umfang (RELEASING, Jahrgang {year - 1}/{year}).")

    sess = requests.Session(impersonate=IMPERSONATE)
    token = get_token(sess)
    stats: dict[str, int] = {}
    belegt: dict[int, list[dict]] = {}

    def worker(a):
        series, method = resolve_series(requests.Session(), token, a)
        offers = (availability_from_series({"data": [series]}, None)
                  if is_direct_evidence(series, method) else [])
        return a["id"], offers, method

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        for f in as_completed([ex.submit(worker, a) for a in anime]):
            aid, offers, method = f.result()
            stats[method] = stats.get(method, 0) + 1
            if offers:
                belegt[aid] = offers

    print(f"  Aufgelöst: {len(belegt)} belegt "
          f"(per ID: {stats.get('id', 0)}, per Suche: {stats.get('search', 0)}; "
          f"schwach: {stats.get('weak', 0)}, kein Match: {stats.get('no-match', 0)}, "
          f"Fehler: {stats.get('err', 0)}).")

    stmts, neu = ["BEGIN;"], []
    for aid, offers in belegt.items():
        sql = availability_sql(stock[aid], offers, now_iso)
        if sql:
            stmts += sql
            if (AVAIL_PROVIDER, "flatrate") not in stock[aid]["offers"]:
                neu.append(aid)
            print(f"    {stock[aid]['slug']}: crunchyroll confirmed -> {offers[0]['url']}")
    if neu and not dry_run:
        # Neue Angabe = inhaltliche Änderung (Sitemap-lastmod), wie im Katalog-Abgleich.
        stmts.append(f"UPDATE anime SET content_updated_at = now(), updated_at = now() "
                     f"WHERE id IN ({','.join(str(int(i)) for i in neu)});")
    # Frische-Verfall ZULETZT, nach allen Schreibvorgängen: die eben geschriebenen Zeilen
    # tragen `last_seen_at = now_iso` und bleiben damit stehen. Nur auf dem Erfolgspfad —
    # ein unvollständiger Durchlauf räumt nichts ab.
    complete = availability_complete(stats, len(anime), len(belegt))
    verfall = expiry_sql(complete)
    stmts += verfall
    stmts.append("COMMIT;")
    if not complete:
        print(f"  → Durchlauf unvollständig ({len(anime)} im Umfang, {len(belegt)} belegt, "
              f"{stats.get('err', 0)} Abruffehler): KEIN Frische-Verfall.")
    if dry_run:
        print(f"  Trockenlauf: nichts geschrieben ({len(belegt)} Titel, {len(neu)} mit neuem Crunchyroll-Paar"
              f"{', Verfall vorgesehen' if verfall else ''}).")
        return
    psql("\n".join(stmts), read=False)
    print(f"✓ {len(belegt)} Titel mit belegtem Crunchyroll-Angebot geschrieben ({len(neu)} neu)"
          f"{f'; Crunchyroll-Zeilen älter als {AVAIL_STALE_DAYS} Tage abgeräumt' if verfall else ''}.")


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
    if "--availability" in sys.argv:
        availability_main("--dry-run" in sys.argv)
    else:
        main()
