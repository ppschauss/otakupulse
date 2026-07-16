"""Config-gesteuerte Aktivierung der Kanäle (CHANNELS_ENABLED)."""
import logging

from .. import config
from .bluesky import Bluesky
from .mastodon import Mastodon

log = logging.getLogger(__name__)

_FACTORY = {
    "bluesky": Bluesky,
    "mastodon": Mastodon,
    # v2.5: "discord": Discord, "x": IftttX
    # v3:   "reddit": Reddit, "facebook": Facebook
}

_instances: dict = {}


def active_channel_names() -> list[str]:
    return [c for c in config.CHANNELS_ENABLED if c in _FACTORY]


def get(name: str):
    if name not in _instances:
        factory = _FACTORY.get(name)
        if factory is None:
            return None
        _instances[name] = factory()
    return _instances[name]
