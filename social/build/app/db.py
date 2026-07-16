"""SQLite-Zugriff (aiosqlite, single writer). Die DB ist die einzige Wahrheit.

Zwei tragende Verträge:
- posted_log PRIMARY KEY (channel, source_kind, source_ref): derselbe Beitrag kann nie
  zweimal auf denselben Kanal, egal wie oft der Container neu startet.
- seen_sources: pro Quelle wird nur EINMAL formuliert (Ingest-Dedup über alle Kanäle).
"""
import aiosqlite

from . import config

_conn: aiosqlite.Connection | None = None

SCHEMA = """
-- Ein Entwurf je (Quelle × Kanal).
CREATE TABLE IF NOT EXISTS drafts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_day     TEXT NOT NULL,
    channel       TEXT NOT NULL,
    source_kind   TEXT NOT NULL,               -- 'article' | 'evergreen_anime' (v1.5)
    source_ref    TEXT NOT NULL,
    url           TEXT NOT NULL,
    image_url     TEXT,
    title         TEXT,
    body          TEXT NOT NULL,
    body_edited   TEXT,
    state         TEXT NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending','approved','posted','rejected','expired','failed')),
    perishable_at TEXT,
    created_at    TEXT NOT NULL,
    decided_at    TEXT,
    posted_at     TEXT,
    external_id   TEXT,
    attempts      INTEGER NOT NULL DEFAULT 0,
    last_error    TEXT
);
CREATE INDEX IF NOT EXISTS idx_drafts_state ON drafts(state, batch_day);
CREATE INDEX IF NOT EXISTS idx_drafts_ext   ON drafts(channel, external_id);

-- Post-Dedup je Kanal (überlebt Neustart).
CREATE TABLE IF NOT EXISTS posted_log (
    channel     TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_ref  TEXT NOT NULL,
    posted_at   TEXT NOT NULL,
    draft_id    INTEGER,
    PRIMARY KEY (channel, source_kind, source_ref)
);

-- Ingest-Dedup: was wurde schon formuliert (kanalübergreifend)? seed füllt das ohne zu posten.
CREATE TABLE IF NOT EXISTS seen_sources (
    source_kind TEXT NOT NULL,
    source_ref  TEXT NOT NULL,
    first_seen  TEXT NOT NULL,
    PRIMARY KEY (source_kind, source_ref)
);

-- Circuit-Breaker / Rate-Limit je Kanal.
CREATE TABLE IF NOT EXISTS channel_state (
    channel      TEXT PRIMARY KEY,
    consec_fails INTEGER NOT NULL DEFAULT 0,
    open_until   TEXT,
    retry_after  TEXT,
    last_ok      TEXT,
    last_error   TEXT,
    notified_at  TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


async def init() -> None:
    global _conn
    _conn = await aiosqlite.connect(config.DB_PATH)
    _conn.row_factory = aiosqlite.Row
    await _conn.execute("PRAGMA journal_mode=WAL;")
    await _conn.execute("PRAGMA foreign_keys=ON;")
    await _conn.execute("PRAGMA busy_timeout=5000;")
    await _conn.executescript(SCHEMA)
    await _conn.commit()


def conn() -> aiosqlite.Connection:
    assert _conn is not None, "db.init() nicht aufgerufen"
    return _conn


async def close() -> None:
    global _conn
    if _conn is not None:
        await _conn.close()
        _conn = None
