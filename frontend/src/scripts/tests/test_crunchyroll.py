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


# --- Fix-Runde 1: confirmed nur bei Beleg ------------------------------------------

def _such_a(slugs=()):
    return {"id": 1, "titles": ["Returners Magic Should Be Special 2nd Season", "", ""],
            "series_id": None, "cr_slugs": set(slugs)}


def _such_item(slug):
    return {"id": "GRET", "title": "Returners Magic Should Be Special", "slug_title": slug,
            "series_metadata": {"audio_locales": ["ja-JP"], "subtitle_locales": ["de-DE"]}}


def test_aehnlichkeitstreffer_ist_kein_beleg(monkeypatch):
    """Containment-Match: die 2nd Season landet auf der Serie der 1. Staffel."""
    monkeypatch.setattr(cr, "api_get", lambda *x, **k: _Resp(
        200, {"data": [{"type": "series", "items": [_such_item("returners-magic-should-be-special")]}]}))
    series, method = cr.resolve_series(None, "tok", _such_a())
    assert method == "search" and series is not None
    assert cr.is_direct_evidence(series, method) is False


def test_slug_exakttreffer_ist_beleg(monkeypatch):
    monkeypatch.setattr(cr, "api_get", lambda *x, **k: _Resp(
        200, {"data": [{"type": "series", "items": [_such_item("returners-magic-should-be-special")]}]}))
    series, method = cr.resolve_series(None, "tok", _such_a(["returnersmagicshouldbespecial"]))
    assert cr.is_direct_evidence(series, method) is True


def test_eigener_series_link_ist_beleg():
    assert cr.is_direct_evidence({"id": "GABC"}, "id") is True
    assert cr.is_direct_evidence(None, "id") is False
    assert cr.is_direct_evidence(None, "weak") is False


def test_resolve_dub_lauf_unveraendert_durch_exaktheitsmarke(monkeypatch):
    monkeypatch.setattr(cr, "api_get", lambda *x, **k: _Resp(
        200, {"data": [{"type": "series", "items": [_such_item("x")]}]}))
    assert cr.resolve(None, "tok", _such_a()) == (["ja", "de-sub"], "search")


# --- Verdrahtung von availability_main -----------------------------------------------

def _titel(i, status, year):
    return {"id": i, "slug": f"t{i}", "status": status, "year": year,
            "offers": {}, "manual": set(), "rejected": set()}


def _lauf(monkeypatch, stock, resolved, capsys):
    """availability_main ohne Netz/DB: Katalog-Modul, Lader, Token, Aufloesung und psql
    sind ersetzt. Gibt die Ids zurueck, fuer die aufgeloest wurde, und die Ausgabe."""
    import types
    cat_fake = types.SimpleNamespace(load_all_anime=lambda: stock, build_catalog_sql=cat.build_catalog_sql,
                                     q=cat.q)
    monkeypatch.setattr(cr, "_catalog_module", lambda: cat_fake)
    monkeypatch.setattr(cr, "load_anime", lambda: [
        {"id": s["id"], "titles": ["T", "", ""], "series_id": None, "cr_slugs": set()} for s in stock])
    monkeypatch.setattr(cr, "get_token", lambda s: "tok")
    monkeypatch.setattr(cr, "requests", types.SimpleNamespace(Session=lambda **k: None))
    gefragt = []

    def fake(session, token, a):
        gefragt.append(a["id"])
        return resolved[a["id"]]
    monkeypatch.setattr(cr, "resolve_series", fake)

    def kein_schreiben(*a, **k):
        raise AssertionError("Trockenlauf schreibt")
    monkeypatch.setattr(cr, "psql", kein_schreiben)
    cr.availability_main(True)
    return sorted(gefragt), capsys.readouterr().out


def test_availability_main_fragt_nur_titel_im_umfang(monkeypatch, capsys):
    """Die Umfangsgrenze haengt am Rate-Limit-Argument: kein Gesamtkatalog ueber den
    Grauzonen-Token. Ein Titel ausserhalb darf keine einzige Anfrage ausloesen."""
    import datetime
    jahr = datetime.datetime.now(datetime.timezone.utc).year
    stock = [_titel(1, "RELEASING", 2015), _titel(2, "FINISHED", jahr), _titel(3, "FINISHED", jahr - 1),
             _titel(4, "FINISHED", jahr - 2), _titel(5, "FINISHED", None)]
    resolved = {i: ({"id": f"G{i}", "audio_locales": ["ja-JP"], "subtitle_locales": ["de-DE"]}, "id")
                for i in range(1, 6)}
    gefragt, out = _lauf(monkeypatch, stock, resolved, capsys)
    assert gefragt == [1, 2, 3]
    assert "t4:" not in out and "t5:" not in out


def test_availability_main_schreibt_keine_aehnlichkeitstreffer(monkeypatch, capsys):
    import datetime
    jahr = datetime.datetime.now(datetime.timezone.utc).year
    s = {"id": "GRET", "series_metadata": {"audio_locales": ["ja-JP"], "subtitle_locales": ["de-DE"]}}
    resolved = {1: ({**s, "_slug_exact": False}, "search"),   # Schaetzung
                2: ({**s, "_slug_exact": True}, "search"),    # exakter Slug
                3: ({**s}, "id")}                             # eigener Link
    _, out = _lauf(monkeypatch, [_titel(i, "RELEASING", jahr) for i in (1, 2, 3)], resolved, capsys)
    assert "t1: crunchyroll" not in out
    assert "t2: crunchyroll confirmed" in out and "t3: crunchyroll confirmed" in out


# --- Fix-Welle: Frische-Verfall (Befund 1) ------------------------------------------
# Fuer eine `confirmed`-Zeile auf einer Fortsetzungsstaffel gibt es sonst KEINEN
# Loeschweg: `match_node` trifft die Fortsetzung nie, also raeumt der Sweep sie nie ab.


def test_verfall_erfasst_acht_tage_alte_zeile_aber_keine_sechs_tage_alte():
    """Ohne DB ist die Grenze nur ueber die Konstante pruefbar — und genau sie muss im
    SQL stehen, nicht ein getipptes Literal."""
    import datetime
    sql = cr.expiry_sql(True)[0]
    assert "last_seen_at < now() - interval" in sql
    assert f"interval '{cr.AVAIL_STALE_DAYS} days'" in sql
    now = datetime.datetime(2026, 11, 9, tzinfo=datetime.timezone.utc)
    grenze = now - datetime.timedelta(days=cr.AVAIL_STALE_DAYS)
    assert now - datetime.timedelta(days=8) < grenze   # acht Tage alt: wird abgeraeumt
    assert now - datetime.timedelta(days=6) > grenze   # sechs Tage alt: bleibt stehen


def test_verfall_behandelt_fehlenden_stempel_als_veraltet():
    """`NULL < now() - interval` ist UNKNOWN, die Zeile bliebe sonst liegen — und auf einer
    Fortsetzungsstaffel raeumt sie dann niemand ab. Erreichbar ueber den Admin: `source` ist
    ein editierbares Select mit Option 'crunchyroll', `lastSeenAt` ist nicht required. Also
    genau der Zustand, gegen den der Verfall gebaut ist, nur ueber den redaktionellen
    Eingang. Wer von Hand setzt, nimmt source='manual' (in beiden Schreibwegen ausgespart)."""
    sql = cr.expiry_sql(True)[0]
    assert "last_seen_at IS NULL" in sql
    # Die NULL-Bedingung muss mit der Altersbedingung geODERt sein, nicht geANDet —
    # sonst erfasst der Verfall nur noch Zeilen, die beides sind (also keine).
    assert "(last_seen_at IS NULL OR last_seen_at < now() - interval" in sql
    # Und sie darf das Veto nicht aushebeln: die rejected-Bedingung bleibt AND-verknuepft.
    assert "AND confidence IS DISTINCT FROM 'rejected' AND (last_seen_at IS NULL" in sql


def test_verfall_nennt_nur_crunchyroll():
    sql = cr.expiry_sql(True)[0]
    assert "source = 'crunchyroll'" in sql
    for fremd in ("justwatch", "adn", "manual"):
        assert fremd not in sql


def test_verfall_laesst_das_veto_stehen():
    """Der Lader erkennt ein Veto allein an `confidence` (load_all_anime), unabhaengig von
    `source`. Eine `rejected`-Zeile mit source='crunchyroll' — ein Redakteur, der die
    CR-Zeile an Ort und Stelle verwirft — wuerde der Verfall sonst nach sieben Tagen
    loeschen, und der naechste Lauf legte das Angebot wieder als Beleg an: das Veto haette
    sich selbst geloescht (Entscheidung 21, dieselbe Bedingung wie in build_catalog_sql)."""
    sql = cr.expiry_sql(True)[0]
    assert "confidence IS DISTINCT FROM 'rejected'" in sql
    # Niemals `<>`: der Altbestand traegt confidence NULL und muss erfasst bleiben.
    assert "<>" not in sql and "!=" not in sql


def test_verfall_nur_nach_erfolgreichem_durchlauf():
    """Token-Fehler oder 403/429 duerfen keine belegten Zeilen abraeumen."""
    assert cr.expiry_sql(False) == []
    # Erfolgsbegriff wie `run_complete` im Katalog-Skript: kein Abruffehler UND
    # ueberhaupt etwas erreicht.
    assert cr.availability_complete({"id": 3}, versucht=3, belegt=3) is True
    assert cr.availability_complete({"id": 2, "err": 1}, versucht=3, belegt=2) is False
    assert cr.availability_complete({"no-match": 3}, versucht=3, belegt=0) is False
    assert cr.availability_complete({}, versucht=0, belegt=0) is False


def _lauf_schreibend(monkeypatch, stock, resolved, capsys):
    """Wie `_lauf`, aber ohne Trockenlauf: gibt das geschriebene SQL zurueck."""
    import types
    cat_fake = types.SimpleNamespace(load_all_anime=lambda: stock, build_catalog_sql=cat.build_catalog_sql,
                                     q=cat.q)
    monkeypatch.setattr(cr, "_catalog_module", lambda: cat_fake)
    monkeypatch.setattr(cr, "load_anime", lambda: [
        {"id": s["id"], "titles": ["T", "", ""], "series_id": None, "cr_slugs": set()} for s in stock])
    monkeypatch.setattr(cr, "get_token", lambda s: "tok")
    monkeypatch.setattr(cr, "requests", types.SimpleNamespace(Session=lambda **k: None))
    monkeypatch.setattr(cr, "resolve_series", lambda session, token, a: resolved[a["id"]])
    geschrieben = []
    monkeypatch.setattr(cr, "psql", lambda sql, read=True: geschrieben.append(sql) or "")
    cr.availability_main(False)
    return "\n".join(geschrieben), capsys.readouterr().out


def _serie(sid="GABC"):
    return {"id": sid, "series_metadata": {"audio_locales": ["ja-JP"], "subtitle_locales": ["de-DE"]}}


def test_verfall_laeuft_am_ende_eines_erfolgreichen_durchlaufs(monkeypatch, capsys):
    import datetime
    jahr = datetime.datetime.now(datetime.timezone.utc).year
    sql, _ = _lauf_schreibend(monkeypatch, [_titel(1, "RELEASING", jahr)], {1: (_serie(), "id")}, capsys)
    assert "last_seen_at < now() - interval" in sql
    # Erst schreiben, dann abraeumen — sonst fiele die eben geschriebene Zeile mit.
    assert sql.index("INSERT INTO anime_streaming_offers") < sql.index("last_seen_at < now() - interval")
    assert sql.index("last_seen_at < now() - interval") < sql.rindex("COMMIT;")


def test_kein_verfall_wenn_der_durchlauf_an_fehlern_scheitert(monkeypatch, capsys):
    import datetime
    jahr = datetime.datetime.now(datetime.timezone.utc).year
    stock = [_titel(1, "RELEASING", jahr), _titel(2, "RELEASING", jahr)]
    resolved = {1: (_serie(), "id"), 2: (None, "err")}
    sql, out = _lauf_schreibend(monkeypatch, stock, resolved, capsys)
    assert "last_seen_at < now() - interval" not in sql
    assert "INSERT INTO anime_streaming_offers" in sql   # Schreiben bleibt erlaubt


def test_kein_verfall_wenn_der_lauf_nichts_belegt(monkeypatch, capsys):
    """Stille Semantikaenderung bei Crunchyroll (HTTP 200, keine Treffer) darf nicht den
    ganzen Bestand abraeumen — dieselbe Falle wie `knoten > 0` im Katalog-Skript."""
    import datetime
    jahr = datetime.datetime.now(datetime.timezone.utc).year
    sql, _ = _lauf_schreibend(monkeypatch, [_titel(1, "RELEASING", jahr)], {1: (None, "no-match")}, capsys)
    assert "last_seen_at < now() - interval" not in sql
