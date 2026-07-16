"""Freigabe-Callbacks: ✅/✏️/❌ je Entwurf + 'alle freigeben/verwerfen'.

Callback-Daten: d:<id>:ok|ed|no  und  b:<day>:all|no
Der ✏️-Dialog merkt sich (user_id → draft_id) in runtime.awaiting_edit; die nächste
Textnachricht des Users setzt body_edited und gibt frei.
"""
import logging

from telegram import Update
from telegram.ext import ContextTypes

from .. import settings, models, runtime, texts_de as T

log = logging.getLogger(__name__)


async def _allowed(update: Update) -> bool:
    allowed = await settings.approval_chat_id()
    chat_id = update.effective_chat.id if update.effective_chat else None
    return allowed is None or chat_id == allowed


async def on_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if not await _allowed(update):
        await query.answer(T.ONLY_APPROVAL_CHAT, show_alert=True)
        return

    parts = (query.data or "").split(":")
    kind = parts[0]

    if kind == "d" and len(parts) == 3:
        draft_id, action = int(parts[1]), parts[2]
        draft = await models.get_draft(draft_id)
        if draft is None:
            await query.answer("Entwurf nicht gefunden.")
            return
        if draft["state"] != "pending":
            await query.answer(f"Schon erledigt ({draft['state']}).")
            return

        if action == "ok":
            await models.approve(draft_id)
            await query.answer("Freigegeben ✅")
            await _strip_keyboard(query, T.APPROVED)
        elif action == "no":
            await models.reject(draft_id)
            await query.answer("Verworfen ❌")
            await _strip_keyboard(query, T.REJECTED)
        elif action == "ed":
            runtime.awaiting_edit[query.from_user.id] = draft_id
            await query.answer()
            await query.message.reply_text(T.EDIT_PROMPT)
        return

    if kind == "b" and len(parts) == 3:
        day, action = parts[1], parts[2]
        pending = await models.pending_for_batch(day)
        for d in pending:
            if action == "all":
                await models.approve(d["id"])
            elif action == "no":
                await models.reject(d["id"])
        await query.answer("Erledigt.")
        await query.edit_message_text(T.ALL_APPROVED if action == "all" else T.ALL_REJECTED)
        return

    await query.answer()


async def on_edit_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Freie Textnachricht: nur relevant, wenn der User gerade einen Entwurf umschreibt."""
    if not await _allowed(update):
        return
    user_id = update.effective_user.id
    draft_id = runtime.awaiting_edit.pop(user_id, None)
    if draft_id is None:
        return  # keine offene Editier-Anfrage → ignorieren
    text = (update.message.text or "").strip()
    if not text:
        await update.message.reply_text("Leerer Text — abgebrochen.")
        return
    await models.set_edit_and_approve(draft_id, text)
    await update.message.reply_text(T.EDIT_DONE)


async def _strip_keyboard(query, note: str) -> None:
    try:
        await query.edit_message_text(f"{query.message.text}\n\n{note}")
    except Exception:
        pass
