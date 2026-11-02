"""Environment-Konfiguration (Secrets, Pfade, Feature-Flags).

env liefert nur den Bootstrap; Laufzeit-Settings (z.B. Freigabe-Chat) liegen in der DB.
Pflicht-Variablen fehlen laut = harter KeyError beim Start (fail-fast, kein stiller Default).
"""
import logging
import os


def _req(key: str) -> str:
    v = os.environ.get(key, "").strip()
    if not v:
        raise KeyError(f"Pflicht-Umgebungsvariable {key} fehlt (siehe secrets.env.example)")
    return v


def _int(key: str, default: int, minimum: int | None = None) -> int:
    """Ganzzahl aus der Umgebung. Leer oder unlesbar -> Default; unter `minimum` -> Default + Warnung.

    Ein Tippfehler in der env-Datei soll den Start nicht abbrechen und nichts still verfallen lassen.
    """
    raw = os.environ.get(key)
    if raw is None or not raw.strip():
        return default
    try:
        wert = int(raw.strip())
    except ValueError:
        logging.getLogger(__name__).warning(
            "%s=%r ist keine Ganzzahl — Default %d gilt.", key, raw, default)
        return default
    if minimum is not None and wert < minimum:
        logging.getLogger(__name__).warning(
            "%s=%d liegt unter %d — Default %d gilt.", key, wert, minimum, default)
        return default
    return wert


def _bool(key: str, default: bool) -> bool:
    raw = os.environ.get(key)
    if raw is None or not raw.strip():
        return default  # fehlend, leer oder nur Leerzeichen: Default, nie stillschweigend "falsch"
    return raw.strip().lower() not in ("0", "false", "no", "off", "")


def _csv_set(key: str) -> frozenset[str]:
    """Kommaseparierte Umgebungsvariable als Menge: getrimmt, kleingeschrieben, leere Teile weg."""
    return frozenset(c.strip().lower() for c in os.environ.get(key, "").split(",") if c.strip())


# --- Pflicht ---
SOCIAL_BOT_TOKEN = _req("SOCIAL_BOT_TOKEN")
ANTHROPIC_API_KEY = _req("ANTHROPIC_API_KEY")

# --- Pfade / Modus ---
DB_PATH = os.environ.get("DB_PATH", "/data/social.sqlite3")
DRY_RUN = _bool("DRY_RUN", True)  # Standard: Trockenmodus
TZ = os.environ.get("TZ", "Europe/Berlin")

# --- Telegram-Steuerpult ---
BOOTSTRAP_APPROVAL_CHAT_ID = (
    os.environ.get("SOCIAL_APPROVAL_CHAT_ID")
    or os.environ.get("ALERT_CHAT_ID", "")
).strip()

# --- Formulierung ---
MODEL = os.environ.get("SOCIAL_MODEL", "claude-sonnet-5")

# --- Kanäle ---
CHANNELS_ENABLED = [c.strip() for c in os.environ.get("CHANNELS_ENABLED", "").split(",") if c.strip()]

# Kanalweiser Trockenmodus: diese Kanäle posten nie echt, auch wenn DRY_RUN=0.
# Default leer; so lässt sich ein einzelner Kanal live schalten, ohne die anderen mitzureißen.
DRY_RUN_CHANNELS = _csv_set("DRY_RUN_CHANNELS")


def is_dry(channel: str) -> bool:
    """True, wenn für diesen Kanal nur simuliert wird (global oder kanalweise)."""
    return DRY_RUN or channel.strip().lower() in DRY_RUN_CHANNELS


def dry_channels() -> list[str]:
    """Aktivierte Kanäle, die gerade nur simuliert werden (in CHANNELS_ENABLED-Reihenfolge)."""
    return [c for c in CHANNELS_ENABLED if is_dry(c)]


def live_channels() -> list[str]:
    """Aktivierte Kanäle, die wirklich posten."""
    return [c for c in CHANNELS_ENABLED if not is_dry(c)]


def all_dry() -> bool:
    """True, wenn kein einziger Kanal echt postet (DRY_RUN=1 oder alle aktivierten trocken)."""
    return DRY_RUN or (bool(CHANNELS_ENABLED) and not live_channels())


def mode_summary() -> str:
    """Lesbarer Ist-Zustand je Kanal, nicht nur das globale Flag.

    DRY_RUN=1 -> immer "TROCKENMODUS" für alle Kanäle; sonst z.B.
    "LIVE: tumblr · TROCKEN: bluesky, mastodon".
    """
    live, dry = live_channels(), dry_channels()
    if DRY_RUN or (dry and not live):
        return "TROCKENMODUS (alle Kanäle)"
    if not live:
        return "keine Kanäle aktiv"
    teile = ["LIVE: " + ", ".join(live)]
    if dry:
        teile.append("TROCKEN: " + ", ".join(dry))
    return " · ".join(teile)

# --- Quellen / Batch ---
SITE_BASE_URL = os.environ.get("SITE_BASE_URL", "https://www.otakupulse.de").rstrip("/")
BATCH_HOUR = int(os.environ.get("BATCH_HOUR", "18"))
BATCH_MINUTE = int(os.environ.get("BATCH_MINUTE", "0"))
MAX_DRAFTS_PER_BATCH = int(os.environ.get("MAX_DRAFTS_PER_BATCH", "6"))
PERISHABLE_HOURS = int(os.environ.get("PERISHABLE_HOURS", "48"))

# --- Postgres (read-only) ---
PG_HOST = os.environ.get("PG_HOST", "otakupulse-db")
PG_PORT = int(os.environ.get("PG_PORT", "5432"))
PG_DB = os.environ.get("PG_DB", "otakupulse")
PG_USER = os.environ.get("PG_USER", "social_ro")
PG_PASSWORD = os.environ.get("PG_PASSWORD", "")

# --- Kanal-Credentials ---
BLUESKY_HANDLE = os.environ.get("BLUESKY_HANDLE", "").strip()
BLUESKY_APP_PASSWORD = os.environ.get("BLUESKY_APP_PASSWORD", "").strip()
BLUESKY_PDS = os.environ.get("BLUESKY_PDS", "https://bsky.social").rstrip("/")

MASTODON_BASE_URL = os.environ.get("MASTODON_BASE_URL", "").rstrip("/")
MASTODON_ACCESS_TOKEN = os.environ.get("MASTODON_ACCESS_TOKEN", "").strip()
MASTODON_CHAR_LIMIT = int(os.environ.get("MASTODON_CHAR_LIMIT", "500"))

# Tumblr (OAuth 1.0a, siehe Modulkopf von channels/tumblr.py). Fehlende Werte sind kein Startfehler:
# der Adapter meldet sie erst beim Posten, damit ein deaktivierter Kanal nichts erzwingt.
TUMBLR_BLOG_IDENTIFIER = os.environ.get("TUMBLR_BLOG_IDENTIFIER", "").strip()
TUMBLR_CONSUMER_KEY = os.environ.get("TUMBLR_CONSUMER_KEY", "").strip()
TUMBLR_CONSUMER_SECRET = os.environ.get("TUMBLR_CONSUMER_SECRET", "").strip()
TUMBLR_OAUTH_TOKEN = os.environ.get("TUMBLR_OAUTH_TOKEN", "").strip()
TUMBLR_OAUTH_TOKEN_SECRET = os.environ.get("TUMBLR_OAUTH_TOKEN_SECRET", "").strip()
# Sicherheitsnetz, kein Steuerinstrument: der Ingest erzeugt ohnehin höchstens MAX_DRAFTS_PER_BATCH
# Entwürfe je Kanal und Tag. Ist das Limit erreicht, verfällt der Entwurf (kein Aufschieben).
TUMBLR_MAX_POSTS_PER_DAY = _int("TUMBLR_MAX_POSTS_PER_DAY", 6, minimum=1)


def validate_dry_config(bekannte_kanaele) -> list[str]:
    """Prüft DRY_RUN_CHANNELS gegen die bekannten Kanäle; liefert Warnungen (leer = alles gut).

    Ein Tippfehler oder falscher Trenner ("bluesky mastodon") trocknet sonst still nichts.
    """
    warnungen = []
    for name in sorted(DRY_RUN_CHANNELS - set(bekannte_kanaele)):
        warnungen.append(
            f"DRY_RUN_CHANNELS enthält unbekannten Kanal '{name}' (bekannt: "
            f"{', '.join(sorted(bekannte_kanaele))}). Trennzeichen ist das Komma. "
            "Dieser Eintrag trocknet NICHTS."
        )
    if not DRY_RUN and not DRY_RUN_CHANNELS:
        warnungen.append(
            "ACHTUNG: DRY_RUN=0 und DRY_RUN_CHANNELS ist leer — ALLE aktivierten Kanäle "
            "posten ab jetzt LIVE."
        )
    return warnungen
