"""Kommandozeile für Wartung & Trockenläufe.

    python -m app.cli seed              # alle publizierten Artikel als 'gesehen' markieren
    python -m app.cli compose [N]       # N neue Artikel formulieren + AUSGEBEN (nichts speichern)
    python -m app.cli ingest [N]        # N neue Artikel formulieren + einreihen (echt)
    python -m app.cli status            # Zähler ausgeben

`seed` ist PFLICHT vor dem ersten Start — sonst sieht der Agent 590 Altartikel als 'neu'.
"""
import asyncio
import sys

from . import db, pg, models, compose
from .sources import articles
from .channels import registry


async def _seed() -> None:
    ids = await articles.all_published_ids()
    n = 0
    for ref in ids:
        if not await models.is_seen("article", ref):
            await models.mark_seen("article", ref)
            n += 1
    print(f"seed: {n} Artikel als gesehen markiert (gesamt bekannt: {await models.seen_count()}).")


async def _compose(limit: int) -> None:
    channels = registry.active_channel_names() or ["bluesky", "mastodon"]
    items = await articles.fetch_new(limit)
    if not items:
        print("compose: keine neuen Artikel (alle bereits gesehen?).")
        return
    for item in items:
        print(f"\n=== {item.title}  [{item.url}] ===")
        texts = await compose.compose_for(item, channels)
        for ch, body in texts.items():
            print(f"[{ch}] ({len(body)} Z.)\n{body}\n")
    print("(compose --dry: nichts gespeichert, nichts als gesehen markiert)")


async def _ingest(limit: int) -> None:
    from . import batch
    created = await batch.ingest(limit)
    print(f"ingest: {created} Entwurf(e) erzeugt.")


async def _status() -> None:
    counts = await models.counts_by_state()
    print("Entwürfe:", counts)
    print("Bekannte Quellen:", await models.seen_count())


async def _main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    arg = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 3

    await db.init()
    await pg.init()
    try:
        if cmd == "seed":
            await _seed()
        elif cmd == "compose":
            await _compose(arg)
        elif cmd == "ingest":
            await _ingest(arg)
        elif cmd == "status":
            await _status()
        else:
            print(f"Unbekanntes Kommando: {cmd}")
    finally:
        await pg.close()
        await db.close()


if __name__ == "__main__":
    asyncio.run(_main())
