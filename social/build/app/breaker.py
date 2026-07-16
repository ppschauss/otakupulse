"""Circuit-Breaker je Kanal — die direkte Lehre aus dem n8n-429-Dauerläufer.

Statt 2000-mal gegen dieselbe Wand zu rennen: Retry-After respektieren, nach 5 Fehlern
in Folge den Kanal 6 h stilllegen und EINE Telegram-Meldung schicken (nicht spammen).
Zustand liegt in channel_state → überlebt Neustart.
"""
import logging
import random
from datetime import timedelta

from . import db, runtime, settings, texts_de as T
from .util import now_utc, now_utc_iso, parse_iso

log = logging.getLogger(__name__)

FAIL_THRESHOLD = 5
OPEN_HOURS = 6
BASE_BACKOFF = 60      # Sekunden
MAX_BACKOFF = 3600


async def _state(channel: str):
    cur = await db.conn().execute("SELECT * FROM channel_state WHERE channel=?", (channel,))
    row = await cur.fetchone()
    if row is None:
        await db.conn().execute("INSERT INTO channel_state(channel) VALUES(?)", (channel,))
        await db.conn().commit()
        cur = await db.conn().execute("SELECT * FROM channel_state WHERE channel=?", (channel,))
        row = await cur.fetchone()
    return row


async def guard(channel: str) -> bool:
    """True, wenn der Kanal gerade angefasst werden darf."""
    st = await _state(channel)
    now = now_utc()
    if st["open_until"] and now < parse_iso(st["open_until"]):
        return False
    if st["retry_after"] and now < parse_iso(st["retry_after"]):
        return False
    return True


async def record_ok(channel: str) -> None:
    st = await _state(channel)
    was_open = bool(st["open_until"]) or int(st["consec_fails"]) >= FAIL_THRESHOLD
    await db.conn().execute(
        "UPDATE channel_state SET consec_fails=0, open_until=NULL, retry_after=NULL, "
        "last_ok=?, notified_at=NULL WHERE channel=?",
        (now_utc_iso(), channel),
    )
    await db.conn().commit()
    if was_open:
        await _notify(T.channel_up(channel))


async def record_fail(channel: str, error: str, retry_after_seconds: int | None = None) -> None:
    st = await _state(channel)
    fails = int(st["consec_fails"]) + 1
    now = now_utc()

    if retry_after_seconds is not None:
        retry_after = (now + timedelta(seconds=retry_after_seconds)).isoformat()
    else:
        delay = min(BASE_BACKOFF * (2 ** (fails - 1)), MAX_BACKOFF) + random.uniform(0, 5)
        retry_after = (now + timedelta(seconds=delay)).isoformat()

    open_until = None
    notify = False
    if fails >= FAIL_THRESHOLD:
        open_until = (now + timedelta(hours=OPEN_HOURS)).isoformat()
        if not st["notified_at"]:
            notify = True

    await db.conn().execute(
        "UPDATE channel_state SET consec_fails=?, retry_after=?, open_until=?, "
        "last_error=?, notified_at=CASE WHEN ? THEN ? ELSE notified_at END WHERE channel=?",
        (fails, retry_after, open_until, error[:500], notify, now_utc_iso(), channel),
    )
    await db.conn().commit()
    log.warning("Kanal %s Fehler #%d: %s", channel, fails, error[:200])
    if notify:
        await _notify(T.channel_down(channel, error))


async def _notify(text: str) -> None:
    chat_id = await settings.approval_chat_id()
    if chat_id and runtime.bot:
        try:
            await runtime.bot.send_message(chat_id=chat_id, text=text)
        except Exception:
            log.exception("Konnte Breaker-Meldung nicht senden")
