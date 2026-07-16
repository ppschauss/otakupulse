"""Slash-Kommandos: /start /status /hilfe /pause /resume /batch (Testauslöser)."""
import logging

from telegram import Update, BotCommand, BotCommandScopeChat
from telegram.ext import ContextTypes

from .. import settings, models, config, batch, texts_de as T
from ..channels import registry

log = logging.getLogger(__name__)


async def _guard(update: Update) -> bool:
    """Nur der registrierte Freigabe-Chat darf steuern. Erster /start registriert ihn."""
    chat_id = update.effective_chat.id if update.effective_chat else None
    allowed = await settings.approval_chat_id()
    if allowed is None:
        return True  # Bootstrap: /start setzt ihn gleich
    return chat_id == allowed


async def cmd_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    if (await settings.approval_chat_id()) is None:
        await settings.set("approval_chat_id", chat_id)
    if not await _guard(update):
        await update.message.reply_text(T.ONLY_APPROVAL_CHAT)
        return
    await update.message.reply_text(T.START)


async def cmd_status(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _guard(update):
        return
    counts = await models.counts_by_state()
    seen = await models.seen_count()
    channels = ", ".join(registry.active_channel_names()) or "keine"
    paused = "ja" if await settings.is_paused() else "nein"
    mode = "TROCKENMODUS 🧪" if config.DRY_RUN else "LIVE"
    lines = [
        f"Modus: {mode}",
        f"Kanäle: {channels}",
        f"Pausiert: {paused}",
        f"Bekannte Quellen (seen): {seen}",
        "Entwürfe:",
    ]
    for st in ("pending", "approved", "posted", "rejected", "expired", "failed"):
        lines.append(f"  {st}: {counts.get(st, 0)}")
    await update.message.reply_text("\n".join(lines))


async def cmd_pause(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _guard(update):
        return
    await settings.set("paused", "1")
    await update.message.reply_text("⏸ Posten pausiert. Entwürfe entstehen weiter.")


async def cmd_resume(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not await _guard(update):
        return
    await settings.set("paused", "0")
    await update.message.reply_text("▶️ Posten wieder aktiv.")


async def cmd_batch(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Testauslöser: Batch jetzt bauen und schicken, statt auf 18:00 zu warten."""
    if not await _guard(update):
        return
    await update.message.reply_text("⏳ Baue Batch (Ingest + Formulierung)…")
    await batch.run_daily()


async def set_menu(app) -> None:
    cmds = [
        BotCommand("start", "Bot starten / Chat registrieren"),
        BotCommand("status", "Zustand & Entwurfs-Zähler"),
        BotCommand("batch", "Batch jetzt bauen (Test)"),
        BotCommand("pause", "Posten pausieren"),
        BotCommand("resume", "Posten fortsetzen"),
    ]
    # Auf den Freigabe-Chat scopen, damit der (evtl. geteilte @otakupulse_de_bot)
    # sein globales Kommando-Menü behält und fremde DM-Nutzer diese Befehle nicht sehen.
    chat_id = await settings.approval_chat_id()
    if chat_id:
        await app.bot.set_my_commands(cmds, scope=BotCommandScopeChat(chat_id=chat_id))
    else:
        await app.bot.set_my_commands(cmds)
