"""Aufgabe 14: Crunchyroll als Direktquelle. Alles reine Funktionen bzw. erzeugte
SQL-Strings — es gibt lokal weder Datenbank noch Netz."""
from .conftest import load
cr = load("crunchyroll-dub")
cat = load("justwatch-catalog")

NOW = "2026-11-09T00:00:00Z"


def _series(sid="GABC123", audio=("ja-JP",), subs=("de-DE",), seasons=2, episodes=24):
    return {"data": [{"id": sid, "slug_title": "returners-magic",
                      "series_metadata": {"audio_locales": list(audio), "subtitle_locales": list(subs),
                                          "season_count": seasons, "episode_count": episodes}}]}


def test_verfuegbarkeit_aus_der_serien_antwort():
    offers = cr.availability_from_series(_series(), None)
    assert len(offers) == 1
    o = offers[0]
    assert o["provider"] == "crunchyroll"
    assert o["source"] == "crunchyroll"
    assert o["confidence"] == "confirmed"
    assert o["monetization"] == "flatrate"
    assert o["url"] == "https://www.crunchyroll.com/de/series/GABC123"
    assert o["audio"] == "ja"
    assert o["subs"] == "de"
    assert o["seasons"] == 2 and o["episodes"] == 24


def test_leere_antwort_erzeugt_kein_angebot():
    assert cr.availability_from_series({"data": []}, None) == []
    assert cr.availability_from_series({}, None) == []
    assert cr.availability_from_series(None, None) == []


def test_angebot_ohne_deep_link_wird_verworfen():
    """Lieber nicht gelistet als ein Link auf eine Startseite."""
    for sid in (None, "", "   "):
        assert cr.availability_from_series(_series(sid=sid), None) == []
    s = _series()
    del s["data"][0]["id"]
    assert cr.availability_from_series(s, None) == []


def test_id_wird_nicht_ungeprueft_in_die_url_gesetzt():
    assert cr.availability_from_series(_series(sid="G1/../x"), None) == []


def test_serie_ohne_jede_sprache_gilt_nicht_als_verfuegbar():
    assert cr.availability_from_series(_series(audio=(), subs=()), None) == []


def test_sprachen_werden_auf_die_kurzcodes_der_angebotszeilen_abgebildet():
    o = cr.availability_from_series(
        _series(audio=("ja-JP", "de-DE", "en-US", "fr-FR"), subs=("en-US", "de-DE", "es-419")), None)[0]
    assert o["audio"] == "de,en,ja"
    assert o["subs"] == "de,en"


def test_serien_antwort_der_serien_api_ohne_metadatenblock():
    """SERIES_API liefert die Locale-Felder auf der obersten Ebene des Eintrags."""
    s = {"data": [{"id": "GX1", "audio_locales": ["ja-JP"], "subtitle_locales": ["de-DE"]}]}
    o = cr.availability_from_series(s, None)[0]
    assert o["url"].endswith("/series/GX1") and o["seasons"] is None


def test_staffel_antwort_praezisiert_sprachen_und_episoden():
    season = {"data": [{"audio_locales": ["ja-JP", "de-DE"], "subtitle_locales": ["de-DE"],
                        "number_of_episodes": 12}]}
    o = cr.availability_from_series(_series(), season)[0]
    assert o["audio"] == "de,ja" and o["episodes"] == 12


# --- Umfang --------------------------------------------------------------------

def test_umfang_releasing_und_zwei_jahrgaenge():
    f = cr.in_availability_scope
    assert f("RELEASING", 2019, 2026)            # laufend, egal wie alt
    assert f("FINISHED", 2026, 2026)             # laufender Jahrgang
    assert f("FINISHED", 2025, 2026)             # vorheriger Jahrgang
    assert not f("FINISHED", 2024, 2026)         # Gesamtkatalog gehoert dem JustWatch-Abgleich
    assert not f("FINISHED", None, 2026)
    assert not f(None, None, 2026)


# --- Schreiben ueber build_catalog_sql --------------------------------------------

def _write(anime=None, offers=None):
    anime = anime if anime is not None else {"id": 7, "offers": {}}
    offers = offers if offers is not None else cr.availability_from_series(_series(), None)
    return cr.availability_sql(anime, offers, NOW)


def test_sql_schreibt_confirmed_und_crunchyroll():
    sql = " ".join(_write())
    assert "'confirmed', 'crunchyroll')" in sql
    assert "'unconfirmed'" not in sql
    assert "'https://www.crunchyroll.com/de/series/GABC123'" in sql
    assert "'ja'" in sql and "'de'" in sql


def test_sql_loescht_nur_crunchyroll_nicht_die_anderen_anbieter():
    """Die Falle: `build_catalog_sql` ist autoritativ ueber ALLE Abo-/Werbe-/Gratis-
    Zeilen des Titels. Mit nur dem Crunchyroll-Angebot gefuettert wuerde sie Netflix,
    Prime usw. loeschen."""
    stmts = _write({"id": 7, "offers": {("netflix", "flatrate"): None}})
    delete = stmts[0]
    assert delete.startswith("DELETE FROM anime_streaming_offers WHERE _parent_id = 7")
    assert "provider = 'crunchyroll'" in delete
    assert "source IS DISTINCT FROM 'manual'" in delete
    assert "confidence IS DISTINCT FROM 'rejected'" in delete
    sql = " ".join(stmts)
    assert "DELETE FROM anime_streaming_providers WHERE parent_id = 7;" not in sql
    assert "AND value = 'crunchyroll'" in sql


def test_sql_fasst_fremde_angebote_in_der_liste_nicht_an():
    fremd = {"provider": "netflix", "monetization": "flatrate", "url": "https://netflix.com/x",
             "audio": "", "subs": "", "seasons": None, "episodes": None, "available_to": None,
             "confidence": "confirmed"}
    sql = " ".join(cat.build_catalog_sql({"id": 7, "offers": {}}, [fremd], NOW, only_provider="crunchyroll"))
    assert "INSERT INTO anime_streaming_offers" not in sql


def test_manuelles_paar_wird_nicht_doppelt_eingefuegt():
    a = {"id": 7, "offers": {("crunchyroll", "flatrate"): None},
         "manual": {("crunchyroll", "flatrate")}}
    assert "INSERT INTO anime_streaming_offers" not in " ".join(_write(a))


def test_veto_paar_wird_uebersprungen():
    a = {"id": 7, "offers": {("crunchyroll", "flatrate"): None},
         "rejected": {("crunchyroll", "flatrate")}}
    assert "INSERT INTO anime_streaming_offers" not in " ".join(_write(a))


def test_first_seen_at_bleibt_erhalten_neu_bekommt_zeitstempel():
    bekannt = " ".join(_write({"id": 7, "offers": {("crunchyroll", "flatrate"): "2026-01-01T00:00:00Z"}}))
    assert "'2026-01-01T00:00:00Z'" in bekannt
    neu = " ".join(_write({"id": 7, "offers": {}}))
    assert f"'{NOW}', '{NOW}'" in neu


def test_ohne_gefundenes_angebot_wird_nicht_geloescht():
    """Kein Treffer (Fehler, schwacher Match, nicht im DE-Katalog) darf den Bestand
    nicht anfassen — Loeschen ist Sache des JustWatch-Abgleichs."""
    assert cr.availability_sql({"id": 7, "offers": {}}, [], NOW) == []


def test_sweep_ohne_only_provider_bleibt_unveraendert():
    stmts = cat.build_catalog_sql({"id": 7, "offers": {}}, [], NOW, discovery=False)
    assert "provider =" not in stmts[0]
    assert "DELETE FROM anime_streaming_providers WHERE parent_id = 7;" in stmts


# --- Dub-Lauf unveraendert -------------------------------------------------------

class _Resp:
    def __init__(self, code, js):
        self.status_code, self._js = code, js

    def json(self):
        return self._js


def test_resolve_liefert_weiterhin_die_dub_sprachen(monkeypatch):
    a = {"id": 1, "titles": ["X", "", ""], "series_id": "GABC", "cr_slugs": set()}
    monkeypatch.setattr(cr, "api_get", lambda *x, **k: _Resp(
        200, {"data": [{"audio_locales": ["ja-JP", "de-DE"], "subtitle_locales": ["en-US"]}]}))
    assert cr.resolve(None, "tok", a) == (["ja", "de-dub", "en-sub"], "id")


def _suche(monkeypatch):
    item = {"id": "GRET", "title": "Returners Magic Should Be Special", "slug_title": "x",
            "series_metadata": {"audio_locales": ["ja-JP"], "subtitle_locales": ["de-DE"]}}
    monkeypatch.setattr(cr, "api_get", lambda *x, **k: _Resp(200, {"data": [{"type": "series", "items": [item]}]}))
    return {"id": 1, "titles": ["Returners Magic Should Be Special", "", ""], "series_id": None,
            "cr_slugs": set()}


def test_resolve_suche_und_fehlerpfade(monkeypatch):
    a = _suche(monkeypatch)
    assert cr.resolve(None, "tok", a) == (["ja", "de-sub"], "search")
    monkeypatch.setattr(cr, "api_get", lambda *x, **k: _Resp(500, {}))
    assert cr.resolve(None, "tok", a) == (None, "err")
    monkeypatch.setattr(cr, "api_get", lambda *x, **k: _Resp(200, {"data": []}))
    assert cr.resolve(None, "tok", a) == ([], "no-match")


def test_resolve_series_liefert_die_serie_mit_id(monkeypatch):
    a = _suche(monkeypatch)
    series, method = cr.resolve_series(None, "tok", a)
    assert method == "search" and series["id"] == "GRET"
    assert cr.availability_from_series({"data": [series]}, None)[0]["url"].endswith("/series/GRET")


def test_resolve_series_per_id_traegt_die_id_auch_ohne_id_feld(monkeypatch):
    """SERIES_API-Eintraege koennen die ID weglassen; die aufgeloeste ID gehoert dann
    dem Aufrufer und muss ankommen."""
    a = {"id": 1, "titles": ["X", "", ""], "series_id": "GABC", "cr_slugs": set()}
    monkeypatch.setattr(cr, "api_get", lambda *x, **k: _Resp(
        200, {"data": [{"audio_locales": ["ja-JP"], "subtitle_locales": ["de-DE"]}]}))
    series, method = cr.resolve_series(None, "tok", a)
    assert method == "id" and series["id"] == "GABC"


def test_max_workers_unveraendert():
    assert cr.MAX_WORKERS == 8
