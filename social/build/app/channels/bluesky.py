"""Bluesky-Adapter (AT-Protocol).

Ablauf: createSession (App-Passwort → JWT) → createRecord (app.bsky.feed.post).
Der Link steckt NICHT im Text, sondern als externe Link-Karte (app.bsky.embed.external) —
damit umgehen wir die Facet-Byte-Offset-Stolperfalle komplett (die bei Umlauten bricht).
Thumbnail wird best-effort via uploadBlob gesetzt; scheitert das, bleibt die Karte ohne Bild.
"""
import logging

import httpx

from .. import config
from ..util import now_utc
from .base import Channel, Post, PostResult

log = logging.getLogger(__name__)


class Bluesky(Channel):
    name = "bluesky"
    char_limit = 300
    supports_replies = True  # v2: getPostThread

    def __init__(self):
        self._pds = config.BLUESKY_PDS
        self._handle = config.BLUESKY_HANDLE
        self._app_password = config.BLUESKY_APP_PASSWORD

    async def _session(self, client: httpx.AsyncClient) -> dict:
        r = await client.post(
            f"{self._pds}/xrpc/com.atproto.server.createSession",
            json={"identifier": self._handle, "password": self._app_password},
        )
        r.raise_for_status()
        return r.json()

    async def _upload_thumb(self, client, jwt: str, image_url: str):
        try:
            img = await client.get(image_url, timeout=15)
            img.raise_for_status()
            content_type = img.headers.get("content-type", "image/jpeg")
            up = await client.post(
                f"{self._pds}/xrpc/com.atproto.repo.uploadBlob",
                content=img.content,
                headers={"Authorization": f"Bearer {jwt}", "Content-Type": content_type},
            )
            up.raise_for_status()
            return up.json().get("blob")
        except Exception:
            log.info("Bluesky-Thumb konnte nicht geladen werden (Karte bleibt ohne Bild)")
            return None

    async def post(self, post: Post) -> PostResult:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                sess = await self._session(client)
                jwt, did = sess["accessJwt"], sess["did"]

                external = {
                    "uri": post.url,
                    "title": (post.title or "OtakuPulse")[:300],
                    "description": post.text[:1000],
                }
                if post.image_url:
                    blob = await self._upload_thumb(client, jwt, post.image_url)
                    if blob:
                        external["thumb"] = blob

                record = {
                    "$type": "app.bsky.feed.post",
                    "text": post.text[:self.char_limit],
                    "createdAt": now_utc().isoformat().replace("+00:00", "Z"),
                    "embed": {"$type": "app.bsky.embed.external", "external": external},
                }
                r = await client.post(
                    f"{self._pds}/xrpc/com.atproto.repo.createRecord",
                    headers={"Authorization": f"Bearer {jwt}"},
                    json={"repo": did, "collection": "app.bsky.feed.post", "record": record},
                )
                if r.status_code == 429:
                    ra = int(r.headers.get("retry-after", "0")) or None
                    return PostResult(ok=False, error="429 rate limited", retry_after=ra)
                r.raise_for_status()
                return PostResult(ok=True, external_id=r.json().get("uri"))
        except httpx.HTTPStatusError as e:
            return PostResult(ok=False, error=f"HTTP {e.response.status_code}: {e.response.text[:200]}")
        except Exception as e:  # noqa: BLE001
            return PostResult(ok=False, error=str(e))
