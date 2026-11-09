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

Zuständigkeit dieser Datei: Abruf, Paginierung, Zuordnung UND Schreiben.

Aufruf (HOST, `pip install curl_cffi`):
  python3 justwatch-catalog.py --count-only                 # alle Pakete, SHOW + MOVIE zählen
  python3 justwatch-catalog.py --count-only --packages ava,cru
  python3 justwatch-catalog.py --dry-run                    # Bericht, schreibt nichts
  python3 justwatch-catalog.py --discovery                  # erster echter Lauf: kein first_seen_at
  python3 justwatch-catalog.py --sweep                      # Regelbetrieb (wöchentlich per Cron)

Exit-Code: 0 = vollständiger Durchlauf, 1 = unvollständiger Durchlauf (dann wird KEIN
Nachweis gestempelt), 2 = gar nicht gelaufen, weil die Instanz-Sperre griff. Die drei
Fälle sind für einen Cron-Wrapper verschiedene Dinge: 1 ist ein Fehler, 2 ist bloß
Terminkollision. (Das Nachbarskript bleibt bei 0, damit sich das Verhalten des
laufenden Produktionsskripts nicht ändert.) `--packages` mit einer Teilmenge ist nie
ein vollständiger Durchlauf: so ein Lauf stempelt nicht und endet mit 1 — er ist ein
Diagnosewerkzeug, kein Betriebsmodus.

Was der Sweep NICHT anfasst: Kauf- und Leih-Angebote. Der Katalog-Abruf blättert nur
FLATRATE/ADS/FREE (`CATALOG_MONETIZATION`), also ist er auch nur dafür autoritativ —
Einzelheiten samt Messzahlen am `DELETE` in `build_catalog_sql`.

Rate-Limit: dasselbe wie im Nachbarskript — 1 Worker, 1.2 s Pause, Backoff
(30, 60, 120) bei 403/429. Wir posten NICHT selbst, sondern nur über dessen
`api_post`, damit Pause und Backoff automatisch gelten. JustWatch sperrt die IP
für ~1 h, sobald zu viel Volumen kommt. Instanz-Sperre: `other_instance_running()`
erkennt beide JustWatch-Skripte gegenseitig.
"""
import importlib.util
import json
import sys
import time
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
AUDIO_TO_LANG = jw.AUDIO_TO_LANG
SUB_TO_LANG = jw.SUB_TO_LANG
psql = jw.psql
q = jw.q
other_instance_running = jw.other_instance_running
# Die Vererbungsregel wohnt im Nachbarskript (sonst Importzyklus: jenes importiert
# nicht, dieses schon) und wird hier nur re-exportiert. Eine Regel, eine
# Implementierung — Aufgabe 11 benutzt sie von dort aus für die Titelsuche.
confidence_for = jw.confidence_for

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
# Dieselben Monetarisierungen in DB-Schreibweise — ABGELEITET, nicht getippt: wer den
# Abruf erweitert, erweitert damit automatisch den Rahmen, in dem der Sweep autoritativ
# löscht und schreibt. Beide dürfen nie auseinanderlaufen (siehe `build_catalog_sql`).
SWEEP_MONETIZATION = tuple(MONETIZATION[m] for m in CATALOG_MONETIZATION)
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


norm_variants = jw.norm_variants
title_base = jw.title_base

# --- Zuordnung auf unsere Titel ---------------------------------------------------
#
# Zuschnitt: ein Katalogknoten ist eine ganze SERIE mit allen Staffeln; unsere
# Datenbank führt Staffeln als eigene Titel (AniList schneidet so). `match_node`
# ordnet die Serie genau einem unserer Titel zu — dem Basistitel, dessen Romaji dem
# `originalTitle` entspricht — oder keinem. Fortsetzungsstaffeln ("… 2nd Season")
# werden bewusst NICHT getroffen: JustWatchs Staffelnummern sind nicht auf AniList
# abbildbar (One Piece: dort 23 Staffeln, S3 bis S17 mit originalReleaseYear 0;
# AniList schneidet nach Arcs). Sie bleiben der Titelsuche (`pick_season`) überlassen.

# Punkte je Treffertyp. Der Abstand zwischen den Stufen ist die Reihenfolge, nicht
# eine Wahrscheinlichkeit; nur die Rangfolge zählt (und Gleichstand = kein Match).
_SCORE_EXACT = 1.0         # eine Normalform von uns == eine Normalform des Knotens
_SCORE_BASE = 0.92         # gleicher Basistitel vor dem Untertitel-Trenner, nur Jahr +-1
_YEAR_BONUS = 0.03         # beide Jahre bekannt und Abstand <= 1: Beleg für dasselbe Werk
_YEAR_PENALTY = 0.15       # Abstand 2..4 (nur exakte Titel): bleibt möglich, verliert aber gegen jeden besseren
_YEAR_HARD_LIMIT = 5       # ab so vielen Jahren Abstand gilt es als anderes Werk
_BASE_MIN_LEN = 6          # kürzere Basistitel sind zu generisch ("Mono")


def _year(v):
    """Jahr als int oder None. JustWatch liefert 0 für "unbekannt" (One Piece S3-S17),
    unsere Datenbank NULL; beides ist "kein Jahr", nicht das Jahr 0."""
    try:
        y = int(v)
    except (TypeError, ValueError):
        return None
    return y if y > 0 else None


def _has_subtitle(s):
    """True, wenn der Titel einen Untertitel nach ":"/"-" trägt ("Wotakoi: Love is Hard…")."""
    return bool(title_base(s)) and title_base(s) not in norm_variants(s)


def _score_title(ours, node, year_diff):
    """Titelähnlichkeit eines unserer Anime (`ours`: Liste der vier Titel) zum Knoten.
    0.0 = kein Treffer. `year_diff` ist None, wenn eines der Jahre fehlt.

    Zwei Stufen, beide ausdrücklich eng:
      - exakt: gleiche Normalform (`norm_variants`, also auch Romaji-Doppelvokale,
        römische Staffelziffern und die CJK-Form aus Aufgabe 6).
      - Basistitel: beide Seiten tragen einen Untertitel, die Basis davor ist gleich
        und mindestens 6 Zeichen lang, die Jahre bekannt mit Abstand <= 1 (Wotakoi:
        der Untertitel ist je Sprache übersetzt). Ein Titel OHNE Untertitel passt nie
        auf einen mit — sonst träfe "Foo" auf "Foo: Part 2", eine Fortsetzung.
    Teilstring- und Ähnlichkeitsregeln gibt es hier absichtlich nicht: die Alt-Heuristik
    hatte "Hyouge Mono" auf "Mono" gematcht, und die Zuordnung schreibt später Anbieter
    an Titel. Bei Zweifel kein Match."""
    cand = [c for c in (node.get("original_title"), node.get("title")) if c]
    our = [t for t in ours if t]
    ours_forms = {v for t in our for v in norm_variants(t)}
    if any(v in ours_forms for c in cand for v in norm_variants(c)):
        return _SCORE_EXACT
    if year_diff is not None and year_diff <= 1:
        our_bases = {title_base(t) for t in our if _has_subtitle(t)}
        cand_bases = {title_base(c) for c in cand if _has_subtitle(c)}
        if any(len(b) >= _BASE_MIN_LEN for b in our_bases & cand_bases):
            return _SCORE_BASE
    return 0.0


def match_node(parsed, anime):
    """Ordnet einen geparsten Katalogknoten (`parse_node`) genau einem unserer Titel
    zu oder keinem. `anime`: Liste von Dicts mit `titles` (de, en, romaji, native),
    `year` und `want` (`SHOW`/`MOVIE`). Gibt das Anime-Dict oder None zurück.

    - `object_type` muss zu `want` passen: Film und Serie werden nie verwechselt.
    - Jahres-Abstufung (nur wenn beide Jahre bekannt; gleicher Titel kann ein anderes
      Werk sein — Netflix-Realserie "One Piece" 2023 gegen den Anime von 1999,
      "Suikoden" von 1973 gegen "Gensou Suikoden" 2026):
        Abstand 0-1 : Bonus, Titel-Treffer (exakt oder Basistitel) genügt
        Abstand 2-4 : nur ein exakter Titel, mit Abzug (der Treffer verliert gegen
                      jeden Kandidaten, der besser zum Jahr passt)
        Abstand >= 5: kein Match, auch bei exaktem Titel
      Fehlt ein Jahr, genügt ein exakter Titel ohne Bonus; er verliert damit gegen
      einen Kandidaten mit belegtem Jahr. Gemessen: nur 0,53 % unserer Titel haben
      kein Jahr, JustWatch führt 0 vor allem bei Langläufer-Staffeln, nicht bei Serien.
    - Mehrere Kandidaten mit gleichem Höchstscore -> None. Lieber nichts als der
      falsche Titel; ein Falschtreffer behauptet dem Besucher eine Verfügbarkeit,
      die es nicht gibt."""
    node_year = _year(parsed.get("year"))
    scored = []
    for a in anime:
        if parsed.get("object_type") != a.get("want"):
            continue
        our_year = _year(a.get("year"))
        # "Jahr 0 = unbekannt" hängt an ZWEI Stellen: `_year` macht 0 zu None, und der
        # Truthiness-Guard hier fängt eine durchgerutschte 0 ab. Gemessen: jede Stelle
        # allein ist redundant (Mutation nur an einer bleibt grün), erst beide zusammen
        # gelockert machen 0 zum Jahr mit 2000+ Jahren Abstand — das fängt
        # test_jahr_null_von_justwatch_gilt_als_unbekannt_nicht_als_jahr_null.
        diff = abs(node_year - our_year) if node_year and our_year else None
        if diff is not None and diff >= _YEAR_HARD_LIMIT:
            continue
        score = _score_title(a.get("titles") or [], parsed, diff)
        if not score:
            continue
        if diff is not None:
            score += _YEAR_BONUS if diff <= 1 else -_YEAR_PENALTY
        scored.append((score, a))
    if not scored:
        return None
    best = max(s for s, _ in scored)
    top = [a for s, a in scored if abs(s - best) < 1e-9]
    return top[0] if len(top) == 1 else None


def dedupe_offers(offers):
    """Eine Zeile pro `(provider, monetization)`.

    Derselbe Anbieter kommt bei JustWatch doppelt vor: als Direktanbieter und als
    Amazon-Channel ("Crunchyroll" / "Crunchyroll Amazon Channel"). Der Link des
    Direktanbieters gewinnt; ein Channel-Link ist nur Rückfall, wenn es keinen
    Direktlink gibt. Link, `is_channel` und Enddatum (`available_to`) kommen
    gemeinsam vom primären Angebot — ein Channel ergänzt Sprachen, überträgt aber
    nicht sein Enddatum auf den Direktanbieter. `audio` und `subs` werden vereinigt
    (als Mengen). Ein Schlüssel ganz ohne Deep-Link entfällt. (`_parse_offers` verwirft
    link-lose Angebote bereits vorher; hier ist das nur der Selbstschutz für Aufrufer,
    die Rohlisten übergeben.) Dieselbe Regel wie `aggregate_offers` in
    justwatch-streaming.py. Die Eingabe wird nicht verändert."""
    rows = {}
    for o in offers:
        key = (o["provider"], o["monetization"])
        row = rows.setdefault(key, {"primary": None, "audio": set(), "subs": set()})
        if o.get("url") and (row["primary"] is None
                             or (row["primary"].get("is_channel") and not o.get("is_channel"))):
            row["primary"] = o
        row["audio"] |= set(o.get("audio") or [])
        row["subs"] |= set(o.get("subs") or [])
    out = []
    for row in rows.values():
        if row["primary"] is None:
            continue  # ohne Deep-Link zeigen wir keinen Anbieter
        out.append({**row["primary"], "audio": row["audio"], "subs": row["subs"]})
    return out


def title_index(anime):
    """Nachschlagewerk „Normalform/Basistitel -> unsere Titel" für die Zuordnung.

    Ohne Index würde jeder Katalogknoten gegen alle 11.061 Titel gerechnet: rund
    6.000 Knoten mal 11.061 Titel mal `norm_variants` — Stunden statt Sekunden, und
    das bei laufendem Rate-Limit-Budget. Der Index liefert nur Kandidaten, die mit dem
    Knoten mindestens eine Normalform oder einen Basistitel teilen. Genau diese können
    in `_score_title` überhaupt einen Punktwert > 0 bekommen; alle anderen hätten 0 und
    würden verworfen. Die Auswahl von `match_node` — einschließlich „Gleichstand =
    kein Match" — bleibt damit unverändert (`candidates_for` ist eine Vorauswahl, keine
    zweite Match-Regel)."""
    idx = {}
    for a in anime:
        keys = set()
        for t in a.get("titles") or []:
            if not t:
                continue
            keys |= set(norm_variants(t))
            if _has_subtitle(t):
                keys.add("base:" + title_base(t))  # eigener Namensraum, damit ein
                # Basistitel nie mit einer Normalform kollidiert
        for k in keys:
            idx.setdefault(k, []).append(a)
    return idx


def candidates_for(parsed, idx):
    """Unsere Titel, die für diesen Knoten überhaupt in Frage kommen (siehe
    `title_index`). Reihenfolge ist stabil, Dubletten fallen über die id weg."""
    keys = set()
    for c in (parsed.get("original_title"), parsed.get("title")):
        if not c:
            continue
        keys |= set(norm_variants(c))
        if _has_subtitle(c):
            keys.add("base:" + title_base(c))
    out, seen = [], set()
    for k in sorted(keys):
        for a in idx.get(k, ()):
            if a["id"] not in seen:
                seen.add(a["id"])
                out.append(a)
    return out


# --- Lader ------------------------------------------------------------------------


def load_all_anime():
    """ALLE Titel mit allem, was die Zuordnung und das Schreiben brauchen.

    Der Katalog-Abgleich fragt nicht pro Titel, sondern pro Anbieter — er braucht
    deshalb den ganzen Bestand im Speicher, nicht eine Batch-Auswahl wie
    `load_anime()` im Nachbarskript.

    Kein `is_hentai`-Filter: der Schutz für Erwachsenen-Inhalte sitzt in den Listen-
    und News-Abfragen (`a.is_hentai IS NOT TRUE`), nicht im Schreibweg. Ein
    Hentai-Titel bekommt seine Angebote wie jeder andere und erscheint trotzdem in
    keiner öffentlichen Liste; den Filter hier nachzubauen würde ihn nur an einer
    zweiten Stelle wiederholen, ihn hier zu *umgehen* ginge gar nicht — es gibt
    nichts zu umgehen (Review Focus 5).

    Pro Titel:
      `titles`/`want`/`year` — für `match_node`,
      `status`/`year`        — für `confidence_for` (Entscheidung 24),
      `offers`   (provider, monetization) -> `first_seen_at`: bleibt über Läufe
                 erhalten, auch wenn es NULL ist („seit Beginn bekannt"),
      `manual`   Positiv-Zeilen von Hand (`source='manual'`, nicht verworfen): der
                 Sweep löscht sie nicht und muss ihren Anbieter deshalb im
                 Filter-Index stehen lassen,
      `rejected` Veto-Zeilen (`confidence='rejected'`): diese Paare werden nicht
                 wieder eingefügt (Entscheidung 21)."""
    rows = json.loads(psql(
        "SELECT COALESCE(json_agg(json_build_object('id',a.id,'slug',a.slug,'fmt',a.format,"
        "'yr',a.season_year,'st',a.status,'de',a.title_german,'en',a.title_english,"
        "'ro',a.title_romaji,'na',a.title_native)),'[]') FROM anime a;").strip() or "[]")
    anime = {r["id"]: {"id": r["id"], "slug": r["slug"],
                       "want": "MOVIE" if r.get("fmt") == "MOVIE" else "SHOW",
                       "year": r.get("yr"), "status": r.get("st"),
                       "titles": [r.get("de") or "", r.get("en") or "", r.get("ro") or "", r.get("na") or ""],
                       "offers": {}, "manual": set(), "rejected": set()}
             for r in rows}
    if not anime:
        return []
    for o in json.loads(psql(
        "SELECT COALESCE(json_agg(json_build_object('pid',_parent_id,'p',provider,'m',monetization,"
        "'f',first_seen_at,'s',source,'c',confidence)),'[]') FROM anime_streaming_offers;").strip() or "[]"):
        a = anime.get(o["pid"])
        if not a:
            continue
        key = (o["p"], o["m"])
        a["offers"][key] = o["f"]
        if o.get("c") == "rejected":
            a["rejected"].add(key)
        elif o.get("s") == "manual":
            a["manual"].add(key)
    return list(anime.values())


# --- Schreiben --------------------------------------------------------------------


def _csv(v):
    """Sprachfeld ins DB-Format. `dedupe_offers` liefert MENGEN (anders als
    `aggregate_offers` im Nachbarskript, das schon Komma-Strings baut), die Spalten
    `audio`/`subs` wollen eine sortierte Komma-Liste. Fertige Strings gehen unverändert
    durch, damit Aufrufer wie der Crunchyroll-Direktbeleg (Aufgabe 14) ihre Zeilen
    direkt übergeben können."""
    if not v:
        return ""
    if isinstance(v, str):
        return v
    return ",".join(sorted(v))


def offers_for_title(parsed, status=None, year=None, current_year=None):
    """Angebotszeilen für GENAU DEN EINEN Titel, den `match_node` gewählt hat.

    Zuschnitt: ein Katalogknoten ist eine ganze Serie, und eine Staffel-Zuordnung gibt
    es bewusst nicht (JustWatchs Staffelnummern sind nicht auf AniList abbildbar, siehe
    `match_node`). Das gematchte Objekt ist also der Knoten selbst:

      - Anbieter hängt am Knoten          -> `confirmed`. Das ist der Regelfall; der
        Katalog liefert die Serien-Angebote mit `elementCount`.
      - Anbieter hängt NUR an Staffeln    -> `confidence_for` entscheidet: bei
        laufendem Titel oder laufendem Jahrgang `unconfirmed`, sonst keine Zeile
        (Entscheidung 24, engste Lesart).

    Geerbte Zeilen tragen `flatrate` (Entscheidung 17: NULL fiele aus den SQL-Filtern
    der Plattform-Listen heraus und `ads`/`free` wäre eine Behauptung über den Preis),
    den Deep-Link ihres Staffel-Angebots und KEINE Sprach-, Staffel- oder Episodenzahl
    (Entscheidung 7: was wir nicht belegen, behaupten wir nicht im Detail).

    Staffel- und Episodenzahl wie in `aggregate_offers`: `elementCount` am
    Serien-Angebot sind die Staffeln beim Anbieter, `elementCount` am Staffel-Angebot
    sind Episoden — je Staffel die Zahl des zusammengeführten Angebots (`dedupe_offers`
    wählt dort den Direktanbieter), über die Staffeln summiert. Filme tragen beides
    nicht.

    Kauf- und Leih-Angebote werden hier schon verworfen: der Sweep löscht sie nicht
    (siehe `build_catalog_sql`), also darf er sie auch nicht anlegen oder gar als
    geerbtes `flatrate` missdeuten."""
    own = [o for o in dedupe_offers(parsed.get("offers") or []) if o["monetization"] in SWEEP_MONETIZATION]
    own_providers = {o["provider"] for o in own}
    is_show = parsed.get("object_type") == "SHOW"
    episodes, season_link = {}, {}
    for s in parsed.get("seasons") or []:
        for o in dedupe_offers(s.get("offers") or []):
            if o["monetization"] not in SWEEP_MONETIZATION:
                continue
            key = (o["provider"], o["monetization"])
            if o.get("episodes"):
                episodes[key] = episodes.get(key, 0) + int(o["episodes"])
            season_link.setdefault(o["provider"], o)  # Link-Quelle für die Vererbung
    rows = {(o["provider"], o["monetization"]): o for o in own}
    for prov, o in season_link.items():
        if prov not in own_providers:
            # Vererbung immer als flatrate, nie als ads/free (Entscheidung 17).
            rows.setdefault((prov, "flatrate"), o)
    out = []
    for (prov, monet), o in sorted(rows.items()):
        conf = confidence_for(own_providers, own_providers | set(season_link), prov,
                              status, year, current_year)
        if conf is None:
            continue  # nicht belegt und nicht vererbbar: keine Zeile
        geerbt = conf != "confirmed"
        out.append({
            "provider": prov,
            "monetization": monet,
            "url": o["url"],
            "audio": "" if geerbt else _csv(o.get("audio")),
            "subs": "" if geerbt else _csv(o.get("subs")),
            # `episodes` aus `parse_node` ist der rohe `elementCount` — am Serien-
            # Angebot sind das die Staffeln beim Anbieter.
            "seasons": None if (geerbt or not is_show) else (int(o["episodes"]) if o.get("episodes") else None),
            "episodes": None if (geerbt or not is_show) else (episodes.get((prov, monet)) or None),
            "available_to": None if geerbt else o.get("available_to"),
            "confidence": conf,
        })
    return out


def offers_for_matches(nodes, status=None, year=None, current_year=None):
    """Angebotszeilen für einen Titel, der in MEHREREN Katalogknoten auftauchte —
    Vereinigung über `(provider, monetization)`.

    JustWatch führt für dasselbe Werk mitunter zwei getrennte Knoten (verschiedene
    Titelschreibweisen, Eintrag mit und ohne Jahr). Beide matchen denselben unserer
    Titel. Nur den erstgefundenen zu schreiben wäre falsch, weil das `DELETE`
    autoritativ über ALLE Abo-/Werbe-/Gratis-Zeilen des Titels ist: Anbieter, die nur am
    zweiten Knoten hängen, verschwänden. Verschärfend: die Titelsuche wählt ihren Knoten
    nach eigenen Regeln und löscht ebenfalls autoritativ — picken die beiden
    Schreibwege verschiedene Knoten, kippen dieselben Zeilen bei jeder Rotation hin und
    her.

    Nicht summiert wird dagegen: Staffel- und Episodenzahl kommen vom ersten Knoten, der
    das Paar nennt. Zwei Knoten beschreiben dasselbe Werk, ihre Zählungen aufzuaddieren
    würde die Episodenzahl verdoppeln. Ein belegtes Angebot ersetzt ein geerbtes
    desselben Paares, unabhängig von der Reihenfolge der Knoten — `confirmed` ist der
    bessere Beleg."""
    rows = {}
    for parsed in nodes:
        for r in offers_for_title(parsed, status, year, current_year):
            key = (r["provider"], r["monetization"])
            vorhanden = rows.get(key)
            if vorhanden is None or (vorhanden["confidence"] != "confirmed"
                                     and r["confidence"] == "confirmed"):
                rows[key] = r
    return [rows[k] for k in sorted(rows)]


def build_catalog_sql(anime, offers, now_iso, discovery=False, only_provider=None):
    """SQL für EINEN Titel: Angebote, Anbieter-Index, Sprachen. Schreibt selbst nichts.

    Folgt `build_sql` im Nachbarskript (`DELETE` + `INSERT` pro Titel), mit einer
    entscheidenden Einschränkung:

    *** Der Sweep ist autoritativ NUR für die Monetarisierungen, die er blättert. ***

    `fetch_catalog` fragt `monetizationTypes: [FLATRATE, ADS, FREE]` — Kauf- und
    Leih-Angebote sieht der Katalog-Abruf nie. Im Bestand hängen daran (gemessen
    2026-11-09): amazon-video 952 von 952 Angeboten, magenta-tv 223 von 223,
    rakuten-tv 126 von 127, sky-store 99 von 99 — zusammen 1.400 Angebote, ein Viertel
    des Bestands. Aufgefallen ist es daran, dass das Paket `etv` (MagentaTV) im Sweep
    0 Treffer liefert, obwohl die Datenbank 223 MagentaTV-Angebote führt. Ein
    autoritatives `DELETE` über ALLE Monetarisierungen würde diese 1.400 Zeilen beim
    ersten Entdeckungslauf löschen und nie wieder einfügen; wiederherstellbar wären sie
    nur über einen zwölftägigen Durchlauf der Titelsuche. Deshalb das
    `monetization IN (…)` am `DELETE` — und deshalb werden Kauf/Leih-Angebote auch nicht
    eingefügt: was nicht gelöscht wird, darf nicht doppelt angelegt werden. Für Kauf und
    Leih bleibt die rollierende Titelsuche zuständig, die in ihrer Antwort ohnehin alle
    Monetarisierungen sieht.

    Eine Anbieter-Einschränkung braucht es dagegen NICHT: die Angebotsliste eines
    Knotens ist vollständig über alle Anbieter (der `packages`-Filter wirkt auf die
    Trefferliste, nicht auf `offers` je Titel). Für einen gefundenen Titel sieht der
    Sweep also auch Anbieter ohne eigenes Paket (Paramount+, Apple TV+, HIDIVE) und
    schreibt sie korrekt neu.

    ASYMMETRIE MIT DER TITELSUCHE (Absicht): `build_sql` in `justwatch-streaming.py` spart
    `source = 'crunchyroll'` aus, dieses `DELETE` NICHT. Der wöchentliche Sweep ist der
    breite, autoritative Weg und überschreibt den Crunchyroll-Beleg weiter; der tägliche
    Crunchyroll-Lauf (`crunchyroll-availability.sh`, Cron NACH dem Sweep) stellt ihn direkt
    danach wieder her. Die vierstündige Titelsuche ist dagegen der enge, titelweise Weg und
    fasst sie nicht an.

    Dieses `DELETE` ist dabei NICHT der Löschweg für Crunchyroll-Zeilen: der Sweep fasst
    nur gematchte Titel an, und eine Fortsetzungsstaffel matcht er nie (`match_node`
    trifft nur die Erststaffel, abgesichert durch
    `test_fortsetzungsstaffel_wird_nicht_von_der_serie_getroffen`). Eine dort liegende
    `confirmed`-Zeile entfernt ausschließlich der Frische-Verfall am Ende des
    Crunchyroll-Laufs (`expiry_sql` in `crunchyroll-dub.py`, `last_seen_at` älter als
    sieben Tage). Erst er macht die Asymmetrie sicher — ohne ihn fröre ein Lizenzende
    auf einer Fortsetzungsstaffel dauerhaft als Beleg ein.

    Weiter gilt:
      - `source = 'manual'` wird nicht gelöscht (Entscheidung 8) und ein Paar mit
        `rejected`-Zeile nicht wieder eingefügt (Entscheidung 21). Beides sind
        Entscheidungen eines Redakteurs, der Sync überschreibt sie nicht. Die
        Granularität ist die Zeile, nicht der Titel — ein eingefrorener Titel würde
        echte Neuzugänge verpassen.
      - `first_seen_at` bleibt pro `(provider, monetization)` erhalten, auch als NULL.
        Bei `discovery=True` bekommt JEDES neue Paar NULL („seit Beginn bekannt"), nie
        `now()` — sonst wäre der halbe Katalog 30 Tage lang „Neu auf <Anbieter>"
        (Anti-Ziel; die Kaltstart-Sperre `ECHT_NEU` in `generate-recurring-news.ts`
        prüft genau auf `first_seen_at IS NULL`). Begründung an der Stelle selbst.
      - `anime_streaming_providers` (Filter-Index) wird neu gebaut und zählt
        unbestätigte Angebote mit (Entscheidung 4), `anime_available_languages` nur aus
        belegten (Entscheidung 7) und bleibt rein additiv.
      - Hentai-Titel werden nicht ausgenommen — der Schutz sitzt in den Listen-Abfragen
        (Review Focus 5); hier kommt `is_hentai` bewusst nicht vor.

    Warnung für weitere Aufrufer (Aufgabe 14): das `DELETE` macht den Aufrufer
    autoritativ für ALLE Abo-/Werbe-/Gratis-Angebote des Titels. Eine Quelle, die nur
    einen Anbieter kennt, darf diese Funktion nur mit der vollständigen Angebotsliste
    des Titels aufrufen.

    Genau dafür gibt es `only_provider` (Aufgabe 14, Crunchyroll-Direktbeleg): eine Quelle,
    die nur EINEN Anbieter kennt, darf nicht die Angebote aller anderen löschen. Mit
    `only_provider='crunchyroll'` beschränkt sich das `DELETE` zusätzlich auf
    `provider = 'crunchyroll'`, Angebote anderer Anbieter in `offers` werden ignoriert,
    und der Filter-Index wird nicht neu gebaut, sondern nur um diesen einen Anbieter
    bereinigt und ergänzt. Sprachen bleiben additiv wie sonst. Ohne den Parameter
    ändert sich nichts am Verhalten des Sweeps.

    Preis dieser Einschränkung: mit `only_provider` ist der Aufruf nur noch für EINEN
    Anbieter autoritativ und erreicht einen Titel nur, wenn die Quelle ihn gerade
    gefunden hat. Für das Entfernen braucht so ein Aufrufer deshalb einen eigenen Weg;
    der Crunchyroll-Lauf hat ihn im Frische-Verfall (`expiry_sql`), nicht im Sweep."""
    aid = anime["id"]
    scope = f" AND provider = {q(only_provider)}" if only_provider else ""
    monets = ",".join(q(m) for m in SWEEP_MONETIZATION)
    # Ausgespart sind beide redaktionellen Entscheidungen: die Handarbeit
    # (`source='manual'`, Entscheidung 8) UND das Veto (`confidence='rejected'`,
    # Entscheidung 21). Das Veto braucht seine eigene Bedingung, weil der Lader eine
    # Zeile allein an `confidence` als Veto erkennt: eine `rejected`-Zeile mit anderer
    # `source` würde sonst gelöscht und das Angebot im Folgelauf wieder angelegt — das
    # Veto hätte sich selbst gelöscht. `IS DISTINCT FROM`, weil der ganze Altbestand
    # `confidence IS NULL` trägt und `<> 'rejected'` ihn herauswürfe.
    stmts = [f"DELETE FROM anime_streaming_offers WHERE _parent_id = {aid} "
             f"AND source IS DISTINCT FROM 'manual' AND confidence IS DISTINCT FROM 'rejected' "
             f"AND monetization IN ({monets}){scope};"]
    known = anime.get("offers") or {}
    rejected = set(anime.get("rejected") or ())
    manual_keys = set(anime.get("manual") or ())
    slugs, langs = set(), set()
    for e in offers:
        key = (e["provider"], e["monetization"])
        if only_provider and e["provider"] != only_provider:
            continue  # fremder Anbieter: nicht gelöscht, also nicht eingefügt
        if e["monetization"] not in SWEEP_MONETIZATION:
            continue  # Kauf/Leih: nicht gelöscht, also auch nicht eingefügt
        if key in rejected:
            continue  # Veto des Redakteurs
        if key in manual_keys:
            continue  # Handarbeit gewinnt (Entscheidung 8): keine zweite Zeile desselben Paares
        audio, subs = _csv(e.get("audio")), _csv(e.get("subs"))
        conf = e.get("confidence") or "confirmed"
        # `first_seen_at`: ein bekanntes Paar behält seinen gespeicherten Wert (auch
        # NULL). Im REGELBETRIEB ist ein neues Paar ein echter Neuzugang und bekommt den
        # Zeitstempel des Laufs — darauf beruht „Neu auf <Anbieter>".
        # Im ENTDECKUNGSLAUF bekommt JEDES neue Paar NULL („seit Beginn bekannt"), denn
        # dort ist „echter Neuzugang" von „wir haben nie nachgesehen" prinzipiell nicht
        # unterscheidbar. Die naheliegende Bedingung „nur Titel ohne Bestand" wäre
        # falsch: 113 Titel haben NUR Kauf/Leih-Angebote (die 1.400 Zeilen, die der
        # Abruf nie sieht) und gelten damit als Titel „mit Bestand" — ihre erstmals
        # gefundenen Abo-Angebote wären 30 Tage lang „Neu auf <Anbieter>", das
        # Anti-Ziel, und `ECHT_NEU` in generate-recurring-news.ts greift nicht, weil es
        # auf `first_seen_at IS NULL` prüft. `--discovery` läuft genau einmal;
        # hinterher ist das nicht mehr zu korrigieren.
        first = known[key] if key in known else (None if discovery else now_iso)
        slugs.add(e["provider"])  # auch unbestätigte zählen im Filter-Index mit
        if conf == "confirmed":
            for code in audio.split(","):
                if code in AUDIO_TO_LANG:
                    langs.add(AUDIO_TO_LANG[code])
            for code in subs.split(","):
                if code in SUB_TO_LANG:
                    langs.add(SUB_TO_LANG[code])
        # Beide Zahlen gehen ungequotet ins SQL. Für den Sweep sind sie durch
        # `offers_for_title` schon int, aber diese Funktion ist ausdrücklich die
        # Schnittstelle für weitere Quellen (Aufgabe 14) — `int()` ist hier der billige
        # Schutz davor, dass von dort ein String ins Statement wandert.
        seasons = None if e.get("seasons") is None else int(e["seasons"])
        episodes = None if e.get("episodes") is None else int(e["episodes"])
        stmts.append(
            "INSERT INTO anime_streaming_offers "
            "(_order,_parent_id,id,provider,monetization,url,audio,subs,seasons,episodes,"
            "available_to,first_seen_at,last_seen_at,confidence,source) VALUES ("
            # Das DELETE lässt Kauf/Leih- und Handarbeits-Zeilen stehen; `_order` darf
            # deshalb nicht wieder bei 1 anfangen, sonst gäbe es die Reihenfolge doppelt.
            f"COALESCE((SELECT max(_order) FROM anime_streaming_offers WHERE _parent_id = {aid}), 0) + 1, "
            f"{aid}, substr(md5(random()::text || clock_timestamp()::text), 1, 24), "
            f"{q(e['provider'])}, {q(e['monetization'])}::enum_anime_streaming_offers_monetization, "
            f"{q(e['url'])}, {q(audio or None)}, {q(subs or None)}, "
            f"{seasons if seasons is not None else 'NULL'}, {episodes if episodes is not None else 'NULL'}, "
            # `confidence` und `source` ohne Typumwandlung: das Stringliteral wird vom
            # Enum der Spalte übernommen. Die Typnamen sind lokal nicht prüfbar (keine
            # Datenbank), ein falscher Cast würde den ganzen INSERT scheitern lassen.
            f"{q(e.get('available_to'))}, {q(first)}, {q(now_iso)}, {q(conf)}, {q(e.get('source') or 'justwatch')});"
        )
    # Handarbeits-Zeilen überleben das DELETE — ihr Anbieter muss also auch den neu
    # gebauten Filter-Index überleben, sonst wäre die Handarbeit aus Suche und
    # Plattform-Listen verschwunden, obwohl die Zeile noch da steht (Entscheidung 8).
    if only_provider:
        # Nur der eigene Anbieter wird im Index angefasst. Hängt eine Handarbeits-Zeile
        # an ihm, bleibt der Eintrag stehen.
        behalten = any(p == only_provider and m in SWEEP_MONETIZATION for p, m in (anime.get("manual") or ()))
        stmts.append(f"DELETE FROM anime_streaming_providers WHERE parent_id = {aid} "
                     f"AND value = {q(only_provider)}::enum_anime_streaming_providers;")
        if slugs or behalten:
            stmts.append(
                'INSERT INTO anime_streaming_providers ("order", parent_id, value) '
                f"SELECT COALESCE((SELECT max(\"order\") FROM anime_streaming_providers WHERE parent_id = {aid}), 0) + 1, "
                f"{aid}, {q(only_provider)}::enum_anime_streaming_providers;")
    else:
        slugs |= {p for p, m in (anime.get("manual") or ()) if m in SWEEP_MONETIZATION}
        stmts.append(f"DELETE FROM anime_streaming_providers WHERE parent_id = {aid};")
    if slugs and not only_provider:
        vals = ",".join(f"({i + 1}, {aid}, {q(s)}::enum_anime_streaming_providers)"
                        for i, s in enumerate(sorted(slugs)))
        stmts.append(f'INSERT INTO anime_streaming_providers ("order", parent_id, value) VALUES {vals};')
    for lang in sorted(langs):
        stmts.append(
            'INSERT INTO anime_available_languages ("order", parent_id, value) '
            f"SELECT COALESCE((SELECT max(\"order\") FROM anime_available_languages WHERE parent_id = {aid}), 0) + 1, {aid}, "
            f"{q(lang)}::enum_anime_available_languages "
            f"WHERE NOT EXISTS (SELECT 1 FROM anime_available_languages WHERE parent_id = {aid} AND value = {q(lang)});"
        )
    return stmts


def diff_offers(anime, offers):
    """`(neu, weggefallen)` der `(provider, monetization)`-Paare im Rahmen des Sweeps —
    Grundlage für den Trockenlauf-Bericht und für die Frage, ob sich am Titel etwas
    geändert hat.

    Kauf/Leih-Paare, Handarbeit und Veto können nie „wegfallen": das `DELETE` fasst sie
    nicht an. Sie als Wegfall zu melden hätte den Trockenlauf unlesbar gemacht — 1.400
    Phantom-Meldungen, die keine sind."""
    manual = set(anime.get("manual") or ())
    rejected = set(anime.get("rejected") or ())
    have = {k for k in (anime.get("offers") or {}) if k[1] in SWEEP_MONETIZATION}
    want = {(e["provider"], e["monetization"]) for e in offers
            if e["monetization"] in SWEEP_MONETIZATION
            and (e["provider"], e["monetization"]) not in rejected}
    return sorted(want - have), sorted(have - want - manual - rejected)


def verified_sql(ids, now_iso, complete=False):
    """Der Nachweis-Stempel `anime.streaming_verified_at` — oder eine leere Liste.

    Bedeutung des Stempels: „dieser Titel war Teil eines vollständigen
    Katalog-Durchlaufs über alle gemappten Anbieter". Er wird für JEDEN erfassten Titel
    gesetzt, nicht nur für die ohne Treffer: in der engen Lesart („nirgends gefunden")
    trüge ein Titel MIT Angeboten nie einen Stempel, und die Aussage „bei Netflix nicht
    gelistet" wäre für ihn dauerhaft unbelegbar, obwohl der Durchlauf Netflix' Katalog
    gerade geprüft hat. Die Textschicht (`lib/streamingText.ts`) liest das Feld genau so.

    Der Stempel deckt Abo, Werbung und Gratis ab — NICHT Kauf und Leih, denn die
    blättert der Abruf nicht (siehe `build_catalog_sql`). Die öffentliche Formulierung
    ist genau so eingegrenzt („bei keinem Anbieter in Deutschland im Abo- oder
    Gratis-Stream"), das passt zusammen; niemand darf den Stempel später weiter lesen,
    als er trägt.

    Bei `complete=False` wird NICHTS gestempelt (Review Focus 1): ein Abbruch mitten im
    Durchlauf — 403/429, kaputte Paginierung, eine Kante ohne Knoten — darf nicht den
    halben Katalog als „in Deutschland nicht im Stream" verifizieren. Der Standardwert
    ist deshalb `False`: wer nichts über die Vollständigkeit sagt, stempelt nicht.

    `content_updated_at` bleibt absichtlich unberührt: der Stempel ist ein Nachweis über
    unsere Prüfung, keine inhaltliche Änderung am Titel."""
    if not complete or not ids:
        return []
    return [f"UPDATE anime SET streaming_verified_at = {q(now_iso)} "
            f"WHERE id IN ({','.join(str(int(i)) for i in ids)});"]


def run_complete(flags, shorts, knoten):
    """War DER GANZE Durchlauf vollständig? `flags` sind die `complete`-Flags aller
    Abrufe (je Paket und Objekttyp), `shorts` die geblätterten Pakete, `knoten` die
    Gesamtzahl der gelesenen Katalogknoten.

    Ein einziges unvollständiges Paket macht den ganzen Durchlauf unvollständig — nur
    dann ist „bei keinem Anbieter gefunden" ein Nachweis und nicht bloß die Folge eines
    Netzwerkfehlers. Drei Sonderfälle gehören dazu:
      - leere Flag-Liste: es wurde nichts geblättert, also ist nichts belegt;
      - `--packages` mit einer Teilmenge: der Abruf kann vollständig gewesen sein, aber
        der Stempel behauptet „über ALLE gemappten Anbieter nachgesehen". Das wäre
        falsch, also wird nicht gestempelt;
      - kein einziger Knoten im ganzen Durchlauf. Auslöser ist hier KEIN Netzwerkfehler
        (der setzt `complete=False`), sondern eine stille Semantikänderung bei
        JustWatch: fällt das Genre `ani` weg oder wird ein `shortName` umbenannt,
        antwortet die API mit HTTP 200 und `edges: []`. `fetch_catalog` meldet dann
        völlig korrekt „vollständig geblättert", und der Stempel würde alle 11.061 Titel
        als „nirgends in Deutschland im Abo- oder Gratis-Stream" ausweisen. Ab Aufgabe
        15 läuft der Sweep unbeaufsichtigt per Cron, also muss das hier hängen.
        Geprüft wird die SUMME über den Durchlauf, nicht pro Paket: `etv` (MagentaTV)
        liefert laut Messung legitim 0 Treffer, eine Prüfung pro Paket würde jeden
        Durchlauf blockieren."""
    flags = list(flags)
    return bool(flags) and all(flags) and set(shorts) == set(PACKAGES) and knoten > 0


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


# Schreiben in Häppchen: ein Abbruch verliert höchstens die letzten Titel, und eine
# einzelne Transaktion über 11.061 Titel wäre unnötig lang offen.
FLUSH_EVERY = 500


def sweep(shorts, mode):
    """Der Durchlauf: Kataloge blättern, zuordnen, schreiben, stempeln. Gibt zurück,
    ob er vollständig war (das ist der Exit-Code).

    Nur GEMATCHTE Titel werden geschrieben. Ein Titel, der in keinem Katalog
    auftauchte, behält seinen Bestand — „nicht im Katalog gefunden" ist auch der
    Zustand eines fehlgeschlagenen Matches, und der darf keine Angebote löschen. Der
    Nachweis-Stempel geht dagegen an jeden erfassten Titel (siehe `verified_sql`).

    Derselbe Titel steht in mehreren Katalogen (Crunchyroll UND Prime, oder
    Direktanbieter UND Amazon-Channel). Zwei Fälle, die auseinanderzuhalten sind:
      - DERSELBE Knoten kommt ein zweites Mal (gleiche Titel, gleiches Jahr): seine
        Angebotsliste ist über alle Anbieter vollständig, er bringt nichts Neues und
        wird übersprungen (Zähler `doppelt`).
      - EIN ANDERER Knoten für dasselbe Werk: er wird aufbewahrt, und `offers_for_matches`
        vereinigt die Angebote (Zähler `mehrfach`). Sonst löschte das autoritative
        `DELETE` die Anbieter des nicht gewählten Knotens.

    `anime.streaming_checked_at` wird bewusst NICHT gesetzt. Dieser Stempel steuert die
    Rotation der Titelsuche (`--stale`); würde der Sweep ihn wöchentlich für alle 11.061
    Titel erneuern, käme die Titelsuche nie wieder an einen Titel — und genau sie ist
    für Kauf, Leih und die Anbieter ohne Paket zuständig."""
    dry = mode == "--dry-run"
    discovery = mode == "--discovery"
    print("→ Lade alle Titel samt Bestandsangeboten …", flush=True)
    anime = load_all_anime()
    print(f"  {len(anime)} Titel.", flush=True)
    if not anime:
        return False
    idx = title_index(anime)
    by_id = {a["id"]: a for a in anime}
    sess = jw.session()
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
    current_year = time.gmtime().tm_year
    flags, treffer, gesehen = [], {}, {}
    knoten_gesamt, mehrfach, doppelt = 0, 0, 0

    for short in shorts:
        for typ in ("SHOW", "MOVIE"):
            nodes, complete = fetch_catalog(sess, short, typ)
            flags.append(complete)
            knoten_gesamt += len(nodes)
            neu = 0
            for node in nodes:
                parsed = parse_node(node)
                a = match_node(parsed, candidates_for(parsed, idx))
                if a is None:
                    continue
                # Fingerabdruck des Knotens: zwei Pakete liefern denselben Knoten
                # (Crunchyroll und Crunchyroll Amazon Channel), ein anderes Werk-Objekt
                # unterscheidet sich in Titel oder Jahr.
                fp = (parsed.get("original_title"), parsed.get("title"), parsed.get("year"))
                if fp in gesehen.setdefault(a["id"], set()):
                    doppelt += 1
                    continue
                gesehen[a["id"]].add(fp)
                treffer.setdefault(a["id"], []).append(parsed)
                if len(treffer[a["id"]]) > 1:
                    mehrfach += 1
                else:
                    neu += 1
            print(f"  {short} ({PACKAGES[short]}) {typ}: {len(nodes)} Knoten, {neu} Zuordnungen"
                  + ("" if complete else "  — UNVOLLSTÄNDIG"), flush=True)

    sql, changed, dazu, weg = [], [], {}, {}

    def flush():
        """Angesammelte Anweisungen in EINER Transaktion schreiben."""
        nonlocal sql
        if sql and not dry:
            psql("BEGIN;\n" + "\n".join(sql) + "\nCOMMIT;", read=False)
        sql = []

    for done, (aid, parsed_nodes) in enumerate(treffer.items(), 1):
        a = by_id[aid]
        offers = offers_for_matches(parsed_nodes, a.get("status"), a.get("year"), current_year)
        add, rem = diff_offers(a, offers)
        for p, _m in add:
            dazu[p] = dazu.get(p, 0) + 1
        for p, _m in rem:
            weg[p] = weg.get(p, 0) + 1
        if add or rem:
            changed.append(aid)
            if dry:
                print(f"  {a['slug']}: " + " ".join(
                    [f"+{p}/{m}" for p, m in add] + [f"-{p}/{m}" for p, m in rem]))
        sql.extend(build_catalog_sql(a, offers, now_iso, discovery))
        if done % FLUSH_EVERY == 0:
            flush()
    flush()

    if changed and not dry and not discovery:
        # Geänderte Streaming-Angaben sind eine Inhaltsänderung (Sitemap-lastmod,
        # IndexNow) — im Entdeckungslauf aber NICHT: der ändert tausende Titel auf
        # einmal, und ein Schwall über den halben Katalog ist kein redaktioneller
        # Vorgang, sondern Lärm in der Sitemap.
        ids = ",".join(str(i) for i in changed)
        psql(f"UPDATE anime SET content_updated_at = now(), updated_at = now() WHERE id IN ({ids});",
             read=False)

    complete = run_complete(flags, shorts, knoten_gesamt)
    stamp = verified_sql([a["id"] for a in anime], now_iso, complete)
    if stamp and not dry:
        psql(stamp[0], read=False)

    print(f"  Fertig: {knoten_gesamt} Knoten gelesen, {len(treffer)} Titel zugeordnet "
          f"({mehrfach} zusätzliche Knoten vereinigt, {doppelt} identische übersprungen), "
          f"{len(changed)} geändert.")
    for p in sorted(set(dazu) | set(weg)):
        print(f"    {p}: +{dazu.get(p, 0)} neu, -{weg.get(p, 0)} weggefallen")
    if dry:
        print("  Trockenlauf: nichts geschrieben.")
    elif stamp:
        print(f"✓ Geschrieben, {len(anime)} Titel mit streaming_verified_at gestempelt.")
    else:
        print("→ Durchlauf unvollständig oder nur Teilmenge der Pakete: KEIN Nachweis gestempelt.")
    return complete


def main():
    modes = [m for m in ("--count-only", "--dry-run", "--sweep", "--discovery") if m in sys.argv]
    if len(modes) != 1:
        sys.exit("Aufruf: justwatch-catalog.py (--count-only|--dry-run|--sweep|--discovery) "
                 "[--packages ava,cru]\n"
                 "  --count-only  nur Katalogzahlen, schreibt nichts\n"
                 "  --dry-run     zuordnen und berichten, schreibt nichts\n"
                 "  --sweep       Regelbetrieb: schreibt Angebote und Nachweis\n"
                 "  --discovery   wie --sweep, aber ohne first_seen_at für neue Angebote")
    shorts = list(PACKAGES)
    if "--packages" in sys.argv:
        shorts = sys.argv[sys.argv.index("--packages") + 1].split(",")
        unknown = [s for s in shorts if s not in PACKAGES]
        if unknown:
            sys.exit(f"Unbekannte Pakete: {', '.join(unknown)}")
    if other_instance_running():
        print("→ Eine andere JustWatch-Instanz läuft bereits — Abbruch (Instanz-Sperre).")
        # Exit 2, nicht 0: dieser Lauf hat gar nicht stattgefunden. Er ist weder
        # vollständig (0) noch ein unvollständiger Abruf (1), und ein Cron-Wrapper muss
        # „war schon belegt" von „Abruf kaputt" unterscheiden können.
        sys.exit(2)
    if modes[0] == "--count-only":
        sys.exit(0 if count_only(shorts) else 1)
    sys.exit(0 if sweep(shorts, modes[0]) else 1)


if __name__ == "__main__":
    main()
