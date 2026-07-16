"""Read-only-Zugriff auf die otakupulse-Postgres (Rolle social_ro).

Bewusst nur SELECT — die Rolle hat serverseitig keine Schreibrechte. Kein Pool-Zwang:
ein kleiner Pool reicht für die paar Ingest-Queries pro Tag.
"""
import asyncpg

from . import config

_pool: asyncpg.Pool | None = None


async def init() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        host=config.PG_HOST, port=config.PG_PORT, database=config.PG_DB,
        user=config.PG_USER, password=config.PG_PASSWORD,
        min_size=1, max_size=3, command_timeout=30,
    )


async def fetch(query: str, *args):
    assert _pool is not None, "pg.init() nicht aufgerufen"
    async with _pool.acquire() as c:
        return await c.fetch(query, *args)


async def close() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
