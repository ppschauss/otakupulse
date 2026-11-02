"""Tumblr ohne Einzelfreigabe: Auto-Freigabe, Tageslimit, eigener Verfall (SQLite, ohne Postgres)."""
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from app import batch, breaker, compose, config, db, models, poster, settings, util
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


# ---------- Tagesmeldung statt Einzelmeldung ----------

async def test_einzelmeldung_entfaellt_fuer_tumblr(tmp_db, live):
    await _entwurf("tumblr", "1")
    await poster.run_post_pass()
    assert len(live["tumblr"].posts) == 1
    assert live["meldungen"] == []  # die Tagesmeldung deckt es ab


async def test_einzelmeldung_bleibt_fuer_bluesky_und_mastodon(tmp_db, live):
    await _entwurf("bluesky", "1")
    await _entwurf("mastodon", "2")
    await poster.run_post_pass()
    assert len(live["meldungen"]) == 2
    assert any("Bluesky" in m and "/news/1" in m for m in live["meldungen"])
    assert any("Mastodon" in m and "/news/2" in m for m in live["meldungen"])


async def test_einzelmeldung_entfaellt_auch_im_trockenlauf_fuer_tumblr(tmp_db, live, monkeypatch):
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset({"tumblr", "bluesky"}))
    await _entwurf("tumblr", "1")
    await _entwurf("bluesky", "2")
    await poster.run_post_pass()
    assert len(live["meldungen"]) == 1 and "Bluesky" in live["meldungen"][0]


async def _gepostet(ref, titel="Titel", url=None, ext="111", channel="tumblr", zeit=None):
    did = await models.enqueue(
        batch_day="2026-11-02", channel=channel, source_kind="article", source_ref=ref,
        url=url or f"https://otakupulse.de/news/{ref}", image_url=None, title=titel,
        body="B", perishable=True)
    await models.approve(did)
    await models.mark_posted(did, ext, channel, "article", ref)
    if zeit:
        await db.conn().execute("UPDATE drafts SET posted_at=? WHERE id=?", (zeit, did))
        await db.conn().execute("UPDATE posted_log SET posted_at=? WHERE draft_id=?", (zeit, did))
        await db.conn().commit()
    return did


async def test_tagesmeldung_zaehlt_posts_und_nennt_links(tmp_db):
    await _gepostet("a", titel="Erste Meldung")
    await _gepostet("b", titel="Zweite Meldung")
    text = await batch.tumblr_summary()
    assert "2 Posts" in text
    assert "Erste Meldung" in text and "Zweite Meldung" in text
    assert "https://otakupulse.de/news/a" in text
    assert "https://otakupulse.de/news/b" in text


async def test_tagesmeldung_bei_null_posts(tmp_db):
    text = await batch.tumblr_summary()
    assert text.strip()  # kein leerer String
    assert "Tumblr" in text and "kein" in text.lower()
    assert "0 Posts" not in text


async def test_tagesmeldung_ein_post_steht_im_singular(tmp_db):
    await _gepostet("a")
    text = await batch.tumblr_summary()
    assert "1 Post " in text
    assert "1 Posts" not in text


async def test_tagesmeldung_nennt_verworfene_und_unbekannte(tmp_db, live, monkeypatch):
    # Verwurf wegen Tageslimit: ueber den echten Poster-Weg, damit die Markierung stimmt.
    monkeypatch.setattr(config, "TUMBLR_MAX_POSTS_PER_DAY", 0)
    await _entwurf("tumblr", "v1")
    await _entwurf("tumblr", "v2")
    await poster.run_post_pass()
    monkeypatch.setattr(config, "TUMBLR_MAX_POSTS_PER_DAY", 6)

    # Ausgang unbekannt: ebenfalls ueber den Poster-Weg.
    class _Unklar:
        async def post(self, post):
            return PostResult(ok=False, error="ReadTimeout: ", outcome_unknown=True)

    live["tumblr"] = _Unklar()
    await _entwurf("tumblr", "unklar-1")
    await poster.run_post_pass()

    text = await batch.tumblr_summary()
    assert "Wegen des Tageslimits verworfen: 2" in text
    assert "Ausgang unbekannt: 1" in text
    assert "https://otakupulse.de/news/unklar-1" in text


async def test_tagesmeldung_zaehlt_nur_echte_tageslimit_verwuerfe(tmp_db):
    # Verderbliche, ueberfaellige Entwuerfe und sonstige Fehlschlaege sind keine Limit-Verwuerfe
    # bzw. keine unklaren Ausgaenge und stehen daher nicht in der Meldung.
    alt = await _entwurf("tumblr", "alt")
    await _perishable_at_setzen(alt, -1)
    await models.expire_due()
    kaputt = await _entwurf("tumblr", "kaputt")
    await models.record_attempt_failure(kaputt, "HTTP 403: nope", give_up=True)
    text = await batch.tumblr_summary()
    assert "Tageslimit" not in text
    assert "Ausgang unbekannt" not in text
    assert "kein" in text.lower()


async def test_tagesmeldung_ignoriert_andere_kanaele(tmp_db):
    await _gepostet("b1", channel="bluesky")
    await _gepostet("m1", channel="mastodon")
    text = await batch.tumblr_summary()
    assert "news/b1" not in text and "news/m1" not in text
    assert "kein" in text.lower()


async def test_tagesmeldung_wiederholt_nichts_aus_dem_letzten_zeitraum(tmp_db, monkeypatch):
    _jetzt(monkeypatch, datetime(2026, 11, 2, 18, 0, tzinfo=ZoneInfo("Europe/Berlin")))
    await _gepostet("alt", zeit="2026-11-02T10:00:00+00:00")
    await settings.set("tumblr_summary_bis", "2026-11-02T12:00:00+00:00")
    await _gepostet("neu", zeit="2026-11-02T15:00:00+00:00")
    text = await batch.tumblr_summary()
    assert "news/neu" in text and "news/alt" not in text


async def test_tagesmeldung_ohne_vorherige_meldung_beginnt_am_lokalen_tag(tmp_db, monkeypatch):
    # Gleiche Tagesgrenzen wie posted_today: Berlin im November = UTC+1.
    _jetzt(monkeypatch, datetime(2026, 11, 2, 12, 0, tzinfo=ZoneInfo("Europe/Berlin")))
    await _gepostet("gestern", zeit="2026-11-01T22:30:00+00:00")  # 23:30 lokal gestern
    await _gepostet("heute", zeit="2026-11-01T23:30:00+00:00")    # 00:30 lokal heute
    text = await batch.tumblr_summary()
    assert "news/heute" in text and "news/gestern" not in text


class _Bot:
    """Falscher Telegram-Bot: merkt sich Texte, kann auf Wunsch scheitern."""

    def __init__(self):
        self.gesendet = []
        self.kaputt = False  # True: die Tagesmeldung (Tumblr) scheitert, der Batch-Kopf nicht

    async def send_message(self, **kw):
        if self.kaputt and "Tumblr" in kw["text"]:
            raise RuntimeError("Telegram weg")
        self.gesendet.append(kw["text"])


@pytest.fixture
def telegram(monkeypatch):
    from app import runtime

    bot = _Bot()

    async def chat():
        return 42

    async def nichts_ingesten(limit):
        return 0

    monkeypatch.setattr(runtime, "bot", bot)
    monkeypatch.setattr(settings, "approval_chat_id", chat)
    monkeypatch.setattr(batch, "ingest", nichts_ingesten)
    monkeypatch.setattr(config, "CHANNELS_ENABLED", ["bluesky", "mastodon", "tumblr"])
    return bot


async def test_run_daily_haengt_tagesmeldung_an_den_batch(tmp_db, telegram):
    await _gepostet("a", titel="Erste Meldung")
    await batch.run_daily()
    assert len(telegram.gesendet) == 2  # Batch-Kopf (keine Entwuerfe) + Tagesmeldung
    assert "Keine neuen Entwürfe" in telegram.gesendet[0]
    assert "Erste Meldung" in telegram.gesendet[1]


async def test_run_daily_meldet_ausdruecklich_bei_null_posts(tmp_db, telegram):
    await batch.run_daily()
    assert len(telegram.gesendet) == 2
    assert "Tumblr" in telegram.gesendet[1] and "kein" in telegram.gesendet[1].lower()


async def test_run_daily_zweimal_meldet_posts_nur_einmal(tmp_db, telegram):
    await _gepostet("a", titel="Erste Meldung")
    await batch.run_daily()
    await batch.run_daily()
    assert sum("Erste Meldung" in t for t in telegram.gesendet) == 1


async def test_run_daily_ohne_tumblr_kanal_keine_tagesmeldung(tmp_db, telegram, monkeypatch):
    monkeypatch.setattr(config, "CHANNELS_ENABLED", ["bluesky", "mastodon"])
    await batch.run_daily()
    assert len(telegram.gesendet) == 1 and not any("Tumblr" in t for t in telegram.gesendet)


async def test_fehlgeschlagener_versand_schiebt_den_zeitraum_nicht_weiter(tmp_db, telegram):
    await _gepostet("a", titel="Erste Meldung")
    telegram.kaputt = True
    await batch.run_daily()  # darf nicht werfen
    assert await settings.get("tumblr_summary_bis") == ""  # Zeitraum nicht vorgerückt
    telegram.kaputt = False
    await batch.run_daily()
    assert sum("Erste Meldung" in t for t in telegram.gesendet) == 1


# ---------- Fix-Durchlauf: Kürzung, Zeitfenster, Absicherungen ----------

async def test_kuerzung_trifft_die_postliste_nie_ausgang_unbekannt(tmp_db):
    for i in range(100):
        await _gepostet(f"p{i}", titel="T" * 100)
    unklar = await _entwurf("tumblr", "unklar-ende")
    await models.record_attempt_failure(unklar, "Ausgang unbekannt: ReadTimeout", give_up=True)
    text = await batch.tumblr_summary()
    assert len(text) <= 4000
    assert "https://otakupulse.de/news/unklar-ende" in text  # vollständig, nie gekürzt
    assert "Ausgang unbekannt: 1" in text
    assert "100 Posts veröffentlicht" in text
    gezeigt = sum(1 for i in range(100) if f"news/p{i}\n" in text + "\n")
    assert 0 < gezeigt < 100
    assert f"und {100 - gezeigt} weitere" in text


async def test_ohne_kuerzung_kein_weitere_hinweis(tmp_db):
    await _gepostet("a")
    assert "weitere" not in await batch.tumblr_summary()


async def test_ausgang_unbekannt_ist_knapp_ohne_hinweistext(tmp_db):
    d = await _entwurf("tumblr", "u1")
    await models.record_attempt_failure(d, "Ausgang unbekannt: x", give_up=True)
    text = await batch.tumblr_summary()
    assert "Ausgang unbekannt: 1" in text and "news/u1" in text
    assert "nachsehen" not in text  # stand schon in der Sofortmeldung


async def test_give_up_false_laesst_decided_at_unveraendert(tmp_db):
    did = await _entwurf("bluesky", "1")
    await db.conn().execute("UPDATE drafts SET decided_at='2020-01-01T00:00:00+00:00' WHERE id=?", (did,))
    await db.conn().commit()
    await models.record_attempt_failure(did, "Timeout", give_up=False)
    d = await models.get_draft(did)
    assert d["state"] == "approved" and d["attempts"] == 1
    assert d["decided_at"] == "2020-01-01T00:00:00+00:00"
    await models.record_attempt_failure(did, "Timeout", give_up=True)
    d = await models.get_draft(did)
    assert d["state"] == "failed" and d["decided_at"] != "2020-01-01T00:00:00+00:00"


async def test_post_genau_auf_der_grenze_erscheint_in_genau_einer_meldung(tmp_db, telegram, monkeypatch):
    # 18:00 Berlin = 17:00 UTC; der Post liegt exakt auf dem Ende des ersten Zeitraums.
    await _gepostet("grenze", titel="Grenzfall", zeit="2026-11-02T17:00:00+00:00")
    for stunde in (18, 19, 20):
        _jetzt(monkeypatch, datetime(2026, 11, 2, stunde, 0, tzinfo=ZoneInfo("Europe/Berlin")))
        await batch.send_tumblr_summary()
    assert sum("Grenzfall" in t for t in telegram.gesendet) == 1
    assert "Grenzfall" in telegram.gesendet[1]  # gehört in den Folgezeitraum


async def test_ohne_freigabe_chat_rueckt_der_zeitraum_nicht_vor(tmp_db, telegram, monkeypatch):
    async def kein_chat():
        return None

    monkeypatch.setattr(settings, "approval_chat_id", kein_chat)
    await batch.send_tumblr_summary()
    assert telegram.gesendet == []
    assert await settings.get("tumblr_summary_bis") == ""


async def test_ohne_bot_rueckt_der_zeitraum_nicht_vor(tmp_db, telegram, monkeypatch):
    from app import runtime

    monkeypatch.setattr(runtime, "bot", None)
    await batch.send_tumblr_summary()
    assert await settings.get("tumblr_summary_bis") == ""


async def test_fenster_laeuft_nie_rueckwaerts(tmp_db, telegram, monkeypatch):
    # Uhr zurückgestellt: der gespeicherte Zeitpunkt liegt nach "jetzt".
    _jetzt(monkeypatch, datetime(2026, 11, 2, 18, 0, tzinfo=ZoneInfo("Europe/Berlin")))
    spaeter = "2026-11-02T20:00:00+00:00"
    await settings.set("tumblr_summary_bis", spaeter)
    await batch.send_tumblr_summary()
    assert len(telegram.gesendet) == 1
    assert await settings.get("tumblr_summary_bis") == spaeter  # nicht zurückgesetzt


async def test_auch_ausgang_unbekannt_ist_begrenzt_und_das_senden_gelingt(tmp_db, telegram, caplog):
    for i in range(80):
        d = await _entwurf("tumblr", f"u{i}")
        await models.record_attempt_failure(d, "Ausgang unbekannt: ReadTimeout", give_up=True)
    for i in range(80):
        await _gepostet(f"p{i}", titel="T" * 100)
    await db.conn().execute("UPDATE drafts SET title=? WHERE state='failed'", ("U" * 100,))
    await db.conn().commit()
    # Auch das Tageslimit-Feld ist belegt: alle drei Abschnitte voll.
    for i in range(3):
        d = await _entwurf("tumblr", f"l{i}")
        await models.expire_draft(d)

    with caplog.at_level(logging.WARNING):
        await batch.send_tumblr_summary()

    assert len(telegram.gesendet) == 1  # Senden gelang
    text = telegram.gesendet[0]
    assert len(text) <= 4096
    assert "Ausgang unbekannt: 80" in text
    gezeigt = sum(1 for i in range(80) if f"news/u{i}\n" in text + "\n")
    assert 0 < gezeigt < 80
    assert f"… und {80 - gezeigt} weitere" in text
    assert "Wegen des Tageslimits verworfen: 3" in text
    assert "80 Posts veröffentlicht" in text
    # Die gekürzten Einträge stehen vollständig im Log.
    meldung = " ".join(r.getMessage() for r in caplog.records)
    for i in range(gezeigt, 80):
        assert f"news/u{i}" in meldung
    assert await settings.get("tumblr_summary_bis") != ""  # Zeitraum rückt vor
