"""Alle deutschen Texte + Inline-Keyboards zentral."""
from telegram import InlineKeyboardButton, InlineKeyboardMarkup

CHANNEL_LABEL = {
    "bluesky": "Bluesky",
    "mastodon": "Mastodon",
    "discord": "Discord",
    "reddit": "Reddit",
    "facebook": "Facebook",
    "x": "X",
}

START = (
    "👋 OtakuPulse Social-Agent ist bereit.\n\n"
    "Ich formuliere Posts aus neuen Artikeln und schicke sie dir hier einmal am Tag "
    "als Freigabe-Batch. Du tippst ✅ (posten), ✏️ (umschreiben) oder ❌ (verwerfen).\n\n"
    "Dieser Chat ist jetzt als Freigabe-Chat registriert."
)

ONLY_APPROVAL_CHAT = "Dieser Bot antwortet nur im Freigabe-Chat."

DRY_RUN_BANNER = "🧪 TROCKENMODUS — es wird nichts wirklich gepostet.\n\n"


def batch_header(day: str, n: int, dry: bool) -> str:
    prefix = DRY_RUN_BANNER if dry else ""
    if n == 0:
        return prefix + f"📋 Keine neuen Entwürfe für heute ({day})."
    return prefix + f"📋 {n} Entwurf(e) für heute ({day}) — bitte durchsehen:"


def draft_message(idx: int, total: int, draft) -> str:
    ch = CHANNEL_LABEL.get(draft["channel"], draft["channel"])
    perish = " · verfällt in 48 h" if draft["perishable_at"] else ""
    body = draft["body_edited"] or draft["body"]
    return (
        f"{idx}/{total} · {ch}{perish}\n"
        f"────────────\n"
        f"{body}\n\n"
        f"🔗 {draft['url']}"
    )


def draft_keyboard(draft_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("✅", callback_data=f"d:{draft_id}:ok"),
        InlineKeyboardButton("✏️", callback_data=f"d:{draft_id}:ed"),
        InlineKeyboardButton("❌", callback_data=f"d:{draft_id}:no"),
    ]])


def batch_footer_keyboard(day: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Alle freigeben", callback_data=f"b:{day}:all"),
        InlineKeyboardButton("❌ Alle verwerfen", callback_data=f"b:{day}:no"),
    ]])


APPROVED = "✅ Freigegeben — geht beim nächsten Post-Lauf raus."
REJECTED = "❌ Verworfen."
EDIT_PROMPT = "✏️ Sende mir den neuen Text für diesen Post (eine Nachricht)."
EDIT_DONE = "✅ Text übernommen und freigegeben."
EDIT_NONE = "Kein Entwurf wartet gerade auf eine Textänderung."
ALL_APPROVED = "✅ Alle offenen Entwürfe dieses Batches freigegeben."
ALL_REJECTED = "❌ Alle offenen Entwürfe dieses Batches verworfen."


def nudge(n: int, expiring: int) -> str:
    extra = f", davon {expiring} verfallen heute" if expiring else ""
    return f"⏰ {n} Entwurf(e) warten noch auf deine Freigabe{extra}."


def posted_note(channel: str, url: str, external_id: str | None) -> str:
    ch = CHANNEL_LABEL.get(channel, channel)
    ref = f"\n{external_id}" if external_id and not external_id.startswith("dry-") else ""
    return f"📤 Auf {ch} gepostet.\n{url}{ref}"


def channel_down(channel: str, error: str) -> str:
    ch = CHANNEL_LABEL.get(channel, channel)
    return f"🚨 {ch} macht Probleme — Kanal für 6 h stillgelegt.\nFehler: {error[:200]}"


def channel_up(channel: str) -> str:
    return f"✅ {CHANNEL_LABEL.get(channel, channel)} läuft wieder."
