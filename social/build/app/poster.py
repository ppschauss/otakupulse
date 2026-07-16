"""Post-Lauf: freigegebene Entwürfe rausschicken, Breaker + Retry-Limit beachten.

Kein blindes Feuern: guard(channel) fragt den Breaker, bei Fehler wird zurückgestellt,
nach 3 Versuchen 'failed' + Telegram-Meldung. DRY_RUN kurzschließt den echten Post.
"""
import logging

from . import config, models, breaker, runtime, settings, texts_de as T
from .channels import registry
from .channels.base import Post

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 3


async def run_post_pass() -> None:
    if await settings.is_paused():
        return
    drafts = await models.approved_drafts()
    for d in drafts:
        channel = d["channel"]
        if not await breaker.guard(channel):
            continue  # Kanal stillgelegt / Retry-After noch nicht abgelaufen

        post = Post(
            text=models.effective_body(d),
            url=d["url"],
            title=d["title"],
            image_url=d["image_url"],
        )

        if config.DRY_RUN:
            ext = f"dry-{d['id']}"
            await models.mark_posted(d["id"], ext, channel, d["source_kind"], d["source_ref"])
            await breaker.record_ok(channel)
            await _note_posted(channel, d["url"], ext)
            continue

        ch = registry.get(channel)
        if ch is None:
            await models.record_attempt_failure(d["id"], f"Kein Adapter für {channel}", give_up=True)
            continue

        result = await ch.post(post)
        if result.ok:
            await models.mark_posted(d["id"], result.external_id, channel,
                                     d["source_kind"], d["source_ref"])
            await breaker.record_ok(channel)
            await _note_posted(channel, d["url"], result.external_id)
        else:
            await breaker.record_fail(channel, result.error or "unbekannt", result.retry_after)
            give_up = int(d["attempts"]) + 1 >= MAX_ATTEMPTS
            await models.record_attempt_failure(d["id"], result.error or "unbekannt", give_up)
            if give_up:
                await _notify(f"⚠️ Post auf {T.CHANNEL_LABEL.get(channel, channel)} "
                              f"nach {MAX_ATTEMPTS} Versuchen aufgegeben.\n{d['url']}")


async def _note_posted(channel, url, ext) -> None:
    await _notify(T.posted_note(channel, url, ext))


async def _notify(text: str) -> None:
    chat_id = await settings.approval_chat_id()
    if chat_id and runtime.bot:
        try:
            await runtime.bot.send_message(chat_id=chat_id, text=text,
                                           disable_web_page_preview=True)
        except Exception:
            log.exception("Konnte Post-Meldung nicht senden")
