"""Tumblr ohne Einzelfreigabe: Auto-Freigabe, Tageslimit, eigener Verfall (SQLite, ohne Postgres)."""
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from app import batch, breaker, compose, config, db, models, poster, util
from app.channels import registry
from app.channels.base import PostResult
from app.sources import articles
from app.sources.articles import SourceItem


def _item(ref, **kw):
    basis = dict(
        kind="article", ref=ref, url=f"https://otakupulse.de/news/{ref}", title="Titel",
        excerpt="Kurz", image_url=None, perishable=True,
        genres=["Sports"], anime_tags=[("School", "setting", 80)],
        series_title="Ao no Hako", category="news", is_hentai=False, anime_count=1,
    )
    basis.update(kw)
    return SourceItem(**basis)


async def _entwurf(channel="tumblr", ref="1", perishable=True, freigeben=True):
    did = await models.enqueue(
        batch_day="2026-11-02", channel=channel, source_kind="article", source_ref=ref,
        url=f"https://otakupulse.de/news/{ref}", image_url=None, title="T", body="B",
        perishable=perishable,
    )
    if freigeben:
        await models.approve(did)
    return did


class _Fake:
    def __init__(self):
        self.posts = []

    async def post(self, post):
        self.posts.append(post)
        return PostResult(ok=True, external_id=f"ext-{len(self.posts)}")


@pytest.fixture
def live(monkeypatch):
    """Alle Kanäle live, Adapter sind Fakes je Kanal; Telegram-Meldungen landen in live["meldungen"]."""
    adapter = {"bluesky": _Fake(), "mastodon": _Fake(), "tumblr": _Fake()}

    meldungen = []

    async def merken(text):
        meldungen.append(text)

    monkeypatch.setattr(config, "DRY_RUN", False)
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset())
    monkeypatch.setattr(config, "CHANNELS_ENABLED", ["bluesky", "mastodon", "tumblr"])
    monkeypatch.setattr(registry, "get", lambda name: adapter.get(name))
    monkeypatch.setattr(poster, "_notify", merken)
    adapter["meldungen"] = meldungen
    return adapter


# ---------- Auto-Freigabe im Ingest ----------

async def test_tumblr_entwurf_wird_direkt_freigegeben(tmp_db, monkeypatch):
    async def fetch_new(limit):
        return [_item("1")]

    async def rarity():
        return {"Sports": 5}

    async def compose_for(item, channels):
        return {c: f"Text {c}" for c in channels}

    monkeypatch.setattr(articles, "fetch_new", fetch_new)
    monkeypatch.setattr(articles, "genre_rarity", rarity)
    monkeypatch.setattr(compose, "compose_for", compose_for)
    monkeypatch.setattr(registry, "active_channel_names",
                        lambda: ["bluesky", "mastodon", "tumblr"])

    assert await batch.ingest(6) == 3
    cur = await db.conn().execute("SELECT channel, state FROM drafts ORDER BY id")
    zustand = {r["channel"]: r["state"] for r in await cur.fetchall()}
    assert zustand == {"bluesky": "pending", "mastodon": "pending", "tumblr": "approved"}


# ---------- Verfall ----------

async def _perishable_at_setzen(did, stunden):
    zeit = (datetime.now(timezone.utc) + timedelta(hours=stunden)).isoformat()
    await db.conn().execute("UPDATE drafts SET perishable_at=? WHERE id=?", (zeit, did))
    await db.conn().commit()


async def test_expire_erfasst_auch_approved(tmp_db):
    alt = await _entwurf("tumblr", "1")
    frisch = await _entwurf("tumblr", "2")
    await _perishable_at_setzen(alt, -1)
    await _perishable_at_setzen(frisch, 40)

    assert await models.expire_due() == 1
    assert (await models.get_draft(alt))["state"] == "expired"
    assert (await models.get_draft(frisch))["state"] == "approved"


async def test_expire_erfasst_weiter_pending(tmp_db):
    did = await _entwurf("bluesky", "1", freigeben=False)
    await _perishable_at_setzen(did, -1)
    assert await models.expire_due() == 1
    assert (await models.get_draft(did))["state"] == "expired"


async def test_expire_laesst_gepostete_und_nicht_verderbliche_in_ruhe(tmp_db):
    gepostet = await _entwurf("tumblr", "1")
    await models.mark_posted(gepostet, "x", "tumblr", "article", "1")
    evergreen = await _entwurf("tumblr", "2", perishable=False)
    await _perishable_at_setzen(gepostet, -1)
    assert await models.expire_due() == 0
    assert (await models.get_draft(gepostet))["state"] == "posted"
    assert (await models.get_draft(evergreen))["state"] == "approved"


# ---------- posted_today ----------

async def _log(channel, ref, posted_at):
    await db.conn().execute(
        "INSERT INTO posted_log(channel, source_kind, source_ref, posted_at, draft_id) "
        "VALUES (?,?,?,?,NULL)", (channel, "article", ref, posted_at))
    await db.conn().commit()


def _jetzt(monkeypatch, lokal: datetime):
    monkeypatch.setattr(util, "now_local", lambda: lokal)


async def test_posted_today_zaehlt_nur_heute_und_kanal(tmp_db, monkeypatch):
    _jetzt(monkeypatch, datetime(2026, 11, 2, 18, 0, tzinfo=ZoneInfo("Europe/Berlin")))
    await _log("tumblr", "a", "2026-11-02T09:00:00+00:00")
    await _log("tumblr", "b", "2026-11-02T16:30:00.123456+00:00")
    await _log("tumblr", "c", "2026-11-01T12:00:00+00:00")   # gestern
    await _log("bluesky", "a", "2026-11-02T09:00:00+00:00")  # anderer Kanal
    assert await models.posted_today("tumblr") == 2
    assert await models.posted_today("bluesky") == 1
    assert await models.posted_today("mastodon") == 0


async def test_posted_today_nutzt_lokalen_tag_nicht_utc(tmp_db, monkeypatch):
    # Berlin im November = UTC+1: lokaler Tag 2.11. reicht von 1.11. 23:00 UTC bis 2.11. 22:59 UTC.
    _jetzt(monkeypatch, datetime(2026, 11, 2, 12, 0, tzinfo=ZoneInfo("Europe/Berlin")))
    await _log("tumblr", "frueh", "2026-11-01T23:30:00+00:00")    # 00:30 lokal -> heute
    await _log("tumblr", "gestern", "2026-11-01T22:30:00+00:00")  # 23:30 lokal -> gestern
    await _log("tumblr", "spaet", "2026-11-02T22:30:00+00:00")    # 23:30 lokal -> heute
    await _log("tumblr", "morgen", "2026-11-02T23:30:00+00:00")   # 00:30 lokal -> morgen
    assert await models.posted_today("tumblr") == 2


async def test_posted_today_tagesgrenze_ueber_sommerzeitende(tmp_db, monkeypatch):
    # 26.10.2025 endet die Sommerzeit (Tag hat 25 h): Beginn 25.10. 22:00 UTC, Ende 26.10. 23:00 UTC.
    _jetzt(monkeypatch, datetime(2025, 10, 26, 12, 0, tzinfo=ZoneInfo("Europe/Berlin")))
    await _log("tumblr", "a", "2025-10-25T22:00:00+00:00")  # 00:00 CEST -> heute
    await _log("tumblr", "b", "2025-10-26T22:59:00+00:00")  # 23:59 CET -> heute
    await _log("tumblr", "c", "2025-10-26T23:00:00+00:00")  # 00:00 CET naechster Tag
    await _log("tumblr", "d", "2025-10-25T21:59:00+00:00")  # 23:59 CEST gestern
    assert await models.posted_today("tumblr") == 2


# ---------- Poster: Ein-Post-Regel und Tageslimit ----------

async def test_post_pass_schickt_hoechstens_einen_tumblr_post(tmp_db, live):
    a = await _entwurf("tumblr", "1")
    b = await _entwurf("tumblr", "2")
    await poster.run_post_pass()
    assert len(live["tumblr"].posts) == 1
    assert (await models.get_draft(a))["state"] == "posted"
    assert (await models.get_draft(b))["state"] == "approved"  # bleibt fuer den naechsten Lauf
    await poster.run_post_pass()
    assert len(live["tumblr"].posts) == 2
    assert (await models.get_draft(b))["state"] == "posted"


async def test_ein_post_regel_gilt_nicht_fuer_bluesky_und_mastodon(tmp_db, live):
    ids = [await _entwurf("bluesky", "1"), await _entwurf("bluesky", "2"),
           await _entwurf("mastodon", "3"), await _entwurf("mastodon", "4")]
    await poster.run_post_pass()
    assert len(live["bluesky"].posts) == 2  # beide in einem Durchlauf
    assert len(live["mastodon"].posts) == 2
    for did in ids:
        assert (await models.get_draft(did))["state"] == "posted"


async def test_tumblr_regel_bremst_andere_kanaele_nicht(tmp_db, live):
    await _entwurf("tumblr", "1")
    t2 = await _entwurf("tumblr", "2")
    await _entwurf("bluesky", "3")
    await _entwurf("bluesky", "4")
    await poster.run_post_pass()
    assert len(live["tumblr"].posts) == 1
    assert len(live["bluesky"].posts) == 2
    assert (await models.get_draft(t2))["state"] == "approved"


async def test_post_pass_haelt_tageslimit_ein(tmp_db, live, monkeypatch):
    monkeypatch.setattr(config, "TUMBLR_MAX_POSTS_PER_DAY", 2)
    ids = [await _entwurf("tumblr", str(i)) for i in range(3)]
    for _ in range(4):
        await poster.run_post_pass()
    assert len(live["tumblr"].posts) == 2
    zustaende = [(await models.get_draft(i))["state"] for i in ids]
    assert zustaende == ["posted", "posted", "expired"]  # verfallen, nicht aufgeschoben
    assert await models.posted_today("tumblr") == 2


async def test_limit_erreicht_laesst_andere_kanaele_unberuehrt(tmp_db, live, monkeypatch):
    monkeypatch.setattr(config, "TUMBLR_MAX_POSTS_PER_DAY", 0)
    t = await _entwurf("tumblr", "1")
    b = await _entwurf("bluesky", "2")
    await poster.run_post_pass()
    assert (await models.get_draft(t))["state"] == "expired"
    assert live["tumblr"].posts == []
    assert (await models.get_draft(b))["state"] == "posted"


async def test_limit_zaehlt_nur_heute(tmp_db, live, monkeypatch):
    monkeypatch.setattr(config, "TUMBLR_MAX_POSTS_PER_DAY", 1)
    await _log("tumblr", "alt", (datetime.now(timezone.utc) - timedelta(days=2)).isoformat())
    did = await _entwurf("tumblr", "1")
    await poster.run_post_pass()
    assert (await models.get_draft(did))["state"] == "posted"


# ---------- Konfiguration: robustes Lesen ----------

def test_tageslimit_default_ist_sechs():
    assert config._int("TUMBLR_TEST_NICHT_GESETZT", 6) == 6


def test_int_liest_wert_aus_der_umgebung(monkeypatch):
    monkeypatch.setenv("TUMBLR_TEST_INT", " 3 ")
    assert config._int("TUMBLR_TEST_INT", 6) == 3


@pytest.mark.parametrize("roh", ["", "   ", "abc", "3.5"])
def test_int_leer_oder_unlesbar_faellt_auf_default(monkeypatch, roh):
    monkeypatch.setenv("TUMBLR_TEST_INT", roh)
    assert config._int("TUMBLR_TEST_INT", 6) == 6


@pytest.mark.parametrize("roh", ["0", "-2"])
def test_int_unter_minimum_faellt_auf_default_mit_warnung(monkeypatch, caplog, roh):
    monkeypatch.setenv("TUMBLR_TEST_INT", roh)
    with caplog.at_level(logging.WARNING):
        assert config._int("TUMBLR_TEST_INT", 6, minimum=1) == 6
    assert any("TUMBLR_TEST_INT" in r.getMessage() for r in caplog.records)


def test_int_ohne_minimum_laesst_kleine_werte_zu(monkeypatch):
    monkeypatch.setenv("TUMBLR_TEST_INT", "0")
    assert config._int("TUMBLR_TEST_INT", 6) == 0


# ---------- Verfall nur fuer Tumblr bei freigegebenen Entwuerfen ----------

async def test_approved_bluesky_und_mastodon_verfallen_nicht(tmp_db):
    """Bestehendes Verhalten: von Hand freigegebene Entwuerfe warten (Pause, Breaker) und gehen raus."""
    bsky = await _entwurf("bluesky", "1")
    mast = await _entwurf("mastodon", "2")
    tumblr = await _entwurf("tumblr", "3")
    for did in (bsky, mast, tumblr):
        await _perishable_at_setzen(did, -1)

    assert await models.expire_due() == 1
    assert (await models.get_draft(bsky))["state"] == "approved"
    assert (await models.get_draft(mast))["state"] == "approved"
    assert (await models.get_draft(tumblr))["state"] == "expired"


# ---------- Limit: Meldung, Trockenlauf, Breaker ----------

async def test_limit_meldet_einmal_je_durchlauf_nicht_je_entwurf(tmp_db, live, monkeypatch):
    monkeypatch.setattr(config, "TUMBLR_MAX_POSTS_PER_DAY", 0)
    ids = [await _entwurf("tumblr", str(i)) for i in range(3)]
    await poster.run_post_pass()
    for did in ids:
        assert (await models.get_draft(did))["state"] == "expired"
    assert len(live["meldungen"]) == 1
    assert "3" in live["meldungen"][0] and "Tumblr" in live["meldungen"][0]
    await poster.run_post_pass()  # nichts mehr zu verwerfen: keine weitere Meldung
    assert len(live["meldungen"]) == 1


async def test_ohne_limit_treffer_keine_limit_meldung(tmp_db, live):
    await _entwurf("tumblr", "1")
    await poster.run_post_pass()
    assert not any("Tageslimit" in m for m in live["meldungen"])


async def test_trockenlaeufe_zaehlen_im_tageslimit_mit(tmp_db, live, monkeypatch):
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset({"tumblr"}))
    monkeypatch.setattr(config, "TUMBLR_MAX_POSTS_PER_DAY", 1)
    erster = await _entwurf("tumblr", "1")
    zweiter = await _entwurf("tumblr", "2")
    await poster.run_post_pass()
    assert (await models.get_draft(erster))["external_id"] == f"dry-{erster}"
    await poster.run_post_pass()
    assert (await models.get_draft(zweiter))["state"] == "expired"
    assert live["tumblr"].posts == []  # nie echt gepostet


async def test_offener_tumblr_breaker_fuehrt_nicht_zum_verwerfen(tmp_db, live, monkeypatch):
    monkeypatch.setattr(config, "TUMBLR_MAX_POSTS_PER_DAY", 0)  # Limit waere sofort erreicht
    did = await _entwurf("tumblr", "1")
    await db.conn().execute("INSERT INTO channel_state(channel) VALUES('tumblr')")
    await db.conn().execute(
        "UPDATE channel_state SET open_until=? WHERE channel='tumblr'",
        ((datetime.now(timezone.utc) + timedelta(hours=6)).isoformat(),))
    await db.conn().commit()
    assert await breaker.guard("tumblr") is False

    await poster.run_post_pass()
    assert (await models.get_draft(did))["state"] == "approved"  # wartet, wird nicht verworfen
    assert live["meldungen"] == []
