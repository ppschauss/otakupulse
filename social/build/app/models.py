"""Datenzugriff auf die Entwurfs-Queue, das Post-Log und die Ingest-Dedup-Tabelle."""
import json
from datetime import datetime, time, timedelta, timezone

from . import db, config, util
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
                  title, body, perishable: bool,
                  tags: list[str] | None = None, category: str | None = None) -> int:
    now = now_utc()
    perishable_at = (
        (now + timedelta(hours=config.PERISHABLE_HOURS)).isoformat() if perishable else None
    )
    cur = await db.conn().execute(
        """INSERT INTO drafts
           (batch_day, channel, source_kind, source_ref, url, image_url, title, body,
            perishable_at, created_at, tags, category)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (batch_day, channel, source_kind, source_ref, url, image_url, title, body,
         perishable_at, now.isoformat(),
         json.dumps(tags, ensure_ascii=False) if tags is not None else None, category),
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
    # Beim endgültigen Aufgeben den Zeitpunkt festhalten (für die Tagesmeldung).
    await db.conn().execute(
        "UPDATE drafts SET attempts=attempts+1, last_error=?, state=?, "
        "decided_at=CASE WHEN ? THEN ? ELSE decided_at END WHERE id=?",
        (error[:500], state, 1 if give_up else 0, now_utc_iso(), draft_id),
    )
    await db.conn().commit()


def _heute_bereich_utc(jetzt: datetime | None = None) -> tuple[str, str]:
    """Beginn und Ende des lokalen Tages (config.TZ, nicht UTC) als UTC-ISO-Strings.

    posted_at liegt als UTC-ISO ("...+00:00") vor; die lokalen Tagesgrenzen werden daher in
    dasselbe Format umgerechnet und als Bereich verglichen (Sommerzeitwechsel inklusive).
    """
    heute = jetzt or util.now_local()
    morgen = heute.date() + timedelta(days=1)
    beginn = datetime.combine(heute.date(), time.min, tzinfo=heute.tzinfo)
    ende = datetime.combine(morgen, time.min, tzinfo=heute.tzinfo)
    return (beginn.astimezone(timezone.utc).isoformat(),
            ende.astimezone(timezone.utc).isoformat())


def tagesbeginn_utc(jetzt: datetime | None = None) -> str:
    """Beginn des lokalen Tages als UTC-ISO (gleiche Grenze wie posted_today); optional zu einem
    vorgegebenen "jetzt", damit Aufrufer nur eine Uhrablesung verwenden."""
    return _heute_bereich_utc(jetzt)[0]


async def posted_today(channel: str) -> int:
    """Zahl der heute (lokaler Tag nach config.TZ, nicht UTC) auf diesem Kanal geposteten Einträge."""
    beginn, ende = _heute_bereich_utc()
    cur = await db.conn().execute(
        "SELECT COUNT(*) AS n FROM posted_log WHERE channel=? AND posted_at >= ? AND posted_at < ?",
        (channel, beginn, ende),
    )
    return (await cur.fetchone())["n"]


LIMIT_VERWORFEN = "Tageslimit erreicht"  # Markierung in last_error, damit der Verwurf erkennbar bleibt
AUSGANG_UNBEKANNT = "Ausgang unbekannt"   # Präfix in last_error (siehe poster.run_post_pass)


async def posted_between(channel: str, von: str, bis: str):
    """Im Zeitraum [von, bis) auf diesem Kanal geposteten Entwürfe (UTC-ISO), älteste zuerst."""
    cur = await db.conn().execute(
        """SELECT * FROM drafts WHERE channel=? AND state='posted'
           AND posted_at >= ? AND posted_at < ? ORDER BY posted_at, id""",
        (channel, von, bis),
    )
    return await cur.fetchall()


async def limit_discarded_between(channel: str, von: str, bis: str):
    """Im Zeitraum wegen Tageslimit verworfene Entwürfe (nicht: normal verfallene News)."""
    cur = await db.conn().execute(
        """SELECT * FROM drafts WHERE channel=? AND state='expired' AND last_error=?
           AND decided_at >= ? AND decided_at < ? ORDER BY decided_at, id""",
        (channel, LIMIT_VERWORFEN, von, bis),
    )
    return await cur.fetchall()


async def outcome_unknown_between(channel: str, von: str, bis: str):
    """Im Zeitraum mit 'Ausgang unbekannt' aufgegebene Entwürfe."""
    cur = await db.conn().execute(
        """SELECT * FROM drafts WHERE channel=? AND state='failed' AND last_error LIKE ?
           AND decided_at >= ? AND decided_at < ? ORDER BY decided_at, id""",
        (channel, AUSGANG_UNBEKANNT + "%", von, bis),
    )
    return await cur.fetchall()


async def expire_draft(draft_id: int) -> None:
    """Einen freigegebenen Entwurf wegen Tageslimit verfallen lassen.

    Zeitpunkt (decided_at) und Grund (last_error) werden festgehalten, damit die Tagesmeldung
    diese Fälle von normal verfallenen News unterscheiden kann.
    """
    await db.conn().execute(
        "UPDATE drafts SET state='expired', decided_at=?, last_error=? "
        "WHERE id=? AND state='approved'",
        (now_utc_iso(), LIMIT_VERWORFEN, draft_id),
    )
    await db.conn().commit()


async def expire_due() -> int:
    """Verderbliche Entwürfe (News) über perishable_at hinaus verfallen lassen.

    Offene Entwürfe aller Kanäle; freigegebene nur bei Tumblr: Dessen Entwürfe sind ab Erzeugung
    'approved' und fielen sonst aus dem Verfall heraus. Bluesky/Mastodon werden von Hand
    freigegeben und warten danach ggf. (Pause, Breaker, Retry-After) — das bleibt wie es war.
    """
    now = now_utc_iso()
    cur = await db.conn().execute(
        """UPDATE drafts SET state='expired'
           WHERE (state='pending' OR (state='approved' AND channel='tumblr'))
             AND perishable_at IS NOT NULL AND perishable_at < ?""",
        (now,),
    )
    await db.conn().commit()
    return cur.rowcount


def effective_body(draft) -> str:
    return draft["body_edited"] or draft["body"]
