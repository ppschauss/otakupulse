"""Poster: "Ausgang unbekannt" wird nie wiederholt (Doppelpost-Schutz), sichere Fehler schon."""
import httpx
import pytest

from app import config, models, poster
from app.channels import registry
from app.channels.base import PostResult
from app.channels.tumblr import Tumblr


class _Fake:
    def __init__(self, result):
        self.result = result
        self.calls = 0

    async def post(self, post):
        self.calls += 1
        return self.result


@pytest.fixture
def meldungen(monkeypatch):
    gesendet = []

    async def merken(text):
        gesendet.append(text)

    monkeypatch.setattr(poster, "_notify", merken)
    monkeypatch.setattr(config, "DRY_RUN", False)
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset())
    monkeypatch.setattr(config, "CHANNELS_ENABLED", ["tumblr", "mastodon"])
    return gesendet


async def _entwurf(channel="tumblr", ref="1"):
    did = await models.enqueue(
        batch_day="2026-11-02", channel=channel, source_kind="article", source_ref=ref,
        url=f"https://otakupulse.de/news/{ref}", image_url=None, title="T", body="B",
        perishable=True,
    )
    await models.approve(did)
    return did


def test_postresult_hat_outcome_unknown_mit_default_false():
    assert PostResult(ok=False).outcome_unknown is False


async def test_ausgang_unbekannt_gibt_sofort_auf_und_meldet(tmp_db, monkeypatch, meldungen):
    fake = _Fake(PostResult(ok=False, error="ReadTimeout: ", outcome_unknown=True))
    monkeypatch.setattr(registry, "get", lambda name: fake)
    did = await _entwurf()

    await poster.run_post_pass()
    d = await models.get_draft(did)
    assert d["state"] == "failed" and d["attempts"] == 1
    assert "ReadTimeout" in d["last_error"]
    assert len(meldungen) == 1
    assert "Ausgang unbekannt" in meldungen[0] and "Blog" in meldungen[0]
    assert "https://otakupulse.de/news/1" in meldungen[0]

    await poster.run_post_pass()  # kein zweiter Versuch
    assert fake.calls == 1


async def test_sicherer_fehler_bleibt_im_normalen_retry_pfad(tmp_db, monkeypatch, meldungen):
    fake = _Fake(PostResult(ok=False, error="ConnectError: kein Netz"))
    monkeypatch.setattr(registry, "get", lambda name: fake)
    did = await _entwurf()

    await poster.run_post_pass()
    d = await models.get_draft(did)
    assert d["state"] == "approved" and d["attempts"] == 1  # wird später wiederholt
    assert meldungen == []


async def test_mastodon_ohne_flag_unveraendert(tmp_db, monkeypatch, meldungen):
    fake = _Fake(PostResult(ok=False, error="HTTP 502: Bad Gateway"))
    monkeypatch.setattr(registry, "get", lambda name: fake)
    did = await _entwurf("mastodon", "2")

    await poster.run_post_pass()
    d = await models.get_draft(did)
    assert d["state"] == "approved" and d["attempts"] == 1
    assert meldungen == []


# --- Ende zu Ende mit dem echten Adapter gegen pytest-httpx ---

@pytest.fixture
def tumblr_adapter(monkeypatch):
    for k, v in (("TUMBLR_BLOG_IDENTIFIER", "b.example"), ("TUMBLR_CONSUMER_KEY", "ck"),
                 ("TUMBLR_CONSUMER_SECRET", "cs"), ("TUMBLR_OAUTH_TOKEN", "t"),
                 ("TUMBLR_OAUTH_TOKEN_SECRET", "ts")):
        monkeypatch.setattr(config, k, v)
    adapter = Tumblr()
    monkeypatch.setattr(registry, "get", lambda name: adapter)


async def test_read_timeout_endet_im_failed_ohne_zweiten_request(
        tmp_db, httpx_mock, meldungen, tumblr_adapter):
    httpx_mock.add_exception(httpx.ReadTimeout(""))
    did = await _entwurf()
    await poster.run_post_pass()
    await poster.run_post_pass()
    d = await models.get_draft(did)
    assert d["state"] == "failed"
    assert len(httpx_mock.get_requests()) == 1  # nie ein zweiter Versuch
    assert any("Ausgang unbekannt" in m for m in meldungen)


async def test_connect_error_bleibt_wiederholbar(tmp_db, httpx_mock, meldungen, tumblr_adapter):
    httpx_mock.add_exception(httpx.ConnectError("kein Netz"))
    did = await _entwurf()
    await poster.run_post_pass()
    d = await models.get_draft(did)
    assert d["state"] == "approved" and d["attempts"] == 1
    assert meldungen == []


async def test_abgerissene_verbindung_wird_nicht_wiederholt(
        tmp_db, httpx_mock, meldungen, tumblr_adapter):
    httpx_mock.add_exception(httpx.RemoteProtocolError("Server disconnected without sending a response."))
    did = await _entwurf()
    await poster.run_post_pass()
    await poster.run_post_pass()
    assert (await models.get_draft(did))["state"] == "failed"
    assert len(httpx_mock.get_requests()) == 1
    assert any("Ausgang unbekannt" in m for m in meldungen)


async def test_500_wird_nicht_wiederholt(tmp_db, httpx_mock, meldungen, tumblr_adapter):
    httpx_mock.add_response(status_code=500, text="boom")
    did = await _entwurf()
    await poster.run_post_pass()
    await poster.run_post_pass()
    assert (await models.get_draft(did))["state"] == "failed"
    assert len(httpx_mock.get_requests()) == 1
