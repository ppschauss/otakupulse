"""Kanalweiser Trockenmodus: DRY_RUN_CHANNELS haelt einzelne Kanaele zurueck (ohne Postgres)."""
import pytest

from app import config, main, models, poster, runtime, settings, texts_de as T
from app.channels import registry
from app.channels.base import PostResult


@pytest.fixture(autouse=True)
def frische_skip_drossel():
    """Die Drossel der Liegenbleib-Warnung ist Modulzustand — je Test frisch."""
    poster._skip_gemeldet.clear()
    yield
    poster._skip_gemeldet.clear()


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
        # Ein echter Tumblr-Entwurf trägt immer Tags; der Poster prüft das streng.
        tags=["anime", "otakupulse"] if channel == "tumblr" else None,
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
    monkeypatch.setattr(config, "CHANNELS_ENABLED", ["bluesky", "tumblr"])
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


# ---------- I1: Poster respektiert CHANNELS_ENABLED ----------

async def test_post_pass_laesst_entwurf_eines_nicht_aktivierten_kanals_liegen(
        tmp_db, monkeypatch, caplog):
    adapter = {"bluesky": _FakeChannel(), "tumblr": _FakeChannel()}

    async def keine_meldung(text):
        pass

    monkeypatch.setattr(config, "DRY_RUN", False)
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset())
    monkeypatch.setattr(config, "CHANNELS_ENABLED", ["tumblr"])  # Bluesky nicht aktiviert
    monkeypatch.setattr(registry, "get", lambda name: adapter.get(name))
    monkeypatch.setattr(poster, "_notify", keine_meldung)

    bsky1 = await _entwurf("bluesky", "1")
    bsky2 = await _entwurf("bluesky", "3")
    tmblr = await _entwurf("tumblr", "2")
    with caplog.at_level("WARNING"):
        await poster.run_post_pass()

    assert adapter["bluesky"].posts == []  # nicht echt gepostet
    assert len(adapter["tumblr"].posts) == 1
    for did in (bsky1, bsky2):
        d = await models.get_draft(did)
        assert d["state"] == "approved"  # liegen lassen, nicht trocken verbucht
        assert d["external_id"] is None
    assert (await models.get_draft(tmblr))["state"] == "posted"
    # eine Log-Meldung pro Lauf und Kanal, nicht je Entwurf
    meldungen = [r for r in caplog.records if "bluesky" in r.getMessage()
                 and r.levelname == "WARNING"]
    assert len(meldungen) == 1

    # Kanal wird spaeter aktiviert: die liegen gebliebenen Entwuerfe laufen dann durch
    monkeypatch.setattr(config, "CHANNELS_ENABLED", ["bluesky", "tumblr"])
    await poster.run_post_pass()
    assert len(adapter["bluesky"].posts) == 2


# ---------- I2: Validierung von DRY_RUN_CHANNELS ----------

def test_validate_meldet_unbekannten_kanalnamen(monkeypatch):
    monkeypatch.setattr(config, "DRY_RUN", False)
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset({"blusky", "mastodon"}))
    warnungen = config.validate_dry_config({"bluesky", "mastodon", "tumblr"})
    assert len(warnungen) == 1
    assert "blusky" in warnungen[0]


def test_validate_meldet_falschen_trenner(monkeypatch):
    monkeypatch.setenv("DRY_RUN_CHANNELS", "bluesky mastodon")
    monkeypatch.setattr(config, "DRY_RUN", False)
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", config._csv_set("DRY_RUN_CHANNELS"))
    warnungen = config.validate_dry_config({"bluesky", "mastodon", "tumblr"})
    assert any("bluesky mastodon" in w for w in warnungen)


def test_validate_warnt_wenn_alles_live_ist(monkeypatch):
    monkeypatch.setattr(config, "DRY_RUN", False)
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset())
    warnungen = config.validate_dry_config({"bluesky", "mastodon", "tumblr"})
    assert len(warnungen) == 1
    assert "LIVE" in warnungen[0]


def test_validate_schweigt_bei_gueltiger_konfiguration(monkeypatch):
    monkeypatch.setattr(config, "DRY_RUN", False)
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset({"bluesky", "mastodon"}))
    assert config.validate_dry_config({"bluesky", "mastodon", "tumblr"}) == []
    monkeypatch.setattr(config, "DRY_RUN", True)  # globaler Trockenmodus: Liste egal
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset())
    assert config.validate_dry_config({"bluesky"}) == []


# ---------- I3: leere Bool-Variable faellt auf den Default ----------

def test_bool_leerer_wert_faellt_auf_default(monkeypatch):
    for leer in ("", "   "):
        monkeypatch.setenv("DRY_RUN", leer)
        assert config._bool("DRY_RUN", True) is True
        assert config._bool("DRY_RUN", False) is False


def test_bool_explizite_werte_bleiben_wie_sie_waren(monkeypatch):
    for roh, erwartet in (("0", False), ("false", False), ("OFF", False), ("1", True), ("yes", True)):
        monkeypatch.setenv("DRY_RUN", roh)
        assert config._bool("DRY_RUN", True) is erwartet
    monkeypatch.delenv("DRY_RUN")
    assert config._bool("DRY_RUN", True) is True


# ---------- Kleinere Absicherungen ----------

def test_is_dry_unbekannter_kanal_und_abweichende_schreibweise(monkeypatch):
    monkeypatch.setattr(config, "DRY_RUN", False)
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset({"bluesky"}))
    assert config.is_dry("Bluesky") is True  # Schreibweise egal: auf der sicheren Seite
    assert config.is_dry(" bluesky ") is True
    assert config.is_dry("blusky") is False  # Tippfehler trocknet nichts (Start-Warnung faengt das ab)
    assert config.is_dry("irgendwas") is False


def test_all_dry_ist_false_ohne_aktivierte_kanaele(monkeypatch):
    _modus(monkeypatch, False, set(), enabled=())
    assert config.all_dry() is False
    assert config.mode_summary() == "keine Kanäle aktiv"


# ---------- CHANNELS_ENABLED wird wie DRY_RUN_CHANNELS behandelt ----------

def test_channels_enabled_wird_kleingeschrieben_und_getrimmt(monkeypatch):
    monkeypatch.setenv("CHANNELS_ENABLED", " Tumblr , BLUESKY ,, mastodon")
    assert config._csv_list("CHANNELS_ENABLED") == ["tumblr", "bluesky", "mastodon"]


def test_channels_enabled_leer_und_fehlend(monkeypatch):
    monkeypatch.setenv("CHANNELS_ENABLED", " , ,")
    assert config._csv_list("CHANNELS_ENABLED") == []
    monkeypatch.delenv("CHANNELS_ENABLED")
    assert config._csv_list("CHANNELS_ENABLED") == []


def test_csv_list_behaelt_die_reihenfolge_csv_set_nicht(monkeypatch):
    monkeypatch.setenv("DRY_RUN_CHANNELS", "tumblr,bluesky")
    assert config._csv_list("DRY_RUN_CHANNELS") == ["tumblr", "bluesky"]
    assert config._csv_set("DRY_RUN_CHANNELS") == frozenset({"tumblr", "bluesky"})


def test_validate_meldet_unbekannten_kanal_in_channels_enabled(monkeypatch):
    monkeypatch.setattr(config, "DRY_RUN", True)
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset())
    monkeypatch.setattr(config, "CHANNELS_ENABLED", ["tumblr", "tumbler"])
    warnungen = config.validate_dry_config({"bluesky", "mastodon", "tumblr"})
    assert len(warnungen) == 1
    assert "CHANNELS_ENABLED" in warnungen[0] and "tumbler" in warnungen[0]
    assert "NICHT aktiv" in warnungen[0]


def test_validate_schweigt_bei_gueltigem_channels_enabled(monkeypatch):
    monkeypatch.setattr(config, "DRY_RUN", True)
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset())
    monkeypatch.setattr(config, "CHANNELS_ENABLED", ["tumblr"])
    assert config.validate_dry_config({"bluesky", "mastodon", "tumblr"}) == []


# ---------- I4: Startwarnungen erreichen den Freigabe-Chat ----------

class _Bot:
    def __init__(self, kaputt=False):
        self.gesendet = []
        self.kaputt = kaputt

    async def send_message(self, **kw):
        if self.kaputt:
            raise RuntimeError("Telegram weg")
        self.gesendet.append(kw["text"])


@pytest.fixture
def chat(monkeypatch):
    async def chat_id():
        return 42

    monkeypatch.setattr(settings, "approval_chat_id", chat_id)


async def test_startwarnungen_gehen_in_den_freigabe_chat(monkeypatch, chat):
    bot = _Bot()
    monkeypatch.setattr(runtime, "bot", bot)
    await main.warnungen_melden(["ACHTUNG: alles live", "Tippfehler im Kanalnamen"])
    assert len(bot.gesendet) == 1
    assert "ACHTUNG: alles live" in bot.gesendet[0]
    assert "Tippfehler im Kanalnamen" in bot.gesendet[0]


async def test_ohne_warnungen_wird_nichts_gesendet(monkeypatch, chat):
    bot = _Bot()
    monkeypatch.setattr(runtime, "bot", bot)
    await main.warnungen_melden([])
    assert bot.gesendet == []


async def test_telegram_ausfall_verhindert_den_start_nicht(monkeypatch, chat, caplog):
    monkeypatch.setattr(runtime, "bot", _Bot(kaputt=True))
    with caplog.at_level("ERROR"):
        await main.warnungen_melden(["ACHTUNG: alles live"])  # darf nicht werfen
    assert any(r.levelname == "ERROR" for r in caplog.records)


async def test_ohne_freigabe_chat_und_ohne_bot_passiert_nichts(monkeypatch):
    async def kein_chat():
        return None

    monkeypatch.setattr(settings, "approval_chat_id", kein_chat)
    monkeypatch.setattr(runtime, "bot", _Bot())
    await main.warnungen_melden(["ACHTUNG"])
    monkeypatch.setattr(runtime, "bot", None)
    await main.warnungen_melden(["ACHTUNG"])


# ---------- Drossel: der deaktivierte Kanal loggt nicht endlos ----------

async def _nur_tumblr(monkeypatch):
    async def keine_meldung(text):
        pass

    monkeypatch.setattr(config, "DRY_RUN", True)
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset())
    monkeypatch.setattr(config, "CHANNELS_ENABLED", ["tumblr"])
    monkeypatch.setattr(poster, "_notify", keine_meldung)


def _bluesky_warnungen(caplog):
    return [r for r in caplog.records if r.levelname == "WARNING"
            and "bluesky" in r.getMessage() and "CHANNELS_ENABLED" in r.getMessage()]


async def test_liegenbleib_warnung_wird_gedrosselt(tmp_db, monkeypatch, caplog):
    await _nur_tumblr(monkeypatch)
    await _entwurf("bluesky", "1")
    with caplog.at_level("WARNING"):
        for _ in range(5):
            await poster.run_post_pass()
    assert len(_bluesky_warnungen(caplog)) == 1  # nicht fünfmal dieselbe Warnung


async def test_geaenderte_anzahl_meldet_wieder(tmp_db, monkeypatch, caplog):
    await _nur_tumblr(monkeypatch)
    await _entwurf("bluesky", "1")
    with caplog.at_level("WARNING"):
        await poster.run_post_pass()
        await _entwurf("bluesky", "2")  # jetzt bleiben zwei liegen
        await poster.run_post_pass()
        await poster.run_post_pass()
    meldungen = [r.getMessage() for r in _bluesky_warnungen(caplog)]
    assert len(meldungen) == 2  # einmal fuer 1, einmal fuer 2 — der dritte Lauf schweigt
    assert "1 freigegebene" in meldungen[0]
    assert "2 freigegebene" in meldungen[1]


async def test_nach_rueckkehr_des_kanals_meldet_der_naechste_ausfall_wieder(
        tmp_db, monkeypatch, caplog):
    await _nur_tumblr(monkeypatch)
    await _entwurf("bluesky", "1")
    with caplog.at_level("WARNING"):
        await poster.run_post_pass()
        monkeypatch.setattr(config, "CHANNELS_ENABLED", ["tumblr", "bluesky"])
        await poster.run_post_pass()      # Kanal zurück: Entwurf geht trocken raus
        await _entwurf("bluesky", "2")
        monkeypatch.setattr(config, "CHANNELS_ENABLED", ["tumblr"])
        await poster.run_post_pass()      # wieder weg: Warnung sofort wieder
    assert len(_bluesky_warnungen(caplog)) == 2
