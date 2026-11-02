"""Poster: "Ausgang unbekannt" wird nie wiederholt (Doppelpost-Schutz), sichere Fehler schon."""
import asyncio

import httpx
import pytest

from app import config, db, models, poster
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
        # Ein echter Tumblr-Entwurf trägt immer Tags (tagging.tags_for liefert mindestens
        # "anime" und "otakupulse"); der Poster prüft das streng.
        tags=["anime", "otakupulse"] if channel == "tumblr" else None,
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


async def test_200_statt_201_wird_nicht_wiederholt(tmp_db, httpx_mock, meldungen, tumblr_adapter):
    """Ein 200 belegt keine Veröffentlichung — und darf trotzdem nie erneut gesendet werden."""
    httpx_mock.add_response(status_code=200, json={"response": {"id": 1}})
    did = await _entwurf()
    await poster.run_post_pass()
    await poster.run_post_pass()
    d = await models.get_draft(did)
    assert d["state"] == "failed" and d["last_error"].startswith(models.AUSGANG_UNBEKANNT)
    assert len(httpx_mock.get_requests()) == 1
    assert any("Ausgang unbekannt" in m for m in meldungen)


# --- C1: Abbruch im Sendefenster hinterlässt keinen 'approved'-Entwurf ---

class _Abbruch:
    """Adapter, der mitten im Senden abgebrochen wird (CancelledError ist eine BaseException)."""

    def __init__(self):
        self.calls = 0

    async def post(self, post):
        self.calls += 1
        raise asyncio.CancelledError()


async def test_abbruch_im_sendefenster_laesst_tumblr_entwurf_nicht_approved(
        tmp_db, monkeypatch, meldungen):
    """Container weg (Redeploy/SIGTERM/OOM), nachdem Tumblr den Post angenommen hat."""
    abbruch = _Abbruch()
    monkeypatch.setattr(registry, "get", lambda name: abbruch)
    did = await _entwurf()

    with pytest.raises(asyncio.CancelledError):
        await poster.run_post_pass()

    d = await models.get_draft(did)
    assert d["state"] == "failed"          # kein Retry zwei Minuten später
    assert d["last_error"].startswith(models.AUSGANG_UNBEKANNT)
    assert d["decided_at"]                 # steht damit in der Tagesmeldung

    await poster.run_post_pass()           # nächster Durchlauf: kein zweiter Versuch
    assert abbruch.calls == 1


async def test_vormerkung_gilt_nur_fuer_tumblr(tmp_db, monkeypatch, meldungen):
    """Bluesky/Mastodon haben die manuelle Freigabe — ihr Verhalten bleibt unverändert."""
    abbruch = _Abbruch()
    monkeypatch.setattr(registry, "get", lambda name: abbruch)
    did = await _entwurf("mastodon", "2")

    with pytest.raises(asyncio.CancelledError):
        await poster.run_post_pass()

    d = await models.get_draft(did)
    assert d["state"] == "approved" and d["attempts"] == 0 and d["last_error"] is None


async def test_erfolg_ueberschreibt_die_vormerkung(tmp_db, monkeypatch, meldungen):
    fake = _Fake(PostResult(ok=True, external_id="ext-1"))
    monkeypatch.setattr(registry, "get", lambda name: fake)
    did = await _entwurf()
    await poster.run_post_pass()
    d = await models.get_draft(did)
    assert d["state"] == "posted" and d["external_id"] == "ext-1"


async def _breaker_freigeben(channel="tumblr"):
    """Backoff des Breakers wegnehmen, damit der nächste Durchlauf den Kanal wieder anfasst."""
    await db.conn().execute(
        "UPDATE channel_state SET retry_after=NULL, open_until=NULL WHERE channel=?", (channel,))
    await db.conn().commit()


async def test_retry_limit_bleibt_bei_drei_versuchen(tmp_db, monkeypatch, meldungen):
    """Die Vormerkung zählt den Versuch; der Fehlschlag darf ihn nicht ein zweites Mal zählen."""
    fake = _Fake(PostResult(ok=False, error="ConnectError: kein Netz"))
    monkeypatch.setattr(registry, "get", lambda name: fake)
    did = await _entwurf()

    for erwartet in (1, 2):
        await poster.run_post_pass()
        d = await models.get_draft(did)
        assert (d["state"], d["attempts"]) == ("approved", erwartet)
        await _breaker_freigeben()

    await poster.run_post_pass()
    d = await models.get_draft(did)
    assert (d["state"], d["attempts"]) == ("failed", 3)
    assert fake.calls == 3


# --- C2: posted_log ist eine Schranke, nicht nur ein Protokoll ---

async def test_zwilling_eines_geposteten_beitrags_wird_nie_gesendet(
        tmp_db, monkeypatch, meldungen):
    """Doppelter 'approved'-Entwurf (Absturz vor mark_seen, zweites /batch, paralleler Ingest)."""
    fake = _Fake(PostResult(ok=True, external_id="ext-1"))
    monkeypatch.setattr(registry, "get", lambda name: fake)
    erster = await _entwurf("tumblr", "7")
    zwilling = await _entwurf("tumblr", "7")  # gleiche Quelle, gleicher Kanal

    await poster.run_post_pass()
    await poster.run_post_pass()

    assert fake.calls == 1  # nur einmal gesendet
    assert (await models.get_draft(erster))["state"] == "posted"
    d = await models.get_draft(zwilling)
    assert d["state"] == "posted"      # ist ja draußen
    assert d["external_id"] is None
    assert d["posted_at"] is None      # zählt nicht ein zweites Mal in der Tagesmeldung


async def test_schranke_gilt_auch_fuer_bluesky_und_mastodon(tmp_db, monkeypatch, meldungen):
    fake = _Fake(PostResult(ok=True, external_id="ext-1"))
    monkeypatch.setattr(registry, "get", lambda name: fake)
    monkeypatch.setattr(config, "CHANNELS_ENABLED", ["mastodon"])
    await models.mark_posted(await _entwurf("mastodon", "9"), "frueher", "mastodon", "article", "9")
    zwilling = await _entwurf("mastodon", "9")

    await poster.run_post_pass()
    assert fake.calls == 0
    assert (await models.get_draft(zwilling))["state"] == "posted"


async def test_schranke_verbraucht_den_tumblr_platz_nicht(tmp_db, monkeypatch, meldungen):
    """Der Zwilling darf nicht den einen Tumblr-Post dieses Durchlaufs aufbrauchen."""
    fake = _Fake(PostResult(ok=True, external_id="ext-1"))
    monkeypatch.setattr(registry, "get", lambda name: fake)
    await models.mark_posted(await _entwurf("tumblr", "5"), "frueher", "tumblr", "article", "5")
    zwilling = await _entwurf("tumblr", "5")
    frisch = await _entwurf("tumblr", "6")

    await poster.run_post_pass()
    assert fake.calls == 1
    assert (await models.get_draft(zwilling))["state"] == "posted"
    assert (await models.get_draft(frisch))["state"] == "posted"


async def test_schranke_laesst_anderen_kanal_desselben_artikels_in_ruhe(
        tmp_db, monkeypatch, meldungen):
    fake = _Fake(PostResult(ok=True, external_id="ext-1"))
    monkeypatch.setattr(registry, "get", lambda name: fake)
    await models.mark_posted(await _entwurf("tumblr", "3"), "x", "tumblr", "article", "3")
    mastodon = await _entwurf("mastodon", "3")

    await poster.run_post_pass()
    assert fake.calls == 1
    assert (await models.get_draft(mastodon))["state"] == "posted"
