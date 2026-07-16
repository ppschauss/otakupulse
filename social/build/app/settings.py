"""Globale Laufzeit-Settings (key/value als TEXT). env ist nur Bootstrap."""
from . import db, config
from .util import now_utc_iso

DEFAULTS = {
    "approval_chat_id": "",   # wird beim ersten /start gesetzt (oder aus env gebootstrappt)
    "paused": "0",            # '1' = Posten pausiert (Entwürfe entstehen weiter)
}


async def seed_defaults() -> None:
    c = db.conn()
    for k, v in DEFAULTS.items():
        await c.execute(
            "INSERT OR IGNORE INTO settings(key, value, updated_at) VALUES(?,?,?)",
            (k, v, now_utc_iso()),
        )
    await c.commit()
    if config.BOOTSTRAP_APPROVAL_CHAT_ID and not (await get("approval_chat_id")):
        await set("approval_chat_id", config.BOOTSTRAP_APPROVAL_CHAT_ID)


async def get(key: str) -> str:
    cur = await db.conn().execute("SELECT value FROM settings WHERE key=?", (key,))
    row = await cur.fetchone()
    return row["value"] if row else DEFAULTS.get(key, "")


async def set(key: str, value) -> None:
    await db.conn().execute(
        "INSERT INTO settings(key, value, updated_at) VALUES(?,?,?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
        (key, str(value), now_utc_iso()),
    )
    await db.conn().commit()


async def approval_chat_id() -> int | None:
    v = await get("approval_chat_id")
    return int(v) if v else None


async def is_paused() -> bool:
    return (await get("paused")) == "1"
