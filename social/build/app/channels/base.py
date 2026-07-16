"""Gemeinsames Kanal-Interface. Ein neuer Kanal ist damit ~50 Zeilen."""
from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class PostResult:
    ok: bool
    external_id: str | None = None
    error: str | None = None
    retry_after: int | None = None  # Sekunden, aus Retry-After-Header


@dataclass
class Post:
    """Was gepostet werden soll — kanal-agnostisch."""
    text: str
    url: str
    title: str | None = None
    image_url: str | None = None


class Channel(ABC):
    name: str = "base"
    char_limit: int = 500
    supports_replies: bool = False

    @abstractmethod
    async def post(self, post: Post) -> PostResult:
        ...

    async def fetch_replies(self, since):
        return []  # Default: Kanal kann es nicht
