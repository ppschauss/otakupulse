"""Mastodon-Adapter.

POST /api/v1/statuses mit Bearer-Token. Der Link wird an den Text gehängt — Mastodon
verlinkt ihn automatisch und unfurlt die OG-Karte (Bild kommt vom Artikel selbst).
Das Instanz-Zeichenlimit wird lazy aus GET /api/v1/instance gelesen (Fallback: Config-Wert).
"""
import logging

import httpx

from .. import config
from ..util import truncate
from .base import Channel, Post, PostResult

log = logging.getLogger(__name__)


class Mastodon(Channel):
    name = "mastodon"
    supports_replies = True  # v2: /statuses/:id/context

    def __init__(self):
        self._base = config.MASTODON_BASE_URL
        self._token = config.MASTODON_ACCESS_TOKEN
        self.char_limit = config.MASTODON_CHAR_LIMIT
        self._limit_checked = False

    async def _ensure_limit(self, client: httpx.AsyncClient) -> None:
        if self._limit_checked:
            return
        self._limit_checked = True
        try:
            r = await client.get(f"{self._base}/api/v1/instance", timeout=15)
            r.raise_for_status()
            maxc = (r.json().get("configuration", {}).get("statuses", {}) or {}).get("max_characters")
            if isinstance(maxc, int) and maxc > 0:
                self.char_limit = maxc
        except Exception:
            log.info("Mastodon-Instanzlimit nicht lesbar, nutze %d", self.char_limit)

    async def post(self, post: Post) -> PostResult:
        headers = {"Authorization": f"Bearer {self._token}"}
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                await self._ensure_limit(client)
                # Link zählt zum Limit; Mastodon rechnet URLs zwar als 23 Zeichen, wir bleiben
                # konservativ und kürzen den Fließtext gegen das volle Limit minus Link.
                room = max(50, self.char_limit - len(post.url) - 1)
                body = f"{truncate(post.text, room)}\n{post.url}"
                r = await client.post(
                    f"{self._base}/api/v1/statuses",
                    headers=headers, json={"status": body},
                )
                if r.status_code == 429:
                    ra = int(r.headers.get("retry-after", "0")) or None
                    return PostResult(ok=False, error="429 rate limited", retry_after=ra)
                r.raise_for_status()
                return PostResult(ok=True, external_id=str(r.json().get("id")))
        except httpx.HTTPStatusError as e:
            return PostResult(ok=False, error=f"HTTP {e.response.status_code}: {e.response.text[:200]}")
        except Exception as e:  # noqa: BLE001
            return PostResult(ok=False, error=str(e))
