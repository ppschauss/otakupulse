"""Kanalweiser Trockenmodus: DRY_RUN_CHANNELS haelt einzelne Kanaele zurueck (ohne Postgres)."""
from app import config, models, poster, texts_de as T
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


# ---------- Statusanzeige: Ist-Zustand je Kanal ----------

def _modus(monkeypatch, dry_run, dry_channels, enabled=("bluesky", "mastodon", "tumblr")):
    monkeypatch.setattr(config, "DRY_RUN", dry_run)
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset(dry_channels))
    monkeypatch.setattr(config, "CHANNELS_ENABLED", list(enabled))


def test_mode_summary_nennt_live_und_trockene_kanaele(monkeypatch):
    _modus(monkeypatch, False, {"bluesky", "mastodon"})
    assert config.mode_summary() == "LIVE: tumblr · TROCKEN: bluesky, mastodon"
    assert config.live_channels() == ["tumblr"]
    assert config.dry_channels() == ["bluesky", "mastodon"]
    assert config.all_dry() is False


def test_mode_summary_bei_dry_run_ist_alles_trocken(monkeypatch):
    _modus(monkeypatch, True, {"bluesky"})
    assert config.mode_summary() == "TROCKENMODUS (alle Kanäle)"
    assert config.dry_channels() == ["bluesky", "mastodon", "tumblr"]
    assert config.all_dry() is True


def test_mode_summary_alles_live_ohne_trockenliste(monkeypatch):
    _modus(monkeypatch, False, set())
    assert config.mode_summary() == "LIVE: bluesky, mastodon, tumblr"
    assert config.all_dry() is False


def test_mode_summary_wenn_alle_kanaele_in_der_trockenliste_stehen(monkeypatch):
    _modus(monkeypatch, False, {"bluesky", "mastodon", "tumblr"})
    assert config.mode_summary() == "TROCKENMODUS (alle Kanäle)"
    assert config.all_dry() is True


def test_batch_header_banner_folgt_dem_ist_zustand():
    teil = T.batch_header("2026-11-02", 3, ["bluesky", "mastodon"], alle=False)
    assert "TROCKEN für" in teil and "Bluesky" in teil
    assert "TROCKENMODUS — es wird nichts" not in teil
    alle = T.batch_header("2026-11-02", 3, ["bluesky"], alle=True)
    assert alle.startswith(T.DRY_RUN_BANNER)
    live = T.batch_header("2026-11-02", 3, [], alle=False)
    assert "🧪" not in live


# ---------- Parsen von DRY_RUN_CHANNELS ----------

def test_csv_set_trimmt_und_kleinschreibt(monkeypatch):
    monkeypatch.setenv("DRY_RUN_CHANNELS", " Bluesky , MASTODON ,, tumblr")
    assert config._csv_set("DRY_RUN_CHANNELS") == frozenset({"bluesky", "mastodon", "tumblr"})


def test_csv_set_leerer_wert_und_fehlende_variable(monkeypatch):
    monkeypatch.setenv("DRY_RUN_CHANNELS", "")
    assert config._csv_set("DRY_RUN_CHANNELS") == frozenset()
    monkeypatch.setenv("DRY_RUN_CHANNELS", " , ,")
    assert config._csv_set("DRY_RUN_CHANNELS") == frozenset()
    monkeypatch.delenv("DRY_RUN_CHANNELS")
    assert config._csv_set("DRY_RUN_CHANNELS") == frozenset()
