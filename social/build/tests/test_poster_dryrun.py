"""Kanalweiser Trockenmodus: DRY_RUN_CHANNELS haelt einzelne Kanaele zurueck (ohne Postgres)."""
from app import config, models, poster
from app.channels import registry
from app.channels.base import PostResult


def test_is_dry_bei_globalem_dry_run(monkeypatch):
    monkeypatch.setattr(config, "DRY_RUN", True)
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset())
    assert config.is_dry("tumblr") is True


def test_is_dry_nur_fuer_gelistete_kanaele(monkeypatch):
    monkeypatch.setattr(config, "DRY_RUN", False)
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset({"bluesky", "mastodon"}))
    assert config.is_dry("bluesky") is True
    assert config.is_dry("mastodon") is True
    assert config.is_dry("tumblr") is False


def test_is_dry_ohne_liste_und_ohne_dry_run_ist_live(monkeypatch):
    monkeypatch.setattr(config, "DRY_RUN", False)
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset())
    assert config.is_dry("bluesky") is False


class _FakeChannel:
    def __init__(self):
        self.posts = []

    async def post(self, post):
        self.posts.append(post)
        return PostResult(ok=True, external_id="echt-1")


async def _entwurf(channel, source_ref):
    did = await models.enqueue(
        batch_day="2026-11-02", channel=channel, source_kind="article",
        source_ref=source_ref, url=f"https://otakupulse.de/news/{source_ref}",
        image_url=None, title="T", body="B", perishable=True,
    )
    await models.approve(did)
    return did


async def test_post_pass_ruft_adapter_nur_fuer_nicht_trockene_kanaele(tmp_db, monkeypatch):
    """Kern des Tasks: DRY_RUN=0 + DRY_RUN_CHANNELS={bluesky} darf Bluesky nie echt posten."""
    adapter = {"bluesky": _FakeChannel(), "tumblr": _FakeChannel()}

    async def keine_meldung(text):
        pass

    monkeypatch.setattr(config, "DRY_RUN", False)
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset({"bluesky"}))
    monkeypatch.setattr(registry, "get", lambda name: adapter.get(name))
    monkeypatch.setattr(poster, "_notify", keine_meldung)

    bsky = await _entwurf("bluesky", "1")
    tmblr = await _entwurf("tumblr", "2")
    await poster.run_post_pass()

    assert adapter["bluesky"].posts == []  # Trockenkanal: Adapter nie aufgerufen
    assert len(adapter["tumblr"].posts) == 1  # Live-Kanal: echter Post

    d_bsky = await models.get_draft(bsky)
    assert d_bsky["state"] == "posted"
    assert d_bsky["external_id"] == f"dry-{bsky}"
    d_tmblr = await models.get_draft(tmblr)
    assert d_tmblr["state"] == "posted"
    assert d_tmblr["external_id"] == "echt-1"
