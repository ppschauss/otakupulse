"""Quelle: neu veröffentlichte News-Artikel aus der otakupulse-Postgres (nur lesend).

Schema verifiziert 2026-07-16: Tabelle `articles`, Status in `_status`, Datum in
`publish_date` (NICHT published_at), Kurztext in `excerpt`, Bild in `cover_image_url`.
"""
import logging
from dataclasses import dataclass, field

from .. import pg, config, models

log = logging.getLogger(__name__)

# News-Detailseite liegt unter /news/<slug>.
_URL = "{base}/news/{slug}"

TUMBLR = "tumblr"


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
    # False: die Tag-Rohdaten wurden nicht (verlässlich) geladen. Dann entfällt der Tumblr-Entwurf
    # dieses Artikels; über is_hentai/genres darf dann nicht entschieden werden.
    tag_data_ok: bool = True


# Nur diese Kategorien gehen auf Tumblr. Angewandt wird das kanalspezifisch in batch.ingest
# (nicht in fetch_new: Bluesky und Mastodon bekommen weiterhin alle Kategorien).
TUMBLR_CATEGORIES: frozenset[str] = frozenset({"news", "simulcast"})

# Rang ist eine Stärke (höher = besser). Tags ohne Rang zählen 0 und fallen unter die Schwelle.
_RANG_UNBEKANNT = 0

# Grundabfrage: liest NUR `articles`, also genau das, was jeder Kanal braucht. Das Tag-Material
# steht in TAGS_SQL und wird getrennt geholt — eine fehlende Leseberechtigung oder ein
# Schema-Drift in den sechs Tag-Tabellen darf den Ingest von Bluesky und Mastodon nicht
# mitreißen. Direkt in psql ausführbar ($1 = int Limit).
ARTICLES_SQL = """
SELECT a.id, a.slug, a.title, a.excerpt, a.cover_image_url, a.category
FROM articles a
WHERE a._status = 'published' AND a.slug IS NOT NULL
ORDER BY a.publish_date DESC NULLS LAST
LIMIT $1
"""

# Tag-Rohdaten (nur für den Tumblr-Pfad, nur für die schon ausgewählten Artikel). Eine Zeile je
# Artikel: alle Verknüpfungen werden in korrelierten Unterabfragen zu Arrays aggregiert, es gibt
# keinen Join auf die Hauptabfrage und damit keine Zeilenvervielfachung. Diese Abfrage braucht
# SELECT auf articles_rels, anime, anime_rels, genres, anime_tags und tags; scheitert sie,
# entfällt Tumblr für diesen Lauf. Direkt in psql ausführbar ($1 = Liste der Artikel-IDs).
TAGS_SQL = """
SELECT a.id,
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
WHERE a.id = ANY($1)
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


def bild_url(roh) -> str | None:
    """Bildpfad absolut machen — dieselbe Quelle (SITE_BASE_URL) wie die Artikel-URL.

    `articles.cover_image_url` steht in der Produktionsdatenbank als RELATIVER Pfad
    ("/media/anime/banner/195/195604.jpg"). Gemessen wurde es über alle publizierten Artikel:
    jeder einzelne relativ, keiner absolut — das ist die Form der Spalte, keine Momentaufnahme
    (eine absolute Zahl stünde hier ohne Messdatum und veraltete mit dem nächsten Artikel).
    Unverändert durchgereicht landet dieser Wert als `media[0].url` im NPF-Bildblock,
    und jeder Tumblr-Post hätte ein kaputtes Cover (das Theme holt es per
    `.op-body > figure:first-child` nach links und fände nichts). Bluesky nutzt denselben Wert
    für die externe Karte und profitiert mit.

    Bereits absolute Werte (http/https) bleiben unverändert, leere bleiben None. Ein fehlender
    führender Schrägstrich wird ergänzt, ein doppelter nicht erzeugt.
    """
    if not isinstance(roh, str) or not roh.strip():
        return None
    pfad = roh.strip()
    if pfad.lower().startswith(("http://", "https://")):
        return pfad
    return f"{config.SITE_BASE_URL}/{pfad.lstrip('/')}"


def _feld(r, name):
    """Feld einer Zeile, auch wenn die Abfrage es nicht liefert (Grundabfrage ohne Tag-Spalten)."""
    try:
        return r[name]
    except (KeyError, IndexError):
        return None


def _tagdaten(r):
    """Tag-Rohdaten einer Zeile aus TAGS_SQL: (genres, anime_tags, series_title, is_hentai, anzahl).

    Ohne verknüpften Anime sind Genres, Anime-Tags und Serientitel leer. Bei mehreren
    Anime bleiben Genres und Tags (aggregiert über alle) erhalten; nur der Serientitel
    entfällt, damit kein falscher Serientag unter einem Sammelartikel steht.
    `is_hentai` bleibt immer erhalten, damit der Ausschluss auch bei Sammelartikeln greift.
    Fehlen die Spalten ganz (Grundabfrage), ist alles leer.
    """
    anzahl = int(_feld(r, "anime_count") or 0)
    genres, tags, serie = [], [], None
    if anzahl >= 1:
        genres = list(_feld(r, "genres") or [])
        namen = _feld(r, "tag_names") or []
        kategorien = _feld(r, "tag_categories") or []
        raenge = _feld(r, "tag_ranks") or []
        tags = [
            (n, c, _RANG_UNBEKANNT if rk is None else int(rk))
            for n, c, rk in zip(namen, kategorien, raenge)
        ]
        if anzahl == 1:
            serie = _feld(r, "series_title") or None
    return genres, tags, serie, bool(_feld(r, "is_hentai")), anzahl


def tags_uebernehmen(item: SourceItem, r) -> None:
    """Tag-Rohdaten aus einer TAGS_SQL-Zeile in ein bestehendes SourceItem schreiben."""
    (item.genres, item.anime_tags, item.series_title,
     item.is_hentai, item.anime_count) = _tagdaten(r)
    item.tag_data_ok = True


def row_to_item(r) -> SourceItem:
    """Bildet eine Zeile auf ein SourceItem ab (ohne DB-Zugriff).

    Verträgt sowohl eine Zeile der Grundabfrage (dann bleiben die Tag-Felder leer) als auch eine
    um die TAGS_SQL-Spalten ergänzte Zeile.
    """
    genres, tags, serie, hentai, anzahl = _tagdaten(r)
    return SourceItem(
        kind="article",
        ref=str(r["id"]),
        url=_URL.format(base=config.SITE_BASE_URL, slug=r["slug"]),
        title=r["title"] or "",
        excerpt=r["excerpt"] or "",
        image_url=bild_url(r["cover_image_url"]),
        perishable=True,
        genres=genres,
        anime_tags=tags,
        series_title=serie,
        category=r["category"],
        is_hentai=hentai,
        anime_count=anzahl,
    )


async def _tags_anreichern(items: list[SourceItem], ids: list) -> None:
    """Tag-Rohdaten für die gewählten Artikel nachladen (zweite Abfrage, nur für Tumblr).

    Degradiert wie der übrige Tumblr-Pfad: scheitert es, bleibt `tag_data_ok=False`,
    batch.ingest lässt Tumblr für diesen Lauf entfallen, und Bluesky/Mastodon laufen weiter.

    Im try liegt bewusst AUCH die Auswertung der Zeilen, nicht nur die Abfrage: `_tagdaten` ruft
    `int()` auf Rang und Anzahl und greift auf Spalten zu: eine unerwartete Zeile (Schema-Drift,
    nicht-numerischer Rang) würde sonst aus `fetch_new` heraus und über `batch.ingest` bis in
    `run_daily` fliegen — und damit `send_batch()` verhindern. Das ist derselbe Riss wie bei der
    Abfrage selbst, nur eine Ebene tiefer. Bei einem Fehler gelten ALLE Items als ohne Tag-Daten:
    eine halb übernommene Anreicherung ist nicht vertrauenswürdig.
    """
    try:
        rows = await pg.fetch(TAGS_SQL, ids)
        je_id = {str(r["id"]): r for r in rows}
        fehlend = []
        for item in items:
            zeile = je_id.get(item.ref)
            if zeile is None:
                # Artikel zwischen den beiden Abfragen verschwunden: ohne Tag-Daten kein Tumblr-Post.
                item.tag_data_ok = False
                fehlend.append(item.ref)
                continue
            tags_uebernehmen(item, zeile)
    except Exception:
        log.warning("Tag-Rohdaten nicht lesbar — kein Tumblr-Entwurf in diesem Lauf.",
                    exc_info=True)
        for item in items:
            item.tag_data_ok = False
        return
    if fehlend:
        log.warning("Keine Tag-Rohdaten für Artikel %s — dort kein Tumblr-Entwurf.",
                    ", ".join(fehlend))


async def fetch_new(limit: int) -> list[SourceItem]:
    """Liefert bis zu `limit` publizierte Artikel (alle Kategorien, `item.category` trägt den Wert), die noch nicht formuliert wurden.

    Die Grundabfrage liest nur `articles`. Die Tag-Rohdaten holt eine zweite Abfrage, und zwar
    nur, wenn Tumblr aktiv ist: eine reine Tumblr-Datenabhängigkeit darf den Ingest der anderen
    Kanäle nicht zum Stillstand bringen.
    """
    rows = await pg.fetch(
        ARTICLES_SQL,
        # großzügig ziehen, danach in Python gegen seen_sources filtern
        max(limit * 6, 40),
    )
    items: list[SourceItem] = []
    ids: list = []
    for r in rows:
        if await models.is_seen("article", str(r["id"])):
            continue
        items.append(row_to_item(r))
        ids.append(r["id"])
        if len(items) >= limit:
            break
    if not items:
        return items
    if TUMBLR in config.CHANNELS_ENABLED:
        await _tags_anreichern(items, ids)
    else:
        # Keine Tag-Rohdaten geholt (Tumblr ist nicht aktiv): niemand darf sie für echt nehmen.
        for item in items:
            item.tag_data_ok = False
    return items


async def all_published_ids() -> list[str]:
    """Für `cli seed`: alle aktuell publizierten Artikel-IDs (als seen markieren)."""
    rows = await pg.fetch("SELECT id FROM articles WHERE _status='published'")
    return [str(r["id"]) for r in rows]
