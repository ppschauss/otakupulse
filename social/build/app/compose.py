"""LLM-Formulierung: aus einem Artikel je Kanal einen eigenen Post.

Ein Anthropic-Call pro Quelle für ALLE aktiven Kanäle auf einmal (JSON-Schema-Response) —
spart Tokens und garantiert unterschiedliche Varianten, weil das Modell sie nebeneinander sieht.
Zeichenlimits werden im Code hart nachgeprüft, nicht dem Modell überlassen.

Modell/Params kommen aus dem claude-api-Skill (Stand 2026-07): claude-sonnet-5, structured
outputs via output_config.format, KEIN temperature/top_p (auf Sonnet 5 abgelehnt), thinking
disabled (deterministische, schnelle Kurzcopy — der Batch ist nicht latenzkritisch).
"""
import json
import logging

from anthropic import AsyncAnthropic

from . import config
from .util import truncate

log = logging.getLogger(__name__)

_client = AsyncAnthropic(api_key=config.ANTHROPIC_API_KEY)

# Zeichenlimit je Kanal. Bei link-tragenden Kanälen zieht der Ingest den Link separat an,
# hier zählt nur der reine Text.
CHAR_LIMIT = {
    "bluesky": 300,
    "mastodon": config.MASTODON_CHAR_LIMIT,
    "discord": 2000,
    "reddit": 300,      # Titel
    "x": 280,
    "facebook": 600,
}

SYSTEM = """Du bist Redakteur:in beim deutschsprachigen Anime-Magazin OtakuPulse und schreibst \
Social-Media-Posts für die EIGENEN Kanäle. Zielgruppe: Anime-Fans und Otakus.

Stil: energiegeladen, fan-nah und meinungsstark, ABER faktenstark ("Hype trifft Substanz"). \
Sprich mit "du" an. Dosierter Community-Slang (Sakuga, Simulcast, Best Girl, Isekai, Waifu) \
ist erwünscht, aber nicht überladen oder cringe.

Erfinde KEINE Fakten, Titel, Studios oder Termine. Nutze ausschließlich den gegebenen Kontext. \
Fehlt eine Information, lass sie weg.

Das darf NICHT nach RSS-Bot klingen: kein "Neuer Artikel:", kein blanker Titel + Link, \
keine Hashtag-Wand. Ein Gedanke, ein Grund zum Klicken.

Jeder Kanal bekommt eine EIGENE Formulierung — nicht denselben Text gekürzt. Den Link NICHT \
in den Text schreiben; der wird separat angehängt bzw. als Vorschau-Karte gesetzt."""


def _schema(channels: list[str]) -> dict:
    props = {ch: {"type": "string"} for ch in channels}
    return {
        "type": "object",
        "properties": props,
        "required": list(props.keys()),
        "additionalProperties": False,
    }


def _user_prompt(item, channels: list[str]) -> str:
    limits = "\n".join(f"- {ch}: max {CHAR_LIMIT.get(ch, 500)} Zeichen" for ch in channels)
    return (
        f"ARTIKEL\n"
        f"Titel: {item.title}\n"
        f"Teaser: {item.excerpt}\n\n"
        f"Schreibe je einen Post für diese Kanäle (Zeichenlimits einhalten):\n{limits}\n\n"
        f"Antworte als JSON mit genau diesen Feldern: {', '.join(channels)}."
    )


async def compose_for(item, channels: list[str]) -> dict[str, str]:
    """Gibt {channel: text} zurück. Bei Überlänge ein Repair-Call, dann hartes Kürzen."""
    if not channels:
        return {}
    resp = await _client.messages.create(
        model=config.MODEL,
        max_tokens=1500,
        thinking={"type": "disabled"},
        system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}],
        output_config={"format": {"type": "json_schema", "schema": _schema(channels)}},
        messages=[{"role": "user", "content": _user_prompt(item, channels)}],
    )
    text = next((b.text for b in resp.content if b.type == "text"), "{}")
    data = json.loads(text)

    out: dict[str, str] = {}
    for ch in channels:
        val = (data.get(ch) or "").strip()
        limit = CHAR_LIMIT.get(ch, 500)
        out[ch] = val if len(val) <= limit else truncate(val, limit)
    return out
