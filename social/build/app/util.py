"""Zeit- und Text-Helfer. Speicherung immer als UTC-ISO; 'logischer Tag' = lokales Datum."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from . import config


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_utc_iso() -> str:
    return now_utc().isoformat()


def now_local() -> datetime:
    return datetime.now(ZoneInfo(config.TZ))


def today_str() -> str:
    return now_local().date().isoformat()


def parse_iso(s: str) -> datetime:
    dt = datetime.fromisoformat(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def truncate(text: str, limit: int) -> str:
    """Kürzt auf limit Zeichen, bevorzugt an einer Satz-/Wortgrenze."""
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    # bevorzugt am letzten Satzende, sonst am letzten Leerzeichen
    for sep in (". ", "! ", "? ", "\n"):
        idx = cut.rfind(sep)
        if idx >= limit * 0.5:
            return cut[: idx + 1].strip()
    idx = cut.rfind(" ")
    if idx >= limit * 0.5:
        cut = cut[:idx]
    return cut.rstrip() + "…"
