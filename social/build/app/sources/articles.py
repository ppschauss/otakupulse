"""Quelle: neu veröffentlichte News-Artikel aus der otakupulse-Postgres (nur lesend).

Schema verifiziert 2026-07-16: Tabelle `articles`, Status in `_status`, Datum in
`publish_date` (NICHT published_at), Kurztext in `excerpt`, Bild in `cover_image_url`.
"""
from dataclasses import dataclass

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


async def fetch_new(limit: int) -> list[SourceItem]:
    """Liefert bis zu `limit` publizierte Artikel, die noch nicht formuliert wurden."""
    rows = await pg.fetch(
        """
        SELECT id, slug, title, excerpt, cover_image_url
        FROM articles
        WHERE _status = 'published' AND slug IS NOT NULL
        ORDER BY publish_date DESC NULLS LAST
        LIMIT $1
        """,
        # großzügig ziehen, danach in Python gegen seen_sources filtern
        max(limit * 6, 40),
    )
    items: list[SourceItem] = []
    for r in rows:
        ref = str(r["id"])
        if await models.is_seen("article", ref):
            continue
        items.append(SourceItem(
            kind="article",
            ref=ref,
            url=_URL.format(base=config.SITE_BASE_URL, slug=r["slug"]),
            title=r["title"] or "",
            excerpt=r["excerpt"] or "",
            image_url=r["cover_image_url"],
            perishable=True,
        ))
        if len(items) >= limit:
            break
    return items


async def all_published_ids() -> list[str]:
    """Für `cli seed`: alle aktuell publizierten Artikel-IDs (als seen markieren)."""
    rows = await pg.fetch("SELECT id FROM articles WHERE _status='published'")
    return [str(r["id"]) for r in rows]
