import pytest
from .conftest import load
jw =load("justwatch-streaming")

def test_norm_cjk_behaelt_japanische_schrift():
    assert jw.norm_cjk("幻想水滸伝") == "幻想水滸伝"
    assert jw.norm_cjk("ドラゴンボール超 ビルス") == "ドラゴンボール超ビルス"

def test_norm_variants_enthaelt_die_cjk_form():
    assert "幻想水滸伝" in jw.norm_variants("幻想水滸伝")

def test_gensou_suikoden_matcht_ueber_den_nativen_titel():
    """Regressionsfall: JustWatch führt 'Suikoden' / orig '幻想水滸伝' (2026)."""
    data = {"edges": [{"node": {
        "objectType": "SHOW",
        "content": {"title": "Suikoden", "originalTitle": "幻想水滸伝", "originalReleaseYear": 2026},
        "offers": [], "seasons": [],
    }}]}
    hit = jw.best_match(data, ["", "", "Gensou Suikoden", "幻想水滸伝"], "SHOW", 2026)
    assert hit is not None
    assert hit[1] == ""

def test_rebellen_vom_liang_shan_po_matcht_nicht():
    """Review Focus 4: gleicher originalTitle 'Suikoden', Jahr 1973 statt 2026."""
    data = {"edges": [{"node": {
        "objectType": "SHOW",
        "content": {"title": "Die Rebellen vom Liang Shan Po", "originalTitle": "Suikoden", "originalReleaseYear": 1973},
        "offers": [], "seasons": [],
    }}]}
    assert jw.best_match(data, ["", "", "Gensou Suikoden", "幻想水滸伝"], "SHOW", 2026) is None

def test_hyouge_mono_matcht_nicht_auf_mono():
    """Die alte, lockere Heuristik hatte das getan — darf nicht zurückkommen."""
    data = {"edges": [{"node": {
        "objectType": "SHOW",
        "content": {"title": "Mono", "originalTitle": "Mono", "originalReleaseYear": 2025},
        "offers": [], "seasons": [],
    }}]}
    assert jw.best_match(data, ["", "Hyouge Mono", "Hyouge Mono", ""], "SHOW", 2011) is None

def test_suchanfragen_nutzen_den_nativen_titel_nur_als_rueckfall():
    assert jw.search_queries({"titles": ["", "", "Gensou Suikoden", "幻想水滸伝"]}) == ["Gensou Suikoden", "幻想水滸伝"]
    assert jw.search_queries({"titles": ["Frieren", "Frieren EN", "Sousou no Frieren", "葬送のフリーレン"]}) == ["Frieren", "Sousou no Frieren"]

# --- Zusätzliche Gegenproben zur gelockerten Schwelle (0.6 -> 0.55) ---

def test_journeys_end_matcht_nicht_auf_frieren():
    """Obergrenze der Schwelle: 'journeysend' steckt in 'frierenbeyondjourneysend'
    (Verhältnis 0.458) — der Kriegsfilm darf nicht auf den Anime fallen."""
    data = {"edges": [{"node": {
        "objectType": "SHOW",
        "content": {"title": "Frieren: Beyond Journey's End", "originalTitle": "葬送のフリーレン",
                    "originalReleaseYear": 2023},
        "offers": [], "seasons": [],
    }}]}
    assert jw.best_match(data, ["", "", "Journey's End", ""], "SHOW", 2023) is None

def _node(title, orig, year):
    return {"edges": [{"node": {"objectType": "SHOW", "offers": [], "seasons": [],
            "content": {"title": title, "originalTitle": orig, "originalReleaseYear": year}}}]}

def test_substring_im_gelockerten_band_matcht_mit_jahr():
    """Positivfall OHNE nativen Titel: nur die Substring-Regel (0.571) trägt ihn.
    Setzt man die Schwelle auf 0.6 zurück, wird dieser Test rot."""
    data = _node("Suikoden", "Suikoden", 2026)
    assert jw.best_match(data, ["", "", "Gensou Suikoden", ""], "SHOW", 2026) is not None

def test_substring_im_gelockerten_band_matcht_nicht_ohne_jahr():
    """Das Band 0.55-0.6 gilt nur bei bekanntem Jahr auf beiden Seiten."""
    data = _node("Suikoden", "Suikoden", 2026)
    assert jw.best_match(data, ["", "", "Gensou Suikoden", ""], "SHOW", None) is None
    assert jw.best_match(_node("Suikoden", "Suikoden", None), ["", "", "Gensou Suikoden", ""], "SHOW", 2026) is None

def test_teilueberlappender_japanischer_titel_matcht_nicht():
    """ドラゴンボール超 (2015) vs ドラゴンボールZ (1989): gemeinsames Präfix, ratio 0.875
    — anderes Werk, fällt unter 0.90 (und am Jahresabstand)."""
    data = _node("Dragon Ball Z", "ドラゴンボールZ", 1989)
    assert jw.best_match(data, ["", "", "Dragon Ball Super", "ドラゴンボール超"], "SHOW", 2015) is None

def test_gleiche_cjk_form_mit_grossem_jahresabstand_matcht_nicht():
    data = _node("Suikoden", "幻想水滸伝", 1973)
    assert jw.best_match(data, ["", "", "Gensou Suikoden", "幻想水滸伝"], "SHOW", 2026) is None

def test_norm_cjk_raender():
    assert jw.norm_cjk("") == ""
    assert jw.norm_cjk(None) == ""
    assert jw.norm_cjk("!?・、。 ...") == ""
    assert jw.norm_cjk("Re:ゼロから始める異世界生活") == "reゼロから始める異世界生活"
    assert jw.norm_cjk("ヴァイオレット・エヴァーガーデン") == "ヴァイオレットエヴァーガーデン"
    assert jw.norm_cjk("ＳＰＹ×ＦＡＭＩＬＹ") == "spyfamily"


def test_mapping_kennt_die_neuen_anbieter():
    m = jw.CLEARNAME_TO_SLUG
    assert m["hbo max"] == "hbo-max"
    assert m["hbo max amazon channel"] == "hbo-max"
    assert m["akibapass"] == "akibapass"
    assert m["pluto tv"] == "pluto-tv"
    # Null Anime-Angebote im DE-Katalog (Messung 2026-11-09): bewusst nicht gemappt
    assert "plaion pictures" not in m
    assert "prosieben maxx" not in m


def test_mapping_deckt_die_gemessenen_clearnames_ab():
    """Am 2026-11-09 in echten Angeboten gesehen."""
    for cn in ["crunchyroll", "crunchyroll amazon channel", "aniverse amazon channel",
               "animation digital network", "anime digital network amazon channel",
               "amazon prime video", "amazon prime video with ads", "netflix",
               "netflix standard with ads", "rtl+", "rtl+ max amazon channel"]:
        assert cn in jw.CLEARNAME_TO_SLUG, cn


# --- Aufgabe 11: Vererbung und Veto in der Titelsuche ------------------------------

def _angebot(slug_name, url, monet="FLATRATE", audio=(), subs=(), count=None):
    o = {"monetizationType": monet, "standardWebURL": url, "package": {"clearName": slug_name},
         "audioLanguages": list(audio), "subtitleLanguages": list(subs)}
    if count is not None:
        o["elementCount"] = count
    return o


def _returner(serien_offers, staffel_offers=(), year=2023):
    """Die gemessene Lage vom 2026-11-09: Angebote an der Serie, Staffel 2 leer."""
    return {"objectType": "SHOW",
            "content": {"title": "A Returner's Magic Should Be Special",
                        "originalTitle": "帰還者の魔法は特別です", "originalReleaseYear": year},
            "offers": list(serien_offers),
            "seasons": [{"content": {"title": "Staffel 2", "seasonNumber": 2, "originalReleaseYear": 2026},
                         "offers": list(staffel_offers)}]}


CR = ("Crunchyroll", "https://crunchyroll.com/returner")


def test_leere_staffel_erbt_bei_laufendem_titel_die_serien_anbieter():
    """Regressionsfall Returner S2."""
    node = {"objectType": "SHOW",
            "content": {"title": "A Returner's Magic Should Be Special", "originalTitle": "帰還者の魔法は特別です", "originalReleaseYear": 2023},
            "offers": [{"monetizationType": "FLATRATE", "standardWebURL": "https://crunchyroll.com/returner",
                        "package": {"clearName": "Crunchyroll"}, "audioLanguages": ["ja"], "subtitleLanguages": ["de"]}],
            "seasons": [{"content": {"title": "Staffel 2", "seasonNumber": 2, "originalReleaseYear": 2026}, "offers": []}]}
    offers = jw.aggregate_offers(node, node["seasons"][0], status="RELEASING", year=2026, current_year=2026)
    assert [o["provider"] for o in offers] == ["crunchyroll"]
    assert offers[0]["confidence"] == "unconfirmed"
    assert offers[0]["monetization"] == "flatrate"
    assert offers[0]["audio"] == "" and offers[0]["subs"] == ""


def test_leere_staffel_erbt_bei_altem_titel_nicht():
    node = {"objectType": "SHOW",
            "content": {"title": "X", "originalTitle": "X", "originalReleaseYear": 2010},
            "offers": [{"monetizationType": "FLATRATE", "standardWebURL": "https://crunchyroll.com/x",
                        "package": {"clearName": "Crunchyroll"}, "audioLanguages": [], "subtitleLanguages": []}],
            "seasons": [{"content": {"title": "Staffel 2", "seasonNumber": 2, "originalReleaseYear": 2012}, "offers": []}]}
    assert jw.aggregate_offers(node, node["seasons"][0], status="FINISHED", year=2012, current_year=2026) == []


def test_geerbte_zeile_traegt_serien_link_und_keine_zaehlung():
    node = _returner([_angebot(*CR, audio=["ja"], subs=["de"], count=2)])
    (o,) = jw.aggregate_offers(node, node["seasons"][0], status="RELEASING", year=2026, current_year=2026)
    assert o["url"] == "https://crunchyroll.com/returner"
    assert o["seasons"] is None and o["episodes"] is None
    assert o["available_to"] is None


def test_laufender_jahrgang_erbt_auch_ohne_status_releasing():
    node = _returner([_angebot(*CR)])
    offers = jw.aggregate_offers(node, node["seasons"][0], status="FINISHED", year=2026, current_year=2026)
    assert [o["confidence"] for o in offers] == ["unconfirmed"]


def test_ohne_neue_parameter_wird_nichts_vererbt():
    """Standardwerte: bestehende Aufrufe verhalten sich wie vorher."""
    node = _returner([_angebot(*CR)])
    assert jw.aggregate_offers(node, node["seasons"][0]) == []


def test_belegtes_staffelangebot_ist_confirmed_und_wird_nicht_ueberschrieben():
    node = _returner([_angebot(*CR, audio=["ja"]), _angebot("Netflix", "https://netflix.com/x")],
                     [_angebot("Crunchyroll", "https://crunchyroll.com/s2", audio=["ja"], subs=["de"], count=12)])
    offers = {o["provider"]: o for o in jw.aggregate_offers(
        node, node["seasons"][0], status="RELEASING", year=2026, current_year=2026)}
    assert offers["crunchyroll"]["confidence"] == "confirmed"
    assert offers["crunchyroll"]["url"] == "https://crunchyroll.com/s2"
    assert offers["crunchyroll"]["audio"] == "ja"
    # Die Staffel ist gepflegt (trägt ein Angebot): Netflix nur an der Serie wird NICHT geerbt
    assert list(offers) == ["crunchyroll"]


def test_gepflegte_staffel_erbt_nichts_leere_staffel_erbt_weiter():
    """Fix-Runde 1: das FEHLEN eines Anbieters an einer gepflegten Staffel ist eine Aussage."""
    serie = [_angebot(*CR)]
    gepflegt = _returner(serie, [_angebot("Netflix", "https://netflix.com/s2")])
    offers = jw.aggregate_offers(gepflegt, gepflegt["seasons"][0], status="RELEASING", year=2026, current_year=2026)
    assert [(o["provider"], o["confidence"]) for o in offers] == [("netflix", "confirmed")]
    leer = _returner(serie)
    offers = jw.aggregate_offers(leer, leer["seasons"][0], status="RELEASING", year=2026, current_year=2026)
    assert [(o["provider"], o["confidence"]) for o in offers] == [("crunchyroll", "unconfirmed")]


def test_paar_mit_handarbeitszeile_wird_nicht_eingefuegt():
    """Fix-Runde 1: die Version des Redakteurs gewinnt; ein anderes Paar kommt normal durch."""
    a = _anime(manual={("crunchyroll", "flatrate")}, offers={("crunchyroll", "flatrate"): None}, have={"crunchyroll"})
    stmts, changed = jw.build_sql(a, [_offer("crunchyroll"), _offer("crunchyroll", monet="ads"), _offer("netflix")], NOW)
    ins = _inserts(stmts)
    assert len(ins) == 2
    assert not any("'crunchyroll', 'flatrate'" in s for s in ins)
    assert any("'crunchyroll', 'ads'" in s for s in ins)
    assert any("'netflix'" in s for s in ins)
    assert "'crunchyroll'" in _inserts(stmts, "anime_streaming_providers")[0]


def test_kauf_und_leih_angebote_der_serie_werden_nicht_vererbt():
    node = _returner([_angebot("Amazon Video", "https://amazon.de/x", monet="BUY"),
                      _angebot("Amazon Video", "https://amazon.de/x", monet="RENT")])
    assert jw.aggregate_offers(node, node["seasons"][0], status="RELEASING", year=2026, current_year=2026) == []


def test_werbe_angebot_der_serie_wird_als_flatrate_vererbt():
    """Entscheidung 17: nie ads/free behaupten, wo wir es nur erben."""
    node = _returner([_angebot("Pluto TV", "https://pluto.tv/x", monet="ADS")])
    (o,) = jw.aggregate_offers(node, node["seasons"][0], status="RELEASING", year=2026, current_year=2026)
    assert (o["provider"], o["monetization"], o["confidence"]) == ("pluto-tv", "flatrate", "unconfirmed")


def test_direktanbieter_link_gewinnt_beim_vererben_gegen_amazon_channel():
    node = _returner([_angebot("Crunchyroll Amazon Channel", "https://watch.amazon.de/cr"),
                      _angebot("Crunchyroll", "https://crunchyroll.com/returner")])
    offers = jw.aggregate_offers(node, node["seasons"][0], status="RELEASING", year=2026, current_year=2026)
    assert [(o["provider"], o["url"]) for o in offers] == [("crunchyroll", "https://crunchyroll.com/returner")]


def test_serien_anbieter_ohne_deep_link_wird_nicht_vererbt():
    node = _returner([{"monetizationType": "FLATRATE", "standardWebURL": None,
                       "package": {"clearName": "Crunchyroll"}, "audioLanguages": [], "subtitleLanguages": []}])
    assert jw.aggregate_offers(node, node["seasons"][0], status="RELEASING", year=2026, current_year=2026) == []


def test_ohne_staffel_ist_alles_confirmed_und_nichts_wird_vererbt():
    node = _returner([_angebot(*CR, count=2)])
    offers = jw.aggregate_offers(node, status="RELEASING", year=2026, current_year=2026)
    assert [(o["provider"], o["confidence"]) for o in offers] == [("crunchyroll", "confirmed")]


@pytest.mark.parametrize("status", [None, "RELEASING", "FINISHED", "NOT_YET_RELEASED"])
@pytest.mark.parametrize("year", [None, 2014, 2026, "2026"])
@pytest.mark.parametrize("staffel_leer", [True, False])
def test_titelsuche_und_sweep_ergeben_dieselbe_stufe(status, year, staffel_leer):
    """Eine Regel, eine Implementierung: bei derselben Lage (Crunchyroll nur am Werk, nicht
    am gematchten Objekt; Objekt leer oder mit anderem Angebot) ergeben Titelsuche und
    Katalog-Sweep dieselbe Stufe."""
    cat = load("justwatch-catalog")
    eigene = [] if staffel_leer else [_angebot("Netflix", "https://netflix.com/s2")]
    node = _returner([_angebot(*CR)], eigene)
    offers = jw.aggregate_offers(node, node["seasons"][0], status=status, year=year, current_year=2026)
    erwartet = cat.confidence_for([] if staffel_leer else ["netflix"], ["crunchyroll"] + ([] if staffel_leer else ["netflix"]),
                                  "crunchyroll", status, year, 2026)
    assert [o["confidence"] for o in offers if o["provider"] == "crunchyroll"] == ([erwartet] if erwartet else [])


def test_aggregate_offers_fragt_confidence_for_statt_eigene_regel(monkeypatch):
    aufrufe = []
    monkeypatch.setattr(jw, "confidence_for", lambda *a: (aufrufe.append(a), "unconfirmed")[1])
    node = _returner([_angebot(*CR)])
    offers = jw.aggregate_offers(node, node["seasons"][0], status="FINISHED", year=2014, current_year=2026)
    assert len(aufrufe) == 1
    assert aufrufe[0][2:] == ("crunchyroll", "FINISHED", 2014, 2026)
    assert [o["confidence"] for o in offers] == ["unconfirmed"]


# --- fetch_offers / load_anime: die Parameter kommen wirklich an --------------------

class _Antwort:
    status_code = 200

    def __init__(self, node):
        self._node = node

    def json(self):
        return {"data": {"popularTitles": {"edges": [{"node": self._node}]}}}


def test_fetch_offers_vererbt_beim_regressionsfall(monkeypatch):
    node = _returner([_angebot(*CR, audio=["ja"], subs=["de"])])
    monkeypatch.setattr(jw, "api_post", lambda s, p: _Antwort(node))
    a = {"id": 1, "slug": "kikansha-no-mahou-wa-tokubetsu-desu-2nd-season", "want": "SHOW", "year": 2026,
         "status": "RELEASING",
         "titles": ["", "A Returner's Magic Should Be Special Season 2", "Kikansha no Mahou wa Tokubetsu desu 2nd Season", ""]}
    offers = jw.fetch_offers(None, a, current_year=2026)
    assert offers, "Matcher findet die Serie, Staffel 2 muss Crunchyroll erben"
    assert [(o["provider"], o["confidence"]) for o in offers] == [("crunchyroll", "unconfirmed")]


def test_fetch_offers_erbt_bei_altem_titel_nicht(monkeypatch):
    node = _returner([_angebot(*CR)])
    monkeypatch.setattr(jw, "api_post", lambda s, p: _Antwort(node))
    a = {"id": 1, "slug": "x", "want": "SHOW", "year": 2026, "status": "FINISHED",
         "titles": ["", "A Returner's Magic Should Be Special Season 2", "", ""]}
    assert jw.fetch_offers(None, a, current_year=2024) in (False, [])


def test_load_anime_selektiert_status_und_liest_veto_und_handarbeit(monkeypatch):
    sqls = []
    antworten = iter([
        '[{"id":7,"slug":"s","fmt":"TV","year":2026,"st":"RELEASING","de":"","en":"E","ro":"R","na":""}]',
        '[]',
        '[{"pid":7,"p":"crunchyroll","m":"flatrate","f":null,"s":"justwatch","c":"unconfirmed"},'
        '{"pid":7,"p":"netflix","m":"flatrate","f":null,"s":"manual","c":null},'
        '{"pid":7,"p":"adn","m":"flatrate","f":null,"s":"justwatch","c":"rejected"},'
        '{"pid":7,"p":"hidive","m":"flatrate","f":"2026-01-01","s":null,"c":null}]',
    ])
    monkeypatch.setattr(jw, "psql", lambda sql, read=True: (sqls.append(sql), next(antworten))[1])
    (a,) = jw.load_anime(slugs=["s"])
    assert "a.status" in sqls[0]
    assert a["status"] == "RELEASING"
    assert a["manual"] == {("netflix", "flatrate")}
    assert a["rejected"] == {("adn", "flatrate")}
    assert a["offers"][("hidive", "flatrate")] == "2026-01-01"
    assert a["confidence"][("hidive", "flatrate")] == "confirmed"  # NULL = belegt
    assert "source" in sqls[2] and "confidence" in sqls[2]


# --- build_sql: Schreiben mit Vertrauensstufe, Handarbeit und Veto ------------------

def _offer(provider, monet="flatrate", conf="confirmed", audio="", subs="", url=None):
    return {"provider": provider, "monetization": monet, "url": url or f"https://{provider}.example/x",
            "audio": audio, "subs": subs, "seasons": None, "episodes": None, "available_to": None,
            "confidence": conf}


def _anime(**kw):
    a = {"id": 42, "slug": "s", "have": set(), "offers": {}, "manual": set(), "rejected": set(), "confidence": {}}
    a.update(kw)
    return a


NOW = "2026-11-09T12:00:00+00:00"


def _inserts(stmts, tabelle="anime_streaming_offers"):
    return [s for s in stmts if s.startswith(f"INSERT INTO {tabelle}")]


def test_delete_spart_handarbeit_und_veto_aus_aber_nicht_die_monetarisierung():
    stmts, _ = jw.build_sql(_anime(), [_offer("crunchyroll")], NOW)
    d = stmts[0]
    assert d.startswith("DELETE FROM anime_streaming_offers WHERE _parent_id = 42")
    assert "source IS DISTINCT FROM 'manual'" in d
    assert "confidence IS DISTINCT FROM 'rejected'" in d
    assert "monetization" not in d, "die Titelsuche ist fuer Kauf und Leih autoritativ"


def test_insert_traegt_confidence_und_source():
    stmts, _ = jw.build_sql(_anime(), [_offer("crunchyroll", conf="unconfirmed")], NOW)
    (ins,) = _inserts(stmts)
    assert "confidence,source" in ins
    assert "'unconfirmed', 'justwatch')" in ins


def test_insert_ohne_confidence_im_dict_gilt_als_confirmed():
    o = _offer("crunchyroll")
    del o["confidence"]
    stmts, _ = jw.build_sql(_anime(), [o], NOW)
    assert "'confirmed', 'justwatch')" in _inserts(stmts)[0]


def test_veto_paar_wird_nicht_eingefuegt():
    a = _anime(rejected={("crunchyroll", "flatrate")}, offers={("crunchyroll", "flatrate"): None})
    stmts, _ = jw.build_sql(a, [_offer("crunchyroll"), _offer("netflix")], NOW)
    (ins,) = _inserts(stmts)
    assert "'netflix'" in ins and "'crunchyroll'" not in ins
    (idx,) = _inserts(stmts, "anime_streaming_providers")
    assert "'netflix'" in idx and "'crunchyroll'" not in idx


def test_veto_gilt_nur_fuer_dasselbe_paar():
    a = _anime(rejected={("crunchyroll", "flatrate")})
    stmts, _ = jw.build_sql(a, [_offer("crunchyroll", monet="buy")], NOW)
    assert any("'crunchyroll', 'buy'" in s for s in _inserts(stmts))


def test_unbestaetigtes_angebot_kommt_in_den_filter_index_aber_nicht_in_die_sprachen():
    o = _offer("crunchyroll", conf="unconfirmed", audio="ja", subs="de")  # selbst mit Sprachen im Dict
    stmts, _ = jw.build_sql(_anime(), [o], NOW)
    assert "'crunchyroll'::enum_anime_streaming_providers" in "\n".join(stmts)
    assert not _inserts(stmts, "anime_available_languages")


def test_belegtes_angebot_liefert_weiter_seine_sprachen():
    stmts, _ = jw.build_sql(_anime(), [_offer("crunchyroll", audio="ja", subs="de")], NOW)
    assert _inserts(stmts, "anime_available_languages")


def test_kaufangebot_bleibt_ausserhalb_des_index():
    stmts, _ = jw.build_sql(_anime(), [_offer("amazon-video", monet="buy")], NOW)
    assert not _inserts(stmts, "anime_streaming_providers")


def test_handarbeits_anbieter_bleibt_im_filter_index():
    a = _anime(manual={("netflix", "flatrate")}, offers={("netflix", "flatrate"): None})
    stmts, _ = jw.build_sql(a, [_offer("crunchyroll")], NOW)
    (idx,) = _inserts(stmts, "anime_streaming_providers")
    assert "'netflix'" in idx and "'crunchyroll'" in idx


def test_order_beginnt_nicht_bei_eins_da_zeilen_stehen_bleiben():
    stmts, _ = jw.build_sql(_anime(), [_offer("crunchyroll")], NOW)
    assert "max(_order)" in _inserts(stmts)[0]


def test_handarbeit_und_veto_loesen_keine_dauer_aenderung_aus():
    """Stehengebliebene Zeilen sind kein Unterschied zum Ergebnis des letzten Laufs."""
    a = _anime(have={"crunchyroll", "netflix"},
               offers={("crunchyroll", "flatrate"): None, ("netflix", "flatrate"): None, ("adn", "flatrate"): None},
               manual={("netflix", "flatrate")}, rejected={("adn", "flatrate")},
               confidence={("crunchyroll", "flatrate"): "confirmed"})
    _, changed = jw.build_sql(a, [_offer("crunchyroll"), _offer("adn")], NOW)
    assert changed is False


def test_wechsel_der_vertrauensstufe_zaehlt_als_aenderung():
    a = _anime(have={"crunchyroll"}, offers={("crunchyroll", "flatrate"): None},
               confidence={("crunchyroll", "flatrate"): "unconfirmed"})
    _, changed = jw.build_sql(a, [_offer("crunchyroll", conf="confirmed")], NOW)
    assert changed is True


def test_first_seen_bleibt_erhalten_auch_null():
    a = _anime(have={"crunchyroll"}, offers={("crunchyroll", "flatrate"): None})
    stmts, _ = jw.build_sql(a, [_offer("crunchyroll", conf="unconfirmed")], NOW)
    assert f"NULL, '{NOW}', 'unconfirmed'" in _inserts(stmts)[0]


def test_leere_angebotsliste_laesst_handarbeit_und_veto_im_index_und_in_der_tabelle():
    """Der `--purge-unmatched`-Pfad ruft build_sql mit []: dieselben Ausnahmen."""
    a = _anime(manual={("netflix", "flatrate")}, offers={("netflix", "flatrate"): None})
    stmts, _ = jw.build_sql(a, [], NOW)
    assert "source IS DISTINCT FROM 'manual'" in stmts[0]
    assert "confidence IS DISTINCT FROM 'rejected'" in stmts[0]
    assert "'netflix'" in _inserts(stmts, "anime_streaming_providers")[0]


# --- Aufgabe 12: das autoritative Löschen überlebt den Handarbeits-Schutz ---------------

def test_echtes_lizenzende_loescht_das_angebot():
    """Review Focus 2: der Schutz darf den Bestand nicht einfrieren."""
    a = {"id": 7, "have": {"crunchyroll"}, "offers": {("crunchyroll", "flatrate"): "2026-01-01T00:00:00Z"}}
    stmts, changed = jw.build_sql(a, [], "2026-11-09T00:00:00Z")
    sql = " ".join(stmts)
    assert "DELETE FROM anime_streaming_offers" in sql
    assert "INSERT INTO anime_streaming_offers" not in sql
    assert changed is True


def test_manuelle_zeile_wird_nicht_geloescht():
    a = {"id": 7, "have": set(), "offers": {}}
    sql = " ".join(jw.build_sql(a, [], "2026-11-09T00:00:00Z")[0])
    assert "source IS DISTINCT FROM 'manual'" in sql


def test_lizenzende_loescht_auch_kauf_und_leih_in_der_titelsuche():
    """Die Titelsuche sieht alle Monetarisierungen: ihr DELETE darf nicht auf
    Abo/Werbung/Gratis eingeschränkt sein, sonst bleibt ein abgelaufenes Leih-Angebot stehen."""
    a = _anime(have={"amazon-video"}, offers={("amazon-video", "rent"): None})
    stmts, changed = jw.build_sql(a, [], NOW)
    assert "monetization" not in stmts[0]
    assert "confidence IS DISTINCT FROM 'rejected'" in stmts[0]
    assert _inserts(stmts) == []
    assert changed is True


# --- Aufgabe 15: gewichtete Rotation und Lücken-Alarm -------------------------------

def test_gewichtete_rotation_bevorzugt_neue_jahrgaenge():
    sql = jw.stale_order_sql(2026)
    assert "season_year" in sql
    assert "streaming_checked_at" in sql
    assert "DESC" in sql.upper()


def test_rotation_reihenfolge_laufend_dann_jahrgang_dann_alter():
    """Die Reihenfolge der Kriterien IST die Anforderung."""
    sql = jw.stale_order_sql(2026)
    i_status = sql.index("RELEASING")
    i_jahr = sql.index("season_year")
    i_stempel = sql.index("streaming_checked_at")
    assert i_status < i_jahr < i_stempel
    assert "ASC NULLS FIRST" in sql


def test_stale_weighted_nutzt_die_gewichtung_und_stale_bleibt_erhalten(monkeypatch):
    sqls = []
    monkeypatch.setattr(jw, "psql", lambda sql, read=True: (sqls.append(sql), "[]")[1])
    jw.load_anime(stale_weighted=150)
    assert "RELEASING" in sqls[0] and "LIMIT 150" in sqls[0]
    sqls.clear()
    jw.load_anime(stale_limit=150)  # bestehender Modus unverändert
    assert "ORDER BY a.streaming_checked_at ASC NULLS FIRST LIMIT 150" in sqls[0]
    assert "RELEASING" not in sqls[0]


def test_aktuelle_season_nach_monat():
    import datetime as dt
    assert jw.current_season(dt.date(2026, 11, 9)) == ("FALL", 2026)
    assert jw.current_season(dt.date(2026, 1, 1)) == ("WINTER", 2026)
    assert jw.current_season(dt.date(2026, 6, 30)) == ("SPRING", 2026)
    assert jw.current_season(dt.date(2026, 7, 1)) == ("SUMMER", 2026)


def test_alarm_schweigt_bei_null():
    assert jw.gap_alarm_text(0, "FALL", 2026) is None


def test_alarm_meldet_luecken_mit_zahl_und_season():
    text = jw.gap_alarm_text(3, "FALL", 2026)
    assert text and "3" in text and "FALL 2026" in text


def test_luecken_abfrage_zaehlt_nur_titel_ohne_angebot_und_ohne_stempel():
    sql = jw.gap_sql("FALL", 2026)
    assert "season_year = 2026" in sql and "season = 'FALL'" in sql
    assert "NOT EXISTS" in sql and "anime_streaming_offers" in sql
    assert "streaming_verified_at IS NULL" in sql
    assert "is_hentai IS NOT TRUE" in sql


def test_gap_alarm_modus_gibt_bei_null_nichts_aus(monkeypatch, capsys):
    monkeypatch.setattr(jw, "psql", lambda sql, read=True: "0\n")
    monkeypatch.setattr(jw.sys, "argv", ["x", "--gap-alarm"])
    jw.main()
    assert capsys.readouterr().out == ""


def test_gap_alarm_modus_gibt_bei_luecke_text_aus(monkeypatch, capsys):
    monkeypatch.setattr(jw, "psql", lambda sql, read=True: "4\n")
    monkeypatch.setattr(jw.sys, "argv", ["x", "--gap-alarm"])
    jw.main()
    assert "4" in capsys.readouterr().out


def test_rotation_klemmt_kommende_jahrgaenge_und_sortiert_absteigend():
    """Nagelt LEAST und die Richtung fest (nicht nur Substrings)."""
    assert "ORDER BY (a.status = 'RELEASING') DESC" in jw.stale_order_sql(2026)
    assert "LEAST(COALESCE(a.season_year, 0), 2026) DESC," in jw.stale_order_sql(2026)
    assert "LEAST(COALESCE(a.season_year, 0), 2031) DESC," in jw.stale_order_sql(2031)
    assert jw.stale_order_sql(2026).rstrip().endswith("a.streaming_checked_at ASC NULLS FIRST")
    assert "season_year, 0), 2026) ASC" not in jw.stale_order_sql(2026)


# --- Aufgabe 15 Fix-Runde 2: Crunchyroll-Direktbeleg überlebt die Titelsuche --------

def test_titelsuche_delete_spart_crunchyroll_aus_und_loescht_den_rest():
    """Echtes Lizenzende bleibt möglich: alles außer manual/rejected/crunchyroll wird gelöscht."""
    stmts, _ = jw.build_sql(_anime(), [_offer("netflix")], NOW)
    d = stmts[0]
    assert "source IS DISTINCT FROM 'crunchyroll'" in d
    assert "source IS DISTINCT FROM 'manual'" in d and "confidence IS DISTINCT FROM 'rejected'" in d
    assert "source = " not in d and "source <>" not in d and " IN (" not in d


def test_crunchyroll_zeile_wird_von_der_titelsuche_nicht_doppelt_eingefuegt():
    k = ("crunchyroll", "flatrate")
    a = _anime(direkt={k}, offers={k: None}, have={"crunchyroll"})
    stmts, changed = jw.build_sql(a, [_offer("crunchyroll", conf="unconfirmed"), _offer("netflix")], NOW)
    (ins,) = _inserts(stmts)
    assert "'netflix'" in ins and "'crunchyroll'" not in ins
    (idx,) = _inserts(stmts, "anime_streaming_providers")
    assert "'crunchyroll'" in idx, "der Anbieter der stehenbleibenden Zeile bleibt im Filter-Index"
    assert changed  # netflix ist neu


def test_crunchyroll_zeile_allein_ist_keine_aenderung():
    k = ("crunchyroll", "flatrate")
    a = _anime(direkt={k}, offers={k: None}, have={"crunchyroll"})
    _, changed = jw.build_sql(a, [_offer("crunchyroll", conf="unconfirmed")], NOW)
    assert not changed


def test_load_anime_liest_crunchyroll_quelle_als_direkt(monkeypatch):
    antworten = iter([
        '[{"id":7,"slug":"s","fmt":"TV","year":2026,"st":"RELEASING","de":"","en":"E","ro":"R","na":""}]',
        '[]',
        '[{"pid":7,"p":"crunchyroll","m":"flatrate","f":null,"s":"crunchyroll","c":null}]',
    ])
    monkeypatch.setattr(jw, "psql", lambda sql, read=True: next(antworten))
    (a,) = jw.load_anime(slugs=["s"])
    assert a["direkt"] == {("crunchyroll", "flatrate")}
