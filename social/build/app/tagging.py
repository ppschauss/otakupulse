"""Tag-Auswahl für den Tumblr-Kanal (Slots 3–5 des Tag-Schemas).

Reine Funktionen ohne DB-Zugriff: Genre = das seltenste erlaubte Genre,
Tags = die zwei am höchsten bewerteten erlaubten Themen/Settings.
"""

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
