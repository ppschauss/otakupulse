from .conftest import load
cat = load("justwatch-catalog")


def test_packages_deckt_die_gemessenen_shortnames_ab():
    """shortNames am 2026-11-09 aus echten Angeboten ermittelt."""
    assert cat.PACKAGES["cru"] == "crunchyroll"
    assert cat.PACKAGES["cra"] == "crunchyroll"
    assert cat.PACKAGES["ava"] == "aniverse"
    assert cat.PACKAGES["adn"] == "adn"
    assert cat.PACKAGES["ada"] == "adn"
    assert cat.PACKAGES["amp"] == "amazon-prime-video"
    assert cat.PACKAGES["pva"] == "amazon-prime-video"
    assert cat.PACKAGES["nfx"] == "netflix"


def test_packages_slugs_sind_dem_streaming_skript_bekannt():
    """Jeder Slug muss auch in CLEARNAME_TO_SLUG vorkommen, sonst würde parse_node
    die Angebote dieses Pakets später verwerfen."""
    bekannt = set(cat.jw.CLEARNAME_TO_SLUG.values())
    assert set(cat.PACKAGES.values()) <= bekannt
    assert len(cat.PACKAGES) == 19


def test_parse_node_liest_staffeln_mit_ihren_angeboten():
    node = {
        "objectType": "SHOW",
        "content": {"title": "Attack on Titan", "originalTitle": "Shingeki no Kyojin", "originalReleaseYear": 2013},
        "offers": [{"monetizationType": "FLATRATE", "standardWebURL": "https://crunchyroll.com/aot",
                    "package": {"clearName": "Crunchyroll"}, "audioLanguages": ["de"], "subtitleLanguages": ["de"]}],
        "seasons": [
            {"content": {"title": "Staffel 1", "seasonNumber": 1, "originalReleaseYear": 2013},
             "offers": [{"monetizationType": "FLATRATE", "standardWebURL": "https://crunchyroll.com/aot-s1",
                         "package": {"clearName": "Crunchyroll"}, "audioLanguages": ["de", "ja"], "subtitleLanguages": []}]},
            {"content": {"title": "Staffel 2", "seasonNumber": 2, "originalReleaseYear": 2017}, "offers": []},
        ],
    }
    p = cat.parse_node(node)
    assert p["original_title"] == "Shingeki no Kyojin"
    assert p["year"] == 2013
    assert len(p["seasons"]) == 2
    assert p["seasons"][0]["number"] == 1
    assert p["seasons"][0]["offers"][0]["provider"] == "crunchyroll"
    assert p["seasons"][0]["offers"][0]["audio"] == ["de", "ja"]
    assert p["seasons"][1]["offers"] == []


def test_parse_node_liest_titel_typ_und_angebotsfelder():
    node = {"objectType": "MOVIE", "content": {"title": "T", "originalTitle": "O", "originalReleaseYear": 2019},
            "offers": [{"monetizationType": "ADS", "standardWebURL": "https://x/y", "elementCount": 3,
                        "availableTo": "2027-01-01", "package": {"clearName": "Netflix Standard with Ads"},
                        "audioLanguages": None, "subtitleLanguages": ["de"]}]}
    p = cat.parse_node(node)
    assert p["title"] == "T" and p["object_type"] == "MOVIE" and p["seasons"] == []
    o = p["offers"][0]
    assert o["provider"] == "netflix" and o["monetization"] == "ads"
    assert o["url"] == "https://x/y" and o["episodes"] == 3 and o["available_to"] == "2027-01-01"
    assert o["audio"] == [] and o["subs"] == ["de"]


def test_parse_node_verwirft_angebote_ohne_deeplink():
    node = {"objectType": "SHOW", "content": {"title": "X", "originalTitle": "X", "originalReleaseYear": 2020},
            "offers": [{"monetizationType": "FLATRATE", "standardWebURL": None, "package": {"clearName": "Crunchyroll"}}],
            "seasons": []}
    assert cat.parse_node(node)["offers"] == []


def test_parse_node_verwirft_ungemappte_anbieter():
    node = {"objectType": "SHOW", "content": {"title": "X", "originalTitle": "X", "originalReleaseYear": 2020},
            "offers": [{"monetizationType": "BUY", "standardWebURL": "https://thalia.de/x", "package": {"clearName": "Thalia"}}],
            "seasons": []}
    assert cat.parse_node(node)["offers"] == []


def test_parse_node_verwirft_auch_in_staffeln():
    node = {"objectType": "SHOW", "content": {"title": "X"}, "offers": [],
            "seasons": [{"content": {"seasonNumber": 1},
                         "offers": [{"monetizationType": "FLATRATE", "standardWebURL": "",
                                     "package": {"clearName": "Crunchyroll"}},
                                    {"monetizationType": "FLATRATE", "standardWebURL": "https://a/b",
                                     "package": {"clearName": "Unbekannt TV"}}]}]}
    assert cat.parse_node(node)["seasons"][0]["offers"] == []


def test_parse_node_haelt_amazon_channel_markierung_fuer_die_zuordnung():
    node = {"objectType": "SHOW", "content": {"title": "X"}, "seasons": [],
            "offers": [{"monetizationType": "FLATRATE", "standardWebURL": "https://watch.amazon.de/x",
                        "package": {"clearName": "Crunchyroll Amazon Channel"}}]}
    o = cat.parse_node(node)["offers"][0]
    assert o["provider"] == "crunchyroll" and o["is_channel"] is True


# --- fetch_catalog: Paginierung und das complete-Flag ---------------------------

class FakeResp:
    def __init__(self, status=200, body=None, bad_json=False):
        self.status_code, self._body, self._bad = status, body, bad_json

    def json(self):
        if self._bad:
            raise ValueError("kein JSON")
        return self._body


def page(n, cursor, has_next):
    nodes = [{"objectType": "SHOW", "content": {"title": f"T{cursor}-{i}"}, "offers": [], "seasons": []}
             for i in range(n)]
    return FakeResp(200, {"data": {"popularTitles": {
        "totalCount": 99, "pageInfo": {"endCursor": cursor, "hasNextPage": has_next},
        "edges": [{"node": nd} for nd in nodes]}}})


def run(monkeypatch, responses):
    """Spielt die Antworten der Reihe nach ab und merkt sich die gesendeten Payloads."""
    sent = []
    it = iter(responses)

    def fake_api_post(session, payload):
        sent.append(payload)
        r = next(it)
        if isinstance(r, Exception):
            raise r
        return r
    monkeypatch.setattr(cat, "api_post", fake_api_post)
    nodes, complete = cat.fetch_catalog(object(), "ava", "SHOW")
    return nodes, complete, sent


def test_fetch_blaettert_ueber_endcursor_bis_letzte_seite(monkeypatch):
    nodes, complete, sent = run(monkeypatch, [page(2, "c1", True), page(2, "c2", True), page(1, "c3", False)])
    assert len(nodes) == 5 and complete is True
    assert [s["variables"].get("after") for s in sent] == [None, "c1", "c2"]
    f = sent[0]["variables"]["filter"]
    assert f == {"packages": ["ava"], "objectTypes": ["SHOW"], "genres": ["ani"],
                 "monetizationTypes": ["FLATRATE", "ADS", "FREE"]}
    assert sent[0]["variables"]["c"] == "DE"
    assert sent[0]["query"] == cat.BROWSE_Q


def test_fetch_http_fehler_auf_erster_seite_ist_unvollstaendig(monkeypatch):
    nodes, complete, _ = run(monkeypatch, [FakeResp(403)])
    assert nodes == [] and complete is False


def test_fetch_abbruch_mitten_im_katalog_ist_unvollstaendig(monkeypatch):
    """Review Focus 1: Seite 2 kommt mit 429 (nach Backoff) -> die bisherigen Knoten
    bleiben erhalten, aber der Durchlauf darf nicht als vollständig gelten."""
    nodes, complete, sent = run(monkeypatch, [page(2, "c1", True), FakeResp(429)])
    assert len(nodes) == 2 and complete is False
    assert len(sent) == 2  # nach dem Fehler wird nicht weitergeblättert


def test_fetch_errors_im_body_ist_unvollstaendig(monkeypatch):
    err = FakeResp(200, {"errors": [{"message": "boom"}], "data": None})
    nodes, complete, _ = run(monkeypatch, [page(1, "c1", True), err])
    assert len(nodes) == 1 and complete is False


def test_fetch_errors_neben_teildaten_ist_unvollstaendig(monkeypatch):
    p = page(2, "c1", False)
    p._body["errors"] = [{"message": "teilweise"}]
    nodes, complete, _ = run(monkeypatch, [p])
    assert complete is False


def test_fetch_kaputtes_json_oder_leeres_data_ist_unvollstaendig(monkeypatch):
    assert run(monkeypatch, [FakeResp(200, bad_json=True)])[1] is False
    assert run(monkeypatch, [FakeResp(200, {"data": None})])[1] is False
    assert run(monkeypatch, [FakeResp(200, {})])[1] is False


def test_fetch_netzwerkausnahme_ist_unvollstaendig(monkeypatch):
    nodes, complete, _ = run(monkeypatch, [page(1, "c1", True), OSError("Verbindung getrennt")])
    assert len(nodes) == 1 and complete is False


def test_fetch_weitere_seite_ohne_cursor_bricht_ab_statt_zu_schleifen(monkeypatch):
    nodes, complete, sent = run(monkeypatch, [page(1, None, True)])
    assert complete is False and len(sent) == 1


def test_fetch_wiederholter_cursor_bricht_ab(monkeypatch):
    nodes, complete, sent = run(monkeypatch, [page(1, "c1", True), page(1, "c1", True)])
    assert complete is False and len(sent) == 2


def test_fetch_leerer_katalog_ist_vollstaendig(monkeypatch):
    nodes, complete, _ = run(monkeypatch, [page(0, None, False)])
    assert nodes == [] and complete is True


def test_fetch_kante_ohne_node_ist_unvollstaendig_und_behaelt_die_uebrigen(monkeypatch):
    """Ein verschluckter Knoten würde den Titel später als 'nicht gefunden' erscheinen
    lassen und fälschlich den Nachweis-Stempel erlauben."""
    p = page(2, "c1", False)
    p._body["data"]["popularTitles"]["edges"].insert(1, {"node": None})
    nodes, complete, _ = run(monkeypatch, [p])
    assert complete is False
    assert len(nodes) == 2  # die vorhandenen Knoten gehen nicht verloren


def test_fetch_kante_ganz_ohne_node_schluessel_ist_unvollstaendig(monkeypatch):
    p = page(1, "c1", False)
    p._body["data"]["popularTitles"]["edges"].append({})
    nodes, complete, _ = run(monkeypatch, [p])
    assert complete is False and len(nodes) == 1


def test_fetch_vollstaendige_knoten_bleiben_complete(monkeypatch):
    """Gegenprobe gegen eine zu strenge Bedingung."""
    nodes, complete, _ = run(monkeypatch, [page(3, "c1", False)])
    assert complete is True and len(nodes) == 3


def test_fetch_max_pages_bricht_ab_und_ist_unvollstaendig(monkeypatch):
    monkeypatch.setattr(cat, "MAX_PAGES", 3)
    seiten = [page(1, f"c{i}", True) for i in range(10)]  # immer neue Cursor, nie Ende
    nodes, complete, sent = run(monkeypatch, seiten)
    assert complete is False
    assert len(sent) == 3 and len(nodes) == 3


# --- Instanz-Sperre ---------------------------------------------------------------

def test_instanz_sperre_sieht_beide_skripte(monkeypatch):
    """Die Sperre muss Katalog- UND Titelsuch-Lauf erfassen, egal unter welchem Pfad."""
    import re
    import subprocess
    calls = []

    def fake_run(cmd, **kw):
        calls.append(cmd)
        return subprocess.CompletedProcess(cmd, 0, stdout="", stderr="")
    monkeypatch.setattr(cat.jw.subprocess, "run", fake_run)
    cat.jw.other_instance_running()
    pattern = calls[0][-1]
    for cmdline in ("python3 src/scripts/justwatch-streaming.py --stale 150",
                    "python3 /tmp/justwatch-catalog.py --count-only",
                    "python3 src/scripts/justwatch-catalog.py"):
        assert re.search(pattern, cmdline), cmdline
    assert not re.search(pattern, "python3 -m pytest src/scripts/tests/test_catalog.py")


# --- Aufgabe 9: Zuordnung auf unsere Titel ------------------------------------

ANIME = [
    {"id": 1, "slug": "gensou-suikoden", "titles": ["", "", "Gensou Suikoden", "幻想水滸伝"], "year": 2026, "want": "SHOW"},
    {"id": 2, "slug": "one-piece", "titles": ["", "One Piece", "ONE PIECE", "ワンピース"], "year": 1999, "want": "SHOW"},
    {"id": 3, "slug": "shingeki-no-kyojin", "titles": ["", "Attack on Titan", "Shingeki no Kyojin", "進撃の巨人"], "year": 2013, "want": "SHOW"},
    # Fortsetzungsstaffel: darf von der Serie "Shingeki no Kyojin" nie getroffen werden.
    {"id": 4, "slug": "shingeki-no-kyojin-2nd-season", "titles": ["", "", "Shingeki no Kyojin 2nd Season", ""], "year": 2017, "want": "SHOW"},
    {"id": 5, "slug": "wotakoi", "titles": ["Wotakoi: Keine Chance für Otaku", "Wotakoi: Love is Hard for Otaku", "Wotaku ni Koi wa Muzukashii", ""], "year": 2018, "want": "SHOW"},
    {"id": 6, "slug": "kaiju-film", "titles": ["", "", "Kaijuu Movie", ""], "year": 2020, "want": "MOVIE"},
]


def _node(title, orig, year, otype="SHOW"):
    return {"title": title, "original_title": orig, "year": year, "object_type": otype, "offers": [], "seasons": []}


def _slug(parsed, anime=ANIME):
    m = cat.match_node(parsed, anime)
    return m["slug"] if m else None


def test_matcht_ueber_den_romaji_originaltitel():
    assert _slug(_node("Suikoden", "幻想水滸伝", 2026)) == "gensou-suikoden"


def test_matcht_attack_on_titan_ueber_den_romaji_originaltitel():
    assert _slug(_node("Attack on Titan", "Shingeki no Kyojin", 2013)) == "shingeki-no-kyojin"


def test_realserie_matcht_nicht_auf_den_anime():
    """Review Focus 4: Netflix-Realserie 'One Piece' 2023 gegen den Anime 1999."""
    assert _slug(_node("One Piece", "One Piece", 2023)) is None


def test_gleicher_titel_anderes_werk_liang_shan_po():
    """Review Focus 4: 'Suikoden' 1973 (Rebellen vom Liang Shan Po) gegen Gensou Suikoden 2026.
    Kein exakter Treffer (suikoden != gensousuikoden) und 53 Jahre Abstand."""
    assert _slug(_node("Die Rebellen vom Liang Shan Po", "Suikoden", 1973)) is None


def test_film_matcht_keine_serie():
    assert _slug(_node("Attack on Titan", "Shingeki no Kyojin", 2013, "MOVIE")) is None


def test_serie_matcht_keinen_film():
    assert _slug(_node("Kaijuu Movie", "Kaijuu Movie", 2020, "SHOW")) is None
    assert _slug(_node("Kaijuu Movie", "Kaijuu Movie", 2020, "MOVIE")) == "kaiju-film"


def test_fortsetzungsstaffel_wird_nicht_von_der_serie_getroffen():
    """Keine Staffel-Zuordnung: die Serie geht auf den Basistitel, nie auf '2nd Season'."""
    assert _slug(_node("Attack on Titan", "Shingeki no Kyojin", 2013)) == "shingeki-no-kyojin"
    nur_staffel = [a for a in ANIME if a["slug"] == "shingeki-no-kyojin-2nd-season"]
    assert _slug(_node("Attack on Titan", "Shingeki no Kyojin", 2013), nur_staffel) is None


def test_jahresabstand_zwei_bis_vier_fordert_exakten_titel():
    # exakt, 3 Jahre Abstand: noch erlaubt
    assert _slug(_node("Attack on Titan", "Shingeki no Kyojin", 2016)) == "shingeki-no-kyojin"
    # Basistitel-Treffer (nur Untertitel verschieden) trägt bei Abstand 3 nicht mehr
    assert _slug(_node("Wotakoi: Anders", "Wotakoi: Other Subtitle", 2021)) is None


def test_ab_fuenf_jahren_abstand_kein_match_auch_bei_exaktem_titel():
    assert _slug(_node("Attack on Titan", "Shingeki no Kyojin", 2018)) is None
    assert _slug(_node("Attack on Titan", "Shingeki no Kyojin", 2008)) is None
    assert _slug(_node("Attack on Titan", "Shingeki no Kyojin", 2017)) == "shingeki-no-kyojin"  # 4 Jahre


def test_basistitel_mit_uebersetztem_untertitel_bei_gleichem_jahr():
    assert _slug(_node("Wotakoi: Love is Hard", "Wotakoi: Irgendwas", 2018)) == "wotakoi"


def test_basistitel_ohne_untertitel_auf_beiden_seiten_reicht_nicht():
    """'Wotakoi' (ohne Untertitel) darf nicht auf 'Wotakoi: …' passen — das wäre die
    Hyouge-Mono-Klasse. Kein exakter Treffer, kein Untertitel-Paar -> kein Match."""
    assert _slug(_node("Wotakoi", "Wotakoi", 2018)) is None


def test_kurzer_basistitel_mit_untertitel_ist_zu_generisch():
    """Basis 'mono' (4 Zeichen) trägt kein Untertitel-Paar, auch bei gleichem Jahr."""
    mono = [{"id": 20, "slug": "mono-a", "titles": ["", "", "Mono: Der Anfang", ""], "year": 2020, "want": "SHOW"}]
    assert _slug(_node("Mono: Ganz Anders", "Mono: Something Else", 2020), mono) is None


def test_jahr_null_von_justwatch_gilt_als_unbekannt_nicht_als_jahr_null():
    """One Piece S3-S17 und manche Serien tragen originalReleaseYear 0."""
    assert _slug(_node("One Piece", "One Piece", 0)) == "one-piece"


def test_gleicher_score_bei_mehreren_kandidaten_ist_kein_match():
    doppelt = [
        {"id": 10, "slug": "foo-a", "titles": ["", "", "Foobar Story", ""], "year": 2020, "want": "SHOW"},
        {"id": 11, "slug": "foo-b", "titles": ["", "", "Foobar Story", ""], "year": 2020, "want": "SHOW"},
    ]
    assert _slug(_node("Foobar Story", "Foobar Story", 2020), doppelt) is None


def test_jahr_entscheidet_zwischen_zwei_gleichnamigen_titeln():
    zwei = [
        {"id": 10, "slug": "foo-alt", "titles": ["", "", "Foobar Story", ""], "year": 2001, "want": "SHOW"},
        {"id": 11, "slug": "foo-neu", "titles": ["", "", "Foobar Story", ""], "year": 2020, "want": "SHOW"},
    ]
    assert _slug(_node("Foobar Story", "Foobar Story", 2020), zwei) == "foo-neu"


def test_unbekanntes_jahr_haelt_den_exakten_treffer_nicht_auf_aber_verliert_gegen_belegten():
    assert _slug(_node("Attack on Titan", "Shingeki no Kyojin", 0)) == "shingeki-no-kyojin"
    assert _slug(_node("Attack on Titan", "Shingeki no Kyojin", None)) == "shingeki-no-kyojin"
    zwei = [
        {"id": 10, "slug": "foo-ohne-jahr", "titles": ["", "", "Foobar Story", ""], "year": None, "want": "SHOW"},
        {"id": 11, "slug": "foo-2020", "titles": ["", "", "Foobar Story", ""], "year": 2020, "want": "SHOW"},
    ]
    assert _slug(_node("Foobar Story", "Foobar Story", 2020), zwei) == "foo-2020"


def test_teilstring_titel_matcht_nicht():
    """'Mono' in 'Hyouge Mono' war der Fehlschlag der Alt-Heuristik."""
    mono = [{"id": 20, "slug": "mono", "titles": ["", "", "Mono", ""], "year": 2020, "want": "SHOW"}]
    assert _slug(_node("Hyouge Mono", "Hyouge Mono", 2020), mono) is None
    assert _slug(_node("Hyouge Mono", "Hyouge Mono", 2020), ANIME) is None


def test_leere_titel_matchen_nichts():
    assert _slug(_node(None, None, 2013)) is None
    leer = [{"id": 30, "slug": "leer", "titles": ["", "", "", ""], "year": 2013, "want": "SHOW"}]
    assert _slug(_node("", "", 2013), leer) is None


def test_dedupe_bevorzugt_den_direktanbieter_link():
    """Review Focus 3: Crunchyroll und Crunchyroll Amazon Channel sind ein Anbieter."""
    offers = [
        {"provider": "crunchyroll", "monetization": "flatrate", "url": "https://watch.amazon.de/x", "is_channel": True, "audio": {"de"}, "subs": set()},
        {"provider": "crunchyroll", "monetization": "flatrate", "url": "https://crunchyroll.com/x", "is_channel": False, "audio": {"ja"}, "subs": {"de"}},
    ]
    out = cat.dedupe_offers(offers)
    assert len(out) == 1
    assert out[0]["url"] == "https://crunchyroll.com/x"
    assert out[0]["audio"] == {"de", "ja"}
    assert out[0]["subs"] == {"de"}


def test_dedupe_direktlink_gewinnt_unabhaengig_von_der_reihenfolge_und_behaelt_sein_enddatum():
    d = {"provider": "adn", "monetization": "flatrate", "url": "https://adn.example/x", "is_channel": False,
         "audio": ["ja"], "subs": [], "available_to": "2027-01-01"}
    c = {"provider": "adn", "monetization": "flatrate", "url": "https://amazon.example/x", "is_channel": True,
         "audio": ["de"], "subs": [], "available_to": "2026-12-01"}
    for offers in ([d, c], [c, d]):
        out = cat.dedupe_offers(offers)
        assert len(out) == 1
        assert out[0]["url"] == "https://adn.example/x"
        assert out[0]["available_to"] == "2027-01-01"
        assert out[0]["audio"] == {"de", "ja"}


def test_dedupe_channel_ist_nur_rueckfall():
    c = {"provider": "adn", "monetization": "flatrate", "url": "https://amazon.example/x", "is_channel": True, "audio": [], "subs": []}
    out = cat.dedupe_offers([c])
    assert [o["url"] for o in out] == ["https://amazon.example/x"]


def test_dedupe_trennt_monetarisierung_und_anbieter():
    mk = lambda p, m, u: {"provider": p, "monetization": m, "url": u, "is_channel": False, "audio": [], "subs": []}
    out = cat.dedupe_offers([mk("netflix", "flatrate", "u1"), mk("netflix", "ads", "u2"), mk("joyn", "flatrate", "u3")])
    assert {(o["provider"], o["monetization"]) for o in out} == {("netflix", "flatrate"), ("netflix", "ads"), ("joyn", "flatrate")}


def test_dedupe_verwirft_ohne_deeplink_und_veraendert_die_eingabe_nicht():
    ohne = {"provider": "joyn", "monetization": "flatrate", "url": None, "is_channel": False, "audio": ["de"], "subs": []}
    mit = {"provider": "netflix", "monetization": "flatrate", "url": "u", "is_channel": False, "audio": ["de"], "subs": []}
    out = cat.dedupe_offers([ohne, mit])
    assert [o["provider"] for o in out] == ["netflix"]
    assert mit["audio"] == ["de"]  # Eingabe unverändert (Liste, nicht Set)
