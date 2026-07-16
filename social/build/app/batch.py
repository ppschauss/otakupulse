"""Ingest + täglicher Freigabe-Batch + Verfall + Nudge.

'Dranbleiben' trotz Freigabepflicht: ein Batch pro Tag zur festen Zeit, Ein-Tap-Freigabe,
News verfallen nach 48 h (Queue kann nicht zur Halde werden). Der Nudge kommt genau einmal.
"""
import logging

from telegram.constants import ParseMode

from . import config, models, settings, runtime, compose, texts_de as T
from .sources import articles
from .channels import registry
from .util import today_str, now_utc, parse_iso

log = logging.getLogger(__name__)


async def ingest(limit: int) -> int:
    """Neue Artikel holen, je aktiven Kanal einen Entwurf formulieren + einreihen.
    Gibt die Zahl der neu erzeugten Entwürfe zurück."""
    channels = registry.active_channel_names()
    if not channels:
        log.warning("Keine aktiven Kanäle (CHANNELS_ENABLED leer) — nichts zu formulieren.")
        return 0

    items = await articles.fetch_new(limit)
    day = today_str()
    created = 0
    for item in items:
        try:
            texts = await compose.compose_for(item, channels)
        except Exception:
            log.exception("Formulierung fehlgeschlagen für %s", item.ref)
            continue
        for ch in channels:
            body = texts.get(ch)
            if not body:
                continue
            await models.enqueue(
                batch_day=day, channel=ch, source_kind=item.kind, source_ref=item.ref,
                url=item.url, image_url=item.image_url, title=item.title,
                body=body, perishable=item.perishable,
            )
            created += 1
        await models.mark_seen(item.kind, item.ref)
    return created


async def run_daily() -> None:
    """Scheduler-Job: zuerst frisch ingesten, dann den Batch verschicken."""
    await expire_pass()
    await ingest(config.MAX_DRAFTS_PER_BATCH)
    await send_batch()


async def send_batch() -> None:
    chat_id = await settings.approval_chat_id()
    if not chat_id or not runtime.bot:
        log.warning("Kein Freigabe-Chat gesetzt — Batch nicht versendet.")
        return
    day = today_str()
    pending = await models.pending_for_batch(day)

    await runtime.bot.send_message(
        chat_id=chat_id, text=T.batch_header(day, len(pending), config.DRY_RUN)
    )
    if not pending:
        return
    for idx, d in enumerate(pending, 1):
        await runtime.bot.send_message(
            chat_id=chat_id,
            text=T.draft_message(idx, len(pending), d),
            reply_markup=T.draft_keyboard(d["id"]),
            disable_web_page_preview=False,
        )
    await runtime.bot.send_message(
        chat_id=chat_id, text="——", reply_markup=T.batch_footer_keyboard(day)
    )
    await settings.set("last_batch_day", day)
    await settings.set("last_batch_nudged", "0")


async def expire_pass() -> int:
    n = await models.expire_due()
    if n:
        log.info("%d verderbliche Entwürfe verfallen.", n)
    return n


async def nudge_pass() -> None:
    """Höchstens ein Nudge pro Batch: wenn >24 h nach dem Batch noch etwas offen ist."""
    chat_id = await settings.approval_chat_id()
    if not chat_id or not runtime.bot:
        return
    if (await settings.get("last_batch_nudged")) == "1":
        return
    last_day = await settings.get("last_batch_day")
    if not last_day:
        return
    pending = await models.pending_for_batch(last_day)
    if not pending:
        return
    expiring = sum(1 for d in pending if d["perishable_at"]
                   and parse_iso(d["perishable_at"]).date() == now_utc().date())
    await runtime.bot.send_message(chat_id=chat_id, text=T.nudge(len(pending), expiring))
    await settings.set("last_batch_nudged", "1")
