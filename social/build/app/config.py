"""Environment-Konfiguration (Secrets, Pfade, Feature-Flags).

env liefert nur den Bootstrap; Laufzeit-Settings (z.B. Freigabe-Chat) liegen in der DB.
Pflicht-Variablen fehlen laut = harter KeyError beim Start (fail-fast, kein stiller Default).
"""
import os


def _req(key: str) -> str:
    v = os.environ.get(key, "").strip()
    if not v:
        raise KeyError(f"Pflicht-Umgebungsvariable {key} fehlt (siehe secrets.env.example)")
    return v


def _bool(key: str, default: bool) -> bool:
    raw = os.environ.get(key)
    if raw is None:
        return default
    return raw.strip().lower() not in ("0", "false", "no", "off", "")


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
