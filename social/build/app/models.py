"""Datenzugriff auf die Entwurfs-Queue, das Post-Log und die Ingest-Dedup-Tabelle."""
from datetime import timedelta

from . import db, config
from .util import now_utc, now_utc_iso, parse_iso


# ---------- Ingest-Dedup (seen_sources) ----------

async def is_seen(kind: str, ref: str) -> bool:
    cur = await db.conn().execute(
        "SELECT 1 FROM seen_sources WHERE source_kind=? AND source_ref=?", (kind, ref)
    )
    return (await cur.fetchone()) is not None


async def mark_seen(kind: str, ref: str) -> None:
    await db.conn().execute(
        "INSERT OR IGNORE INTO seen_sources(source_kind, source_ref, first_seen) VALUES(?,?,?)",
        (kind, ref, now_utc_iso()),
    )
    await db.conn().commit()


async def seen_count() -> int:
    cur = await db.conn().execute("SELECT COUNT(*) AS n FROM seen_sources")
    return (await cur.fetchone())["n"]


# ---------- Entwürfe ----------

async def enqueue(*, batch_day, channel, source_kind, source_ref, url, image_url,
                  title, body, perishable: bool) -> int:
    now = now_utc()
    perishable_at = (
        (now + timedelta(hours=config.PERISHABLE_HOURS)).isoformat() if perishable else None
    )
    cur = await db.conn().execute(
        """INSERT INTO drafts
           (batch_day, channel, source_kind, source_ref, url, image_url, title, body,
            perishable_at, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (batch_day, channel, source_kind, source_ref, url, image_url, title, body,
         perishable_at, now.isoformat()),
    )
    await db.conn().commit()
    return cur.lastrowid


async def get_draft(draft_id: int):
    cur = await db.conn().execute("SELECT * FROM drafts WHERE id=?", (draft_id,))
    return await cur.fetchone()


async def pending_for_batch(day: str):
    cur = await db.conn().execute(
        "SELECT * FROM drafts WHERE state='pending' AND batch_day=? ORDER BY id", (day,)
    )
    return await cur.fetchall()


async def all_pending():
    cur = await db.conn().execute("SELECT * FROM drafts WHERE state='pending' ORDER BY id")
    return await cur.fetchall()


async def approved_drafts():
    cur = await db.conn().execute("SELECT * FROM drafts WHERE state='approved' ORDER BY id")
    return await cur.fetchall()


async def counts_by_state() -> dict:
    cur = await db.conn().execute("SELECT state, COUNT(*) AS n FROM drafts GROUP BY state")
    return {r["state"]: r["n"] for r in await cur.fetchall()}


async def approve(draft_id: int) -> None:
    await db.conn().execute(
        "UPDATE drafts SET state='approved', decided_at=? WHERE id=? AND state='pending'",
        (now_utc_iso(), draft_id),
    )
    await db.conn().commit()


async def reject(draft_id: int) -> None:
    await db.conn().execute(
        "UPDATE drafts SET state='rejected', decided_at=? WHERE id=? AND state='pending'",
        (now_utc_iso(), draft_id),
    )
    await db.conn().commit()


async def set_edit_and_approve(draft_id: int, text: str) -> None:
    await db.conn().execute(
        "UPDATE drafts SET body_edited=?, state='approved', decided_at=? WHERE id=?",
        (text, now_utc_iso(), draft_id),
    )
    await db.conn().commit()


async def mark_posted(draft_id: int, external_id: str | None, channel: str,
                      source_kind: str, source_ref: str) -> None:
    now = now_utc_iso()
    c = db.conn()
    await c.execute(
        "UPDATE drafts SET state='posted', posted_at=?, external_id=? WHERE id=?",
        (now, external_id, draft_id),
    )
    await c.execute(
        """INSERT OR IGNORE INTO posted_log(channel, source_kind, source_ref, posted_at, draft_id)
           VALUES (?,?,?,?,?)""",
        (channel, source_kind, source_ref, now, draft_id),
    )
    await c.commit()


async def record_attempt_failure(draft_id: int, error: str, give_up: bool) -> None:
    state = "failed" if give_up else "approved"
    await db.conn().execute(
        "UPDATE drafts SET attempts=attempts+1, last_error=?, state=? WHERE id=?",
        (error[:500], state, draft_id),
    )
    await db.conn().commit()


async def expire_due() -> int:
    """Verderbliche Entwürfe (News) über perishable_at hinaus verfallen lassen."""
    now = now_utc_iso()
    cur = await db.conn().execute(
        """UPDATE drafts SET state='expired'
           WHERE state='pending' AND perishable_at IS NOT NULL AND perishable_at < ?""",
        (now,),
    )
    await db.conn().commit()
    return cur.rowcount


def effective_body(draft) -> str:
    return draft["body_edited"] or draft["body"]
