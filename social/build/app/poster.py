"""Post-Lauf: freigegebene Entwürfe rausschicken, Breaker + Retry-Limit beachten.

Kein blindes Feuern: guard(channel) fragt den Breaker, bei Fehler wird zurückgestellt,
nach 3 Versuchen 'failed' + Telegram-Meldung. Trockene Kanäle (DRY_RUN global oder
DRY_RUN_CHANNELS je Kanal) kurzschließen den echten Post. Entwürfe für Kanäle, die nicht in
CHANNELS_ENABLED stehen, bleiben unangetastet liegen.
"""
import json
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
    uebersprungen: dict[str, int] = {}
    for d in drafts:
        channel = d["channel"]
        if channel not in config.CHANNELS_ENABLED:
            # Weder posten noch trocken verbuchen: bleibt 'approved', falls der Kanal zurückkommt.
            uebersprungen[channel] = uebersprungen.get(channel, 0) + 1
            continue
        if not await breaker.guard(channel):
            continue  # Kanal stillgelegt / Retry-After noch nicht abgelaufen

        try:
            tags = json.loads(d["tags"] or "[]")
            if not isinstance(tags, list):
                raise ValueError("tags ist keine Liste")
        except (ValueError, TypeError):
            # Kaputte Tags nie still durch [] ersetzen: sonst ginge ein Tumblr-Post ohne Tags raus.
            log.exception("Entwurf %s hat unlesbare Tags — als gescheitert markiert.", d["id"])
            await models.record_attempt_failure(d["id"], "Tags unlesbar (kein gültiges JSON)",
                                                give_up=True)
            await _notify(f"⚠️ Entwurf für {T.CHANNEL_LABEL.get(channel, channel)} hat unlesbare "
                          f"Tags und wurde nicht gepostet.\n{d['url']}")
            continue

        post = Post(
            text=models.effective_body(d),
            url=d["url"],
            title=d["title"],
            image_url=d["image_url"],
            tags=tags,
            category=d["category"],
        )

        if config.is_dry(channel):
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
            if result.outcome_unknown:
                # Kein Retry: der Post könnte schon draußen sein, ein zweiter wäre ein Doppelpost.
                await models.record_attempt_failure(
                    d["id"], f"Ausgang unbekannt: {result.error or 'unbekannt'}", give_up=True)
                await _notify(T.outcome_unknown_note(channel, d["url"], result.error or "unbekannt"))
                continue
            give_up = int(d["attempts"]) + 1 >= MAX_ATTEMPTS
            await models.record_attempt_failure(d["id"], result.error or "unbekannt", give_up)
            if give_up:
                await _notify(f"⚠️ Post auf {T.CHANNEL_LABEL.get(channel, channel)} "
                              f"nach {MAX_ATTEMPTS} Versuchen aufgegeben.\n{d['url']}")

    for channel, n in uebersprungen.items():
        log.warning("Kanal %s ist nicht in CHANNELS_ENABLED — %d freigegebene(r) Entwurf/Entwürfe "
                    "bleiben liegen.", channel, n)


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
