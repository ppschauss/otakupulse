#!/usr/bin/env python3
"""
JustWatch-Katalog-Abgleich — ABRUF und Paginierung ("Was läuft bei diesem Anbieter?").

Das Titelsuch-Skript `justwatch-streaming.py` fragt pro Titel "wo läuft das?":
11.061 Suchanfragen pro Katalogrunde, verteilt über zwölf Tage, und jeder
fehlgeschlagene Titel-Match lässt den Titel still ohne Anbieter (7.864 von 11.061
Titeln hatten deshalb keine Angabe). Dieses Skript dreht die Richtung um: pro
Anbieter wird dessen kompletter DE-Anime-Katalog geblättert — rund 14 Anbieter
statt 11.000 Titel.

Gemessen am 2026-11-09 (Genre `ani`, DE, FLATRATE/ADS/FREE):
  - `popularTitles` nimmt einen `packages`-Filter mit dem JustWatch-`shortName`
    und blättert über `pageInfo.endCursor` / `after`, 40 Treffer pro Seite.
    Aniverse (257 Serien) kostet 7 Requests.
  - Die Antwort enthält pro Serie ALLE Staffeln samt eigener Angebote,
    `audioLanguages` und `subtitleLanguages`. Staffel-Genauigkeit kostet also
    keine zusätzlichen Requests, nur größere Antworten.
  - `content.originalTitle` kommt in Romaji ("Shingeki no Kyojin") — genau das
    Feld, das wir als `title_romaji` führen; deutlich tragfähiger als die
    Rückwärtssuche über übersetzte Titel.
  - Katalogzahlen SHOW + MOVIE: Aniverse `ava` 257 + 87, Crunchyroll `cru`
    1349 + 163, ADN `adn` 206 + 22, Prime `amp` 361 + 247, Netflix `nfx`
    507 + 331, Disney+ `dnp` 274 + 575. Das Genre `ani` enthält auch
    West-Animation (Rick and Morty, South Park, Toy Story); die Zahlen sind nach
    oben verzerrt, für den Abruf ist das unerheblich — die Zuordnung (Aufgabe 9)
    entscheidet, was zu uns gehört.
  - `packages(country:DE)` liefert nur 161 Pakete und enthält die Amazon-Channels
    NICHT. Deshalb steht die Liste `PACKAGES` fest im Code, nicht aus jener Abfrage.

Zuständigkeit dieser Datei: Abruf und Paginierung (+ `--count-only`). Die Zuordnung
auf unsere Titel und das Schreiben der Angebote kommen in eigenen Schritten dazu;
hier wird nichts gematcht und die Datenbank nicht berührt.

Aufruf (HOST, `pip install curl_cffi`):
  python3 justwatch-catalog.py --count-only                 # alle Pakete, SHOW + MOVIE zählen
  python3 justwatch-catalog.py --count-only --packages ava,cru

Rate-Limit: dasselbe wie im Nachbarskript — 1 Worker, 1.2 s Pause, Backoff
(30, 60, 120) bei 403/429. Wir posten NICHT selbst, sondern nur über dessen
`api_post`, damit Pause und Backoff automatisch gelten. JustWatch sperrt die IP
für ~1 h, sobald zu viel Volumen kommt. Instanz-Sperre: `other_instance_running()`
erkennt beide JustWatch-Skripte gegenseitig.
"""
import importlib.util
import sys
from pathlib import Path

# Das Nachbarskript wird relativ zum EIGENEN Dateistandort gesucht, nicht zum
# Arbeitsverzeichnis — so läuft dieses Skript auch aus /tmp, solange beide Dateien
# im selben Ordner liegen.
_HERE = Path(__file__).resolve().parent


def _load_neighbor(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), _HERE / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


jw = _load_neighbor("justwatch-streaming")
api_post = jw.api_post
CLEARNAME_TO_SLUG = jw.CLEARNAME_TO_SLUG
MONETIZATION = jw.MONETIZATION
IMPERSONATE = jw.IMPERSONATE
psql = jw.psql  # für die späteren Schritte bereitgehalten; hier ungenutzt
other_instance_running = jw.other_instance_running

# JustWatch-`shortName` -> unser Provider-Slug (muss zu lib/streaming.ts passen).
# Alle am 2026-11-09 aus echten Angeboten ermittelt. Amazon-Channels und die
# Werbe-Tarife sind eigene Pakete und tragen denselben Slug wie ihr Direktanbieter.
PACKAGES = {
    "cru": "crunchyroll",          # Crunchyroll
    "cra": "crunchyroll",          # Crunchyroll Amazon Channel
    "ava": "aniverse",             # Aniverse Amazon Channel
    "adn": "adn",                  # Animation Digital Network
    "ada": "adn",                  # ADN Amazon Channel
    "amp": "amazon-prime-video",   # Amazon Prime Video
    "pva": "amazon-prime-video",   # Prime Video with Ads
    "nfx": "netflix",              # Netflix
    "nfa": "netflix",              # Netflix Standard with Ads
    "dnp": "disney-plus",          # Disney Plus
    "rps": "rtl-plus",             # RTL+
    "rlm": "rtl-plus",             # RTL+ Max Amazon Channel
    "jyn": "joyn",                 # Joyn
    "etv": "magenta-tv",           # MagentaTV
    "sko": "wow",                  # WOW
    "tog": "toggo",                # Toggo
    "mxx": "hbo-max",              # HBO Max
    "aho": "hbo-max",              # HBO Max Amazon Channel
    "ptv": "pluto-tv",             # Pluto TV
}

COUNTRY = "DE"
LANGUAGE = "de"
# Die Abfrage nach Monetarisierung filtert den KATALOG (nur Streaming), nicht die
# Angebotsliste je Titel — Kauf/Leih-Stores können also trotzdem in `offers` stehen.
CATALOG_MONETIZATION = ["FLATRATE", "ADS", "FREE"]
GENRE = "ani"
# Notbremse gegen Endlosschleifen bei kaputter Paginierung: größter gemessener
# Katalog (Crunchyroll, 1349 Serien) sind 34 Seiten; 200 lässt reichlich Luft.
MAX_PAGES = 200

_OFFER_FIELDS = """monetizationType standardWebURL elementCount audioLanguages subtitleLanguages availableTo
          package{clearName}"""

BROWSE_Q = """
query($c:Country!,$l:Language!,$after:String,$filter:TitleFilter){
  popularTitles(country:$c,first:40,after:$after,filter:$filter){
    totalCount
    pageInfo{ endCursor hasNextPage }
    edges{node{
      objectType
      content(country:$c,language:$l){ title originalTitle originalReleaseYear }
      offers(country:$c,platform:WEB){
        %(offer)s
      }
      ... on Show { seasons {
        content(country:$c,language:$l){ title seasonNumber originalReleaseYear }
        offers(country:$c,platform:WEB){
          %(offer)s
        }
      } }
    }}
  }
}""" % {"offer": _OFFER_FIELDS}


def _parse_offers(raw):
    """Roh-Angebote -> Liste. Verworfen werden Angebote ohne Deep-Link und ohne
    Mapping: lieber nicht gelistet als ein Link auf eine Startseite. Die
    Zusammenführung doppelter Anbieter (Direktanbieter + Amazon Channel) ist Sache
    der Zuordnung; `is_channel` liefert ihr dafür die nötige Unterscheidung."""
    out = []
    for o in raw or []:
        clear = ((o.get("package") or {}).get("clearName") or "")
        slug = CLEARNAME_TO_SLUG.get(clear.lower())
        monet = MONETIZATION.get(o.get("monetizationType"))
        url = o.get("standardWebURL")
        if not slug or not monet or not url:
            continue
        out.append({
            "provider": slug,
            "monetization": monet,
            "url": url,
            "is_channel": "amazon channel" in clear.lower(),
            "audio": list(o.get("audioLanguages") or []),
            "subs": list(o.get("subtitleLanguages") or []),
            "episodes": o.get("elementCount") or None,
            "available_to": o.get("availableTo") or None,
        })
    return out


def parse_node(node):
    """JustWatch-Knoten -> Dict mit Titel, Romaji-Originaltitel, Jahr, Typ, Angeboten
    und Staffeln (je mit eigenen Angeboten und Sprachen). Filme haben keine Staffeln."""
    content = node.get("content") or {}
    seasons = []
    for s in node.get("seasons") or []:
        sc = s.get("content") or {}
        seasons.append({
            "title": sc.get("title"),
            "number": sc.get("seasonNumber"),
            "year": sc.get("originalReleaseYear"),
            "offers": _parse_offers(s.get("offers")),
        })
    return {
        "title": content.get("title"),
        "original_title": content.get("originalTitle"),
        "year": content.get("originalReleaseYear"),
        "object_type": node.get("objectType"),
        "offers": _parse_offers(node.get("offers")),
        "seasons": seasons,
    }


def fetch_catalog(session, short, object_type):
    """Blättert den kompletten Katalog eines Pakets (`short`) für einen Objekttyp
    (`SHOW`/`MOVIE`). Gibt `(nodes, complete)` zurück: alle bisher gelesenen Roh-Knoten
    und ein Vollständigkeits-Flag.

    `complete` ist NUR dann True, wenn bis zur letzten Seite (`hasNextPage == False`)
    jede Antwort HTTP 200 war, kein `errors` trug und lesbar war. Ein abgebrochener
    Durchlauf darf nie als vollständig gelten: wer daraus ableitet "Titel steht nicht
    im Katalog", würde sonst den halben Katalog fälschlich als "in Deutschland nicht
    im Stream" verifizieren. Deshalb gilt auch als Abbruch: Netzwerkausnahme,
    kaputtes JSON, fehlendes `data`, "weitere Seite" ohne Cursor, wiederholter Cursor
    und Überschreiten von MAX_PAGES. Nach dem ersten Fehler wird nicht weitergeblättert
    (das Backoff bei 403/429 hat `api_post` bereits ausgeschöpft)."""
    flt = {"packages": [short], "objectTypes": [object_type], "genres": [GENRE],
           "monetizationTypes": CATALOG_MONETIZATION}
    nodes, after, seen = [], None, set()
    for _ in range(MAX_PAGES):
        payload = {"query": BROWSE_Q,
                   "variables": {"c": COUNTRY, "l": LANGUAGE, "after": after, "filter": flt}}
        try:
            r = api_post(session, payload)
            if r.status_code != 200:
                return nodes, False
            body = r.json()
        except Exception:
            return nodes, False
        if not isinstance(body, dict) or body.get("errors"):
            return nodes, False
        conn = (body.get("data") or {}).get("popularTitles")
        if not isinstance(conn, dict):
            return nodes, False
        edges = conn.get("edges") or []
        nodes += [e["node"] for e in edges if e.get("node")]
        if any(not e.get("node") for e in edges):
            # Eine Kante ohne Knoten wäre ein still verschluckter Titel: er würde später
            # als "nicht im Katalog" gelten und den Nachweis-Stempel erlauben. Die
            # übrigen Knoten behalten wir, den Durchlauf werten wir als unvollständig.
            return nodes, False
        info = conn.get("pageInfo") or {}
        if not info.get("hasNextPage"):
            return nodes, True
        after = info.get("endCursor")
        if not after or after in seen:
            return nodes, False  # Paginierung kaputt: lieber abbrechen als endlos blättern
        seen.add(after)
    return nodes, False


def count_only(shorts):
    """Zählt pro Paket SHOW und MOVIE; schreibt nichts. Unvollständige Abrufe werden
    markiert, damit man sie nicht für eine echte Katalogzahl hält."""
    sess = jw.session()
    all_complete = True
    for short in shorts:
        parts = []
        for typ in ("SHOW", "MOVIE"):
            nodes, complete = fetch_catalog(sess, short, typ)
            all_complete &= complete
            parts.append(f"{len(nodes)} {typ}" + ("" if complete else " (UNVOLLSTÄNDIG)"))
        print(f"{short} ({PACKAGES[short]}): " + " + ".join(parts), flush=True)
    return all_complete


def main():
    if "--count-only" not in sys.argv:
        sys.exit("Aufruf: justwatch-catalog.py --count-only [--packages ava,cru]")
    shorts = list(PACKAGES)
    if "--packages" in sys.argv:
        shorts = sys.argv[sys.argv.index("--packages") + 1].split(",")
        unknown = [s for s in shorts if s not in PACKAGES]
        if unknown:
            sys.exit(f"Unbekannte Pakete: {', '.join(unknown)}")
    if other_instance_running():
        print("→ Eine andere JustWatch-Instanz läuft bereits — Abbruch (Instanz-Sperre).")
        return
    sys.exit(0 if count_only(shorts) else 1)


if __name__ == "__main__":
    main()
