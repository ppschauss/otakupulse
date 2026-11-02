"""Quelle: neu veröffentlichte News-Artikel aus der otakupulse-Postgres (nur lesend).

Schema verifiziert 2026-07-16: Tabelle `articles`, Status in `_status`, Datum in
`publish_date` (NICHT published_at), Kurztext in `excerpt`, Bild in `cover_image_url`.
"""
from dataclasses import dataclass, field

from .. import pg, config, models

# News-Detailseite liegt unter /news/<slug>.
_URL = "{base}/news/{slug}"


@dataclass
class SourceItem:
    kind: str          # 'article'
    ref: str           # Artikel-ID als String
    url: str
    title: str
    excerpt: str
    image_url: str | None
    perishable: bool   # News verfallen; Evergreen (v1.5) nicht
    # --- Tag-Rohdaten für tagging.tags_for / is_excluded (Tumblr) ---
    genres: list[str] = field(default_factory=list)                       # englische Genre-Namen
    anime_tags: list[tuple[str, str, int]] = field(default_factory=list)  # (name, category, rank)
    series_title: str | None = None   # nur bei genau einem verknüpften Anime
    category: str | None = None       # articles.category (news, simulcast, ...)
    is_hentai: bool = False           # true, wenn irgendein verknüpfter Anime Hentai ist
    anime_count: int = 0              # Zahl verknüpfter Anime; > 1 => Tag-Felder leer


# Nur diese Kategorien gehen auf Tumblr. Angewandt wird das kanalspezifisch in batch.ingest
# (nicht in fetch_new: Bluesky und Mastodon bekommen weiterhin alle Kategorien).
TUMBLR_CATEGORIES: frozenset[str] = frozenset({"news", "simulcast"})

# Rang ist eine Stärke (höher = besser). Tags ohne Rang zählen 0 und fallen unter die Schwelle.
_RANG_UNBEKANNT = 0

# Eine Zeile je Artikel: alle Verknüpfungen werden in korrelierten Unterabfragen zu
# Arrays aggregiert, es gibt keinen Join auf die Hauptabfrage und damit keine
# Zeilenvervielfachung. Direkt in psql ausführbar ($1 = int Limit).
ARTICLES_SQL = """
SELECT a.id, a.slug, a.title, a.excerpt, a.cover_image_url, a.category,
       (SELECT count(DISTINCT ar.anime_id)
          FROM articles_rels ar
         WHERE ar.parent_id = a.id AND ar.anime_id IS NOT NULL) AS anime_count,
       (SELECT min(COALESCE(NULLIF(an.title_english, ''), an.title_romaji))
          FROM articles_rels ar JOIN anime an ON an.id = ar.anime_id
         WHERE ar.parent_id = a.id) AS series_title,
       (SELECT COALESCE(bool_or(an.is_hentai), false)
          FROM articles_rels ar JOIN anime an ON an.id = ar.anime_id
         WHERE ar.parent_id = a.id) AS is_hentai,
       (SELECT array_agg(DISTINCT g.name ORDER BY g.name)
          FROM articles_rels ar
          JOIN anime_rels r ON r.parent_id = ar.anime_id AND r.genres_id IS NOT NULL
          JOIN genres g ON g.id = r.genres_id
         WHERE ar.parent_id = a.id AND ar.anime_id IS NOT NULL) AS genres,
       t.tag_names, t.tag_categories, t.tag_ranks
FROM articles a
LEFT JOIN LATERAL (
    -- je Tag genau einmal (stärkster Rang: höher ist besser), absteigend sortiert
    SELECT array_agg(x.name ORDER BY x.rank DESC NULLS LAST, x.name) AS tag_names,
           array_agg(x.category ORDER BY x.rank DESC NULLS LAST, x.name) AS tag_categories,
           array_agg(x.rank ORDER BY x.rank DESC NULLS LAST, x.name) AS tag_ranks
      FROM (
        SELECT tg.name, tg.category::text AS category, max(atg.rank) AS rank
          FROM articles_rels ar
          JOIN anime_tags atg ON atg._parent_id = ar.anime_id
          JOIN tags tg ON tg.id = atg.tag_id
         WHERE ar.parent_id = a.id AND ar.anime_id IS NOT NULL
         GROUP BY tg.name, tg.category::text
      ) x
) t ON true
WHERE a._status = 'published' AND a.slug IS NOT NULL
ORDER BY a.publish_date DESC NULLS LAST
LIMIT $1
"""

# Genre-Häufigkeit (Genre-Name -> Anzahl Anime), für tagging.pick_genre.
GENRE_RARITY_SQL = """
SELECT g.name, count(DISTINCT r.parent_id) AS n
FROM anime_rels r JOIN genres g ON g.id = r.genres_id
WHERE r.genres_id IS NOT NULL
GROUP BY g.name
"""

_rarity_cache: dict[str, int] | None = None


async def genre_rarity() -> dict[str, int]:
    """Genre-Name -> Anzahl Anime. Einmal je Prozess geladen und im Modul gecacht."""
    global _rarity_cache
    if _rarity_cache is None:
        rows = await pg.fetch(GENRE_RARITY_SQL)
        _rarity_cache = {r["name"]: int(r["n"]) for r in rows}
    return _rarity_cache


def row_to_item(r) -> SourceItem:
    """Bildet eine aggregierte Zeile aus ARTICLES_SQL auf ein SourceItem ab (ohne DB-Zugriff).

    Ohne verknüpften Anime sind Genres, Anime-Tags und Serientitel leer. Bei mehreren
    Anime bleiben Genres und Tags (aggregiert über alle) erhalten; nur der Serientitel
    entfällt, damit kein falscher Serientag unter einem Sammelartikel steht.
    `is_hentai` bleibt immer erhalten, damit der Ausschluss auch bei Sammelartikeln greift.
    """
    anzahl = int(r["anime_count"] or 0)
    hat_anime = anzahl >= 1
    genres, tags, serie = [], [], None
    if hat_anime:
        genres = list(r["genres"] or [])
        namen = r["tag_names"] or []
        kategorien = r["tag_categories"] or []
        raenge = r["tag_ranks"] or []
        tags = [
            (n, c, _RANG_UNBEKANNT if rk is None else int(rk))
            for n, c, rk in zip(namen, kategorien, raenge)
        ]
        if anzahl == 1:
            serie = r["series_title"] or None
    return SourceItem(
        kind="article",
        ref=str(r["id"]),
        url=_URL.format(base=config.SITE_BASE_URL, slug=r["slug"]),
        title=r["title"] or "",
        excerpt=r["excerpt"] or "",
        image_url=r["cover_image_url"],
        perishable=True,
        genres=genres,
        anime_tags=tags,
        series_title=serie,
        category=r["category"],
        is_hentai=bool(r["is_hentai"]),
        anime_count=anzahl,
    )


async def fetch_new(limit: int) -> list[SourceItem]:
    """Liefert bis zu `limit` publizierte Artikel (alle Kategorien, `item.category` trägt den Wert), die noch nicht formuliert wurden."""
    rows = await pg.fetch(
        ARTICLES_SQL,
        # großzügig ziehen, danach in Python gegen seen_sources filtern
        max(limit * 6, 40),
    )
    items: list[SourceItem] = []
    for r in rows:
        if await models.is_seen("article", str(r["id"])):
            continue
        items.append(row_to_item(r))
        if len(items) >= limit:
            break
    return items


async def all_published_ids() -> list[str]:
    """Für `cli seed`: alle aktuell publizierten Artikel-IDs (als seen markieren)."""
    rows = await pg.fetch("SELECT id FROM articles WHERE _status='published'")
    return [str(r["id"]) for r in rows]
