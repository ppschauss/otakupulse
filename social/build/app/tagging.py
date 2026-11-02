"""Tag-Auswahl für den Tumblr-Kanal (Slots 3–5 des Tag-Schemas).

Reine Funktionen ohne DB-Zugriff: Genre = das seltenste erlaubte Genre,
Tags = die zwei am höchsten bewerteten erlaubten Themen/Settings.
Dazu Serientitel-Normalisierung, Adult-Ausschluss und das Gesamtschema (tags_for).
"""

import re
import unicodedata

# Genres, die nie als Tag auftauchen
GENRE_BLOCKLIST: frozenset[str] = frozenset({"Ecchi", "Hentai"})

# Deskriptoren ohne Aussagekraft als Tag (Besetzung, Protagonist, Technik)
TAG_BLOCKLIST: frozenset[str] = frozenset({
    "Heterosexual",
    "Primarily Teen Cast",
    "Primarily Adult Cast",
    "Primarily Female Cast",
    "Primarily Male Cast",
    "Primarily Child Cast",
    "Male Protagonist",
    "Female Protagonist",
    "Ensemble Cast",
    "Nudity",
    "CGI",
    "Episodic",
})

# Mindest-Rang eines Tags (0–100)
MIN_TAG_RANK: int = 60

# Nur diese Tag-Kategorien kommen in Frage
ALLOWED_TAG_CATEGORIES: frozenset[str] = frozenset({"theme", "setting"})


def pick_genre(genres: list[str], rarity: dict[str, int]) -> str | None:
    """Seltenstes erlaubtes Genre (kleinste Anzahl in `rarity`).

    Genres ohne Eintrag in `rarity` gelten als am seltensten (0). Bei Gleichstand
    gewinnt die Reihenfolge der Eingabe. Ohne erlaubtes Genre: None.
    """
    erlaubt = [g for g in genres if g not in GENRE_BLOCKLIST]
    if not erlaubt:
        return None
    return min(erlaubt, key=lambda g: rarity.get(g, 0))  # min() ist bei Gleichstand stabil


def pick_tags(anime_tags: list[tuple[str, str, int]], limit: int = 2) -> list[str]:
    """Die `limit` bestbewerteten erlaubten Tags aus (name, category, rank)-Tupeln.

    Bei Ranggleichheit entscheidet die Reihenfolge der Eingabe (stabile Sortierung).
    """
    kandidaten = [
        t for t in anime_tags
        if t[1] in ALLOWED_TAG_CATEGORIES and t[2] >= MIN_TAG_RANK and t[0] not in TAG_BLOCKLIST
    ]
    kandidaten.sort(key=lambda t: t[2], reverse=True)  # sorted/reverse behält Eingabereihenfolge bei Gleichstand
    return [t[0] for t in kandidaten[:limit]]


# --- Serientitel (Slot 6), Adult-Ausschluss, Gesamtschema ---

# Manuelle Korrekturen zur Laufzeit: Schlüssel = Rohtitel, Wert = Tag.
# None unterdrückt Slot 6 für diesen Titel.
SERIES_TAG_OVERRIDES: dict[str, str | None] = {}

# Staffel-/Teil-Suffixe, die am Titelende abgeschnitten werden
_SUFFIX_RE = re.compile(
    r"[\s\-–:]*(?:"
    r"season\s+\d+|\d+(?:st|nd|rd|th)\s+season|final\s+season"
    r"|part\s+\d+|cour\s+\d+"
    r"|(?<=\s)(?:[2-9]|ii|iii|iv)"  # nur einstellige Zahl 2-9 ist Staffelmarker
    r")\s*$"
)

_MIN_SERIES_LEN = 3


def normalize_series_title(title: str | None) -> str | None:
    """Serientitel für Slot 6: ohne Staffel-Suffix und Untertitel, kleingeschrieben.

    Ein Eintrag in SERIES_TAG_OVERRIDES gewinnt immer (auch None). Zu kurze
    Ergebnisse (unter 3 Zeichen) und leere Titel ergeben None.
    """
    if not title:
        return None
    if title in SERIES_TAG_OVERRIDES:
        return SERIES_TAG_OVERRIDES[title]
    t = re.split(r"[,:]", title.lower(), maxsplit=1)[0]
    t = re.sub(r"\s+", " ", t).strip()
    while True:
        neu = _SUFFIX_RE.sub("", t).strip()
        if neu == t:
            break
        t = neu
    t = t.strip(" \t-–—_.!?・~")
    t = re.sub(r"\s+", " ", t)
    return t if len(t) >= _MIN_SERIES_LEN else None


def sanitize_tag(tag: str) -> str:
    """Tag tumblr-tauglich machen: Kommas und Steuerzeichen raus, kleingeschrieben.

    Tumblr trennt den tags-Parameter an Kommas; ein Komma im Tag würde ihn in
    zwei falsche Tags zerlegen.
    """
    t = tag.replace(",", " ")
    t = "".join(" " if unicodedata.category(c).startswith("C") else c for c in t)
    return re.sub(r"\s+", " ", t).strip().lower()


def is_excluded(genres: list[str], is_hentai: bool) -> bool:
    """Harter Ausschluss: Hentai (Flag oder Genre) geht nie auf den Marken-Blog.

    Ecchi allein schließt nicht aus, nur der Serientitel-Tag entfällt (tags_for).
    """
    return is_hentai or "Hentai" in genres


def tags_for(
    genres: list[str],
    anime_tags: list[tuple[str, str, int]],
    series_title: str | None,
    rarity: dict[str, int],
) -> list[str]:
    """Fertige Tag-Liste in Schema-Reihenfolge, alles kleingeschrieben.

    anime, otakupulse, Genre, bis zu zwei Tags, Serientitel. Bei Ecchi/Hentai in
    den Genres entfällt der Serientitel.
    """
    roh: list[str | None] = ["anime", "otakupulse", pick_genre(genres, rarity)]
    roh.extend(pick_tags(anime_tags))
    if not any(g in GENRE_BLOCKLIST for g in genres):
        roh.append(normalize_series_title(series_title))
    bereinigt = (sanitize_tag(t) for t in roh if t)
    return [t for t in bereinigt if t]
