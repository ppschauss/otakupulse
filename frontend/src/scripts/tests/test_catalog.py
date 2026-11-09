import pytest

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


def test_exakt_gleicher_titel_aber_53_jahre_abstand_trifft_die_hartgrenze():
    """Hier ist der Titel wirklich gleich ('Suikoden'); nur die Jahres-Hartgrenze rettet."""
    exakt = [{"id": 40, "slug": "suikoden-2026", "titles": ["", "", "Suikoden", ""], "year": 2026, "want": "SHOW"}]
    assert _slug(_node("Die Rebellen vom Liang Shan Po", "Suikoden", 1973), exakt) is None
    assert _slug(_node("Suikoden", "Suikoden", 2026), exakt) == "suikoden-2026"


def test_fortsetzung_mit_untertitel_trifft_nicht_unseren_basistitel():
    """Unser 'Foobar Story' (ohne Untertitel) darf nicht auf den Knoten
    'Foobar Story: Part 2' passen, auch nicht im selben Jahr."""
    unser = [{"id": 41, "slug": "foobar", "titles": ["", "", "Foobar Story", ""], "year": 2020, "want": "SHOW"}]
    assert _slug(_node("Foobar Story: Part 2", "Foobar Story: Part 2", 2020), unser) is None


def test_jahresabzug_laesst_exakten_treffer_bei_3_jahren_gegen_basistitel_im_selben_jahr_verlieren():
    """A: exakter Titel, 3 Jahre Abstand (1.0 - 0.15 = 0.85). B: Basistitel-Treffer im
    selben Jahr (0.92 + 0.03 = 0.95). B muss gewinnen; ohne Abzug gewänne A mit 1.0."""
    zwei = [
        {"id": 42, "slug": "foobar-a", "titles": ["", "", "Foobar Story", ""], "year": 2020, "want": "SHOW"},
        {"id": 43, "slug": "foobar-b", "titles": ["", "", "Foobar Story: Beginning", ""], "year": 2023, "want": "SHOW"},
    ]
    assert _slug(_node("Foobar Story: Der Anfang", "Foobar Story", 2023), zwei) == "foobar-b"


def test_mindestlaenge_der_basis_grenze_fuenf_nein_sechs_ja():
    fuenf = [{"id": 44, "slug": "b5", "titles": ["", "", "Abcde: Eins", ""], "year": 2020, "want": "SHOW"}]
    sechs = [{"id": 45, "slug": "b6", "titles": ["", "", "Abcdef: Eins", ""], "year": 2020, "want": "SHOW"}]
    assert _slug(_node("Abcde: Zwei", "Abcde: Zwei", 2020), fuenf) is None
    assert _slug(_node("Abcdef: Zwei", "Abcdef: Zwei", 2020), sechs) == "b6"


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


# --- Aufgabe 10: Vertrauensstufe ---------------------------------------------------

def test_staffel_mit_eigenem_angebot_ist_belegt():
    assert cat.confidence_for(["crunchyroll"], ["crunchyroll"], "crunchyroll", "FINISHED", 2023, 2026) == "confirmed"


def test_leere_staffel_bei_laufendem_titel_ist_unbestaetigt():
    """Regressionsfall Returner S2: Serie bei Crunchyroll, Staffel leer, Titel laeuft."""
    assert cat.confidence_for([], ["crunchyroll"], "crunchyroll", "RELEASING", 2026, 2026) == "unconfirmed"


def test_leere_staffel_bei_aktuellem_jahrgang_ist_unbestaetigt():
    assert cat.confidence_for([], ["crunchyroll"], "crunchyroll", "FINISHED", 2026, 2026) == "unconfirmed"


def test_leere_staffel_bei_altem_titel_wird_nicht_uebernommen():
    """Entscheidung 24, engste Lesart: alte Staffeln bleiben leer."""
    assert cat.confidence_for([], ["crunchyroll"], "crunchyroll", "FINISHED", 2014, 2026) is None


def test_confidence_for_ist_die_regel_des_nachbarskripts():
    """Eine Regel, eine Implementierung: definiert in justwatch-streaming.py (sonst
    Importzyklus), hier nur re-exportiert. Aufgabe 11 nutzt sie von dort."""
    assert cat.confidence_for is cat.jw.confidence_for


def test_anbieter_der_nirgends_vorkommt_ergibt_keine_zeile():
    assert cat.confidence_for([], [], "crunchyroll", "RELEASING", 2026, 2026) is None


def test_unbekanntes_jahr_erbt_nicht():
    """Ohne Jahr und ohne RELEASING fehlt die Begruendung fuer die Vererbung."""
    assert cat.confidence_for([], ["crunchyroll"], "crunchyroll", "FINISHED", None, 2026) is None


def test_belegtes_staffel_angebot_gilt_auch_fuer_alte_titel():
    """Die Einschraenkung aus Entscheidung 24 gilt NUR fuer die Vererbung."""
    assert cat.confidence_for(["adn"], [], "adn", "FINISHED", 1998, 2026) == "confirmed"


# --- Aufgabe 10: Nachweis (streaming_verified_at) ---------------------------------

def test_verified_at_wird_nur_nach_vollstaendigem_durchlauf_gesetzt():
    """Review Focus 1: ein Abbruch darf den Katalog nicht als geprueft stempeln."""
    assert cat.verified_sql([1, 2, 3], "2026-11-09T00:00:00Z", complete=False) == []
    assert len(cat.verified_sql([1, 2, 3], "2026-11-09T00:00:00Z", complete=True)) == 1


def test_verified_sql_stempelt_genau_die_uebergebenen_ids():
    sql = cat.verified_sql([1, 2, 3], "2026-11-09T00:00:00Z", complete=True)[0]
    assert "UPDATE anime SET streaming_verified_at = '2026-11-09T00:00:00Z'" in sql
    assert "WHERE id IN (1,2,3)" in sql
    assert "is_hentai" not in sql  # Review Focus 5: kein Sonderweg im Schreibweg


def test_verified_sql_ohne_titel_schreibt_nichts():
    assert cat.verified_sql([], "2026-11-09T00:00:00Z", complete=True) == []


def test_verified_sql_ist_im_zweifel_still():
    """Standardwert: ohne ausdrueckliches complete wird nicht gestempelt."""
    assert cat.verified_sql([1], "2026-11-09T00:00:00Z") == []


def test_durchlauf_ist_nur_vollstaendig_wenn_jedes_paket_vollstaendig_war():
    alle = list(cat.PACKAGES)
    assert cat.run_complete([True, True], alle, 1234) is True
    assert cat.run_complete([True, False, True], alle, 1234) is False


def test_durchlauf_ohne_abruf_ist_nicht_vollstaendig():
    """Leere Flag-Liste: es wurde nichts geblaettert, also ist nichts belegt."""
    assert cat.run_complete([], list(cat.PACKAGES), 1234) is False


def test_leerer_katalog_belegt_nichts_obwohl_der_abruf_vollstaendig_war():
    """Kein Netzwerkfehler (der setzt complete=False), sondern eine stille
    Semantikaenderung: faellt das Genre `ani` weg oder wird ein shortName umbenannt,
    antwortet JustWatch mit HTTP 200 und `edges: []`. Der Abruf ist dann voellig
    korrekt 'vollstaendig geblaettert' — und wuerde alle 11.061 Titel als 'nirgends im
    Abo- oder Gratis-Stream' stempeln. Ab Aufgabe 15 laeuft der Sweep per Cron,
    unbeaufsichtigt."""
    assert cat.run_complete([True, True], list(cat.PACKAGES), 0) is False


def test_teilmenge_der_pakete_belegt_nichts():
    """Der Stempel heisst 'ueber ALLE gemappten Anbieter nachgesehen' — mit
    --packages cru ist das falsch, auch wenn der Abruf selbst vollstaendig war."""
    assert cat.run_complete([True, True], ["cru"], 1234) is False


# --- Aufgabe 10: Schreiben (build_catalog_sql) ------------------------------------

NOW = "2026-11-09T00:00:00Z"


def _offer(provider="crunchyroll", monetization="flatrate", **kw):
    o = {"provider": provider, "monetization": monetization, "url": "https://crunchyroll.com/x",
         "audio": "de", "subs": "", "seasons": 1, "episodes": 12, "available_to": None,
         "confidence": "confirmed"}
    o.update(kw)
    return o


def test_entdeckungslauf_schreibt_kein_first_seen_at():
    """Sonst ist der Katalog 30 Tage lang 'Neu auf <Anbieter>' (Anti-Ziel)."""
    a = {"id": 7, "offers": {}}
    offers = [{"provider": "crunchyroll", "monetization": "flatrate", "url": "https://crunchyroll.com/x",
               "audio": "de", "subs": "", "seasons": 1, "episodes": 12, "available_to": None,
               "confidence": "confirmed"}]
    sql = " ".join(cat.build_catalog_sql(a, offers, "2026-11-09T00:00:00Z", discovery=True))
    assert "NULL" in sql
    sql2 = " ".join(cat.build_catalog_sql(a, offers, "2026-11-09T00:00:00Z", discovery=False))
    assert "2026-11-09T00:00:00Z" in sql2


def test_entdeckungslauf_schreibt_first_seen_at_genau_als_null():
    """Praeziser als der Brieftest: NULL steht an der Stelle von first_seen_at,
    last_seen_at traegt trotzdem den Zeitstempel des Laufs."""
    sql = " ".join(cat.build_catalog_sql({"id": 7, "offers": {}}, [_offer()], NOW, discovery=True))
    assert f"NULL, NULL, '{NOW}', 'confirmed', 'justwatch');" in sql


def test_normaler_lauf_schreibt_den_zeitstempel_als_first_seen_at():
    sql = " ".join(cat.build_catalog_sql({"id": 7, "offers": {}}, [_offer()], NOW, discovery=False))
    assert f"NULL, '{NOW}', '{NOW}', 'confirmed', 'justwatch');" in sql


def test_first_seen_at_bleibt_fuer_bekannte_paare_erhalten():
    a = {"id": 7, "offers": {("crunchyroll", "flatrate"): "2025-01-01T00:00:00Z"}}
    sql = " ".join(cat.build_catalog_sql(a, [_offer()], NOW, discovery=False))
    assert f"NULL, '2025-01-01T00:00:00Z', '{NOW}', 'confirmed', 'justwatch');" in sql


def test_entdeckungslauf_laesst_jedes_neue_paar_leer():
    """Im Entdeckungslauf ist 'echter Neuzugang' von 'wir haben nie nachgesehen' nicht
    unterscheidbar — also NULL fuer JEDES neue Paar, auch bei Titeln mit Bestand."""
    a = {"id": 7, "offers": {("netflix", "flatrate"): "2025-01-01T00:00:00Z"}}
    sql = " ".join(cat.build_catalog_sql(a, [_offer()], NOW, discovery=True))
    assert f"NULL, NULL, '{NOW}', 'confirmed', 'justwatch');" in sql


def test_entdeckungslauf_schreibt_auch_bei_kauf_leih_bestand_kein_first_seen_at():
    """Der Fall, der die Bedingung `not known` falsch machte: 113 Titel im Bestand
    haben NUR Kauf/Leih-Angebote. Sie gelten damit als 'Titel mit Bestand', obwohl der
    Sweep ihre Abo-Angebote erstmals sieht — mit `now()` waeren sie 30 Tage lang
    'Neu auf <Anbieter>' (Anti-Ziel), und `ECHT_NEU` greift nicht, weil es auf
    `first_seen_at IS NULL` prueft. --discovery laeuft genau einmal."""
    a = {"id": 7, "offers": {("amazon-video", "buy"): "2025-01-01T00:00:00Z"}}
    sql = " ".join(cat.build_catalog_sql(a, [_offer()], NOW, discovery=True))
    assert f"NULL, NULL, '{NOW}', 'confirmed', 'justwatch');" in sql


def test_entdeckungslauf_behaelt_gespeicherte_stempel():
    """Bestehende Paare behalten ihren Stempel — NULL gilt nur fuer neue Paare."""
    a = {"id": 7, "offers": {("crunchyroll", "flatrate"): "2025-01-01T00:00:00Z"}}
    sql = " ".join(cat.build_catalog_sql(a, [_offer()], NOW, discovery=True))
    assert f"NULL, '2025-01-01T00:00:00Z', '{NOW}', 'confirmed', 'justwatch');" in sql


def test_delete_ist_auf_die_geblaetterten_monetarisierungen_eingeschraenkt():
    """DIE Zeile, an der 1.400 Angebote haengen: der Katalog-Abruf blaettert nur
    FLATRATE/ADS/FREE, Kauf- und Leih-Angebote sieht er nie. Gemessen am 2026-11-09:
    amazon-video 952, magenta-tv 223, rakuten-tv 126, sky-store 99 Kauf/Leih-Zeilen —
    ein autoritatives DELETE ueber alle Monetarisierungen wuerde sie loeschen und
    nie wieder einfuegen."""
    sql = cat.build_catalog_sql({"id": 7, "offers": {}}, [], NOW, discovery=False)[0]
    assert sql.startswith("DELETE FROM anime_streaming_offers WHERE _parent_id = 7 ")
    assert "monetization IN ('flatrate','ads','free')" in sql
    assert "'buy'" not in sql and "'rent'" not in sql


def test_das_delete_haengt_an_den_wirklich_geblaetterten_monetarisierungen():
    """Die Einschraenkung wird aus CATALOG_MONETIZATION abgeleitet, nicht getippt:
    wer den Abruf erweitert, erweitert das DELETE mit."""
    erwartet = tuple(cat.MONETIZATION[m] for m in cat.CATALOG_MONETIZATION)
    assert cat.SWEEP_MONETIZATION == erwartet
    sql = cat.build_catalog_sql({"id": 7, "offers": {}}, [], NOW, discovery=False)[0]
    assert "monetization IN (" + ",".join(f"'{m}'" for m in erwartet) + ")" in sql


def test_kauf_und_leih_angebote_werden_nicht_eingefuegt():
    """Der Sweep loescht sie nicht — dann darf er sie auch nicht einfuegen, sonst
    stehen zwei Zeilen fuer dasselbe (Anbieter, Monetarisierung)."""
    offers = [_offer(provider="amazon-video", monetization="buy"),
              _offer(provider="rakuten-tv", monetization="rent")]
    sql = " ".join(cat.build_catalog_sql({"id": 7, "offers": {}}, offers, NOW, discovery=False))
    assert "INSERT INTO anime_streaming_offers" not in sql
    assert "amazon-video" not in sql and "rakuten-tv" not in sql


def test_verworfene_angebote_bleiben_erhalten():
    """Review Focus 2 / Entscheidung 21: das Veto ueberlebt den Lauf."""
    sql = " ".join(cat.build_catalog_sql({"id": 7, "offers": {}}, [], "2026-11-09T00:00:00Z", discovery=False))
    assert "source" in sql and "manual" in sql


def test_delete_nimmt_handarbeit_aus():
    """Entscheidung 8: `source='manual'` gewinnt gegen den Sync."""
    sql = cat.build_catalog_sql({"id": 7, "offers": {}}, [], NOW, discovery=False)[0]
    assert "source IS DISTINCT FROM 'manual'" in sql


def test_veto_zeile_verhindert_das_wiedereinfuegen():
    """Entscheidung 21: pro Zeile, nicht pro Titel — das zweite Paar kommt durch."""
    a = {"id": 7, "offers": {}, "rejected": {("crunchyroll", "flatrate")}}
    offers = [_offer(), _offer(provider="netflix")]
    sql = " ".join(cat.build_catalog_sql(a, offers, NOW, discovery=False))
    assert "'crunchyroll'" not in sql
    assert "'netflix'" in sql


def test_veto_gilt_nur_fuer_sein_eigenes_paar():
    a = {"id": 7, "offers": {}, "rejected": {("crunchyroll", "ads")}}
    sql = " ".join(cat.build_catalog_sql(a, [_offer(monetization="flatrate")], NOW, discovery=False))
    assert "'crunchyroll', 'flatrate'" in sql


def test_paar_mit_handarbeitszeile_wird_nicht_eingefuegt():
    """Fix-Runde 1: die Version des Redakteurs gewinnt, keine zweite Zeile daneben."""
    a = {"id": 7, "offers": {("crunchyroll", "flatrate"): None}, "manual": {("crunchyroll", "flatrate")}}
    stmts = cat.build_catalog_sql(a, [_offer(), _offer(provider="netflix")], NOW, discovery=False)
    ins = [s for s in stmts if s.startswith("INSERT INTO anime_streaming_offers")]
    assert len(ins) == 1 and "'netflix'" in ins[0] and "'crunchyroll'" not in ins[0]
    # der Handarbeits-Anbieter bleibt im Filter-Index
    assert "'crunchyroll'" in [s for s in stmts if s.startswith("INSERT INTO anime_streaming_providers")][0]


def test_confidence_for_erbt_nicht_an_ein_gepflegtes_objekt():
    """Fix-Runde 1: traegt das gematchte Objekt irgendein Angebot, ist das Fehlen eines
    Anbieters eine Aussage — auch bei laufendem Titel."""
    assert cat.confidence_for(["netflix"], ["netflix", "crunchyroll"], "crunchyroll", "RELEASING", 2026, 2026) is None
    assert cat.confidence_for([], ["crunchyroll"], "crunchyroll", "RELEASING", 2026, 2026) == "unconfirmed"


def test_anderes_paar_desselben_anbieters_wird_trotz_handarbeit_eingefuegt():
    a = {"id": 7, "offers": {("crunchyroll", "flatrate"): None}, "manual": {("crunchyroll", "flatrate")}}
    stmts = cat.build_catalog_sql(a, [_offer(monetization="ads")], NOW, discovery=False)
    assert any("'crunchyroll', 'ads'" in s for s in stmts if s.startswith("INSERT INTO anime_streaming_offers"))


def test_order_haengt_sich_an_den_bestand_an():
    """Das DELETE laesst Kauf/Leih- und Handarbeits-Zeilen stehen; _order darf
    deshalb nicht wieder bei 1 anfangen."""
    sql = " ".join(cat.build_catalog_sql({"id": 7, "offers": {}}, [_offer()], NOW, discovery=False))
    assert "COALESCE((SELECT max(_order) FROM anime_streaming_offers WHERE _parent_id = 7), 0) + 1" in sql


def test_insert_traegt_vertrauensstufe_und_herkunft():
    sql = " ".join(cat.build_catalog_sql({"id": 7, "offers": {}},
                                         [_offer(confidence="unconfirmed")], NOW, discovery=False))
    assert "first_seen_at,last_seen_at,confidence,source) VALUES" in sql
    assert "'unconfirmed', 'justwatch');" in sql


def test_herkunft_kann_der_aufrufer_setzen():
    """Aufgabe 14 schreibt Crunchyroll-Direktbelege ueber dieselbe Funktion."""
    sql = " ".join(cat.build_catalog_sql({"id": 7, "offers": {}},
                                         [_offer(source="crunchyroll")], NOW, discovery=False))
    assert "'confirmed', 'crunchyroll');" in sql


def test_sprachmengen_werden_zu_sortierten_komma_listen():
    """`dedupe_offers` liefert Mengen; die Datenbank will Komma-Strings."""
    sql = " ".join(cat.build_catalog_sql({"id": 7, "offers": {}},
                                         [_offer(audio={"ja", "de"}, subs={"de"})], NOW, discovery=False))
    assert "'de,ja', 'de'" in sql


def test_anbieter_index_zaehlt_unbestaetigte_mit():
    """Entscheidung 4: unbestaetigte Angebote zaehlen in den Plattform-Listen voll mit."""
    sql = " ".join(cat.build_catalog_sql({"id": 7, "offers": {}},
                                         [_offer(confidence="unconfirmed", audio="", subs="")], NOW, discovery=False))
    assert "INSERT INTO anime_streaming_providers" in sql
    assert "'crunchyroll'::enum_anime_streaming_providers" in sql


def test_sprachen_nur_aus_belegten_angeboten():
    """Entscheidung 7: was wir nicht belegen, behaupten wir nicht im Detail."""
    sql = " ".join(cat.build_catalog_sql({"id": 7, "offers": {}},
                                         [_offer(confidence="unconfirmed", audio="de", subs="de")], NOW, discovery=False))
    assert "anime_available_languages" not in sql


def test_sprachen_werden_aus_belegten_angeboten_nachgetragen():
    sql = " ".join(cat.build_catalog_sql({"id": 7, "offers": {}},
                                         [_offer(audio="de,ja", subs="de")], NOW, discovery=False))
    assert "'de-dub'::enum_anime_available_languages" in sql
    assert "'ja'::enum_anime_available_languages" in sql
    assert "'de-sub'::enum_anime_available_languages" in sql


def test_handarbeit_bleibt_im_anbieter_index():
    """Der Anbieter-Index wird neu gebaut; eine manuelle Zeile bleibt stehen, also
    muss ihr Anbieter im Index bleiben — sonst waere die Handarbeit aus allen
    Filtern und Plattform-Listen verschwunden (Entscheidung 8)."""
    a = {"id": 7, "offers": {("adn", "flatrate"): None}, "manual": {("adn", "flatrate")}}
    sql = " ".join(cat.build_catalog_sql(a, [_offer()], NOW, discovery=False))
    assert "'adn'::enum_anime_streaming_providers" in sql
    assert "INSERT INTO anime_streaming_offers" in sql and "'adn', 'flatrate'" not in sql


def test_leerer_treffer_loescht_den_anbieter_index():
    """Review Focus 2: ein echtes Lizenzende muss den Filter-Index raeumen."""
    a = {"id": 7, "offers": {("crunchyroll", "flatrate"): NOW}}
    sql = " ".join(cat.build_catalog_sql(a, [], NOW, discovery=False))
    assert "DELETE FROM anime_streaming_providers WHERE parent_id = 7;" in sql
    assert "INSERT INTO anime_streaming_providers" not in sql


def test_hentai_titel_bekommen_offers_aber_keinen_sonderweg():
    """Review Focus 5: der Schutz sitzt in den Listen-Abfragen (a.is_hentai IS NOT TRUE),
    nicht im Schreibweg — der Schreibweg darf ihn also nicht umgehen wollen und
    auch nicht heimlich aufheben."""
    a = {"id": 9, "offers": {}, "is_hentai": True}
    offers = [{"provider": "crunchyroll", "monetization": "flatrate", "url": "https://crunchyroll.com/x",
               "audio": "", "subs": "", "seasons": None, "episodes": None, "available_to": None,
               "confidence": "confirmed"}]
    sql = " ".join(cat.build_catalog_sql(a, offers, "2026-11-09T00:00:00Z", discovery=False))
    assert "is_hentai" not in sql


# --- Aufgabe 10: Angebotszeilen fuer den gematchten Titel -------------------------
#
# `match_node` ordnet einen Katalogknoten (eine ganze Serie) genau EINEM unserer
# Titel zu; eine Staffel-Zuordnung gibt es bewusst nicht. Das gematchte Objekt ist
# also der Knoten selbst — Angebote an ihm sind belegt, Angebote nur an Staffeln
# werden in der engsten Lesart (Entscheidung 24) vererbt.

def _jw_offer(clear="Crunchyroll", monet="FLATRATE", url="https://crunchyroll.com/x", count=None,
              audio=("ja",), subs=("de",)):
    return {"monetizationType": monet, "standardWebURL": url, "package": {"clearName": clear},
            "audioLanguages": list(audio), "subtitleLanguages": list(subs), "elementCount": count}


def test_eigenes_angebot_am_knoten_ist_belegt_mit_staffel_und_episodenzahl():
    """elementCount am Serien-Angebot = Staffeln beim Anbieter, elementCount am
    Staffel-Angebot = Episoden (ueber die Staffeln summiert) — wie aggregate_offers."""
    parsed = cat.parse_node({
        "objectType": "SHOW",
        "content": {"title": "A", "originalTitle": "A", "originalReleaseYear": 2013},
        "offers": [_jw_offer(count=2)],
        "seasons": [
            {"content": {"title": "S1", "seasonNumber": 1, "originalReleaseYear": 2013},
             "offers": [_jw_offer(count=12, url="https://crunchyroll.com/s1")]},
            {"content": {"title": "S2", "seasonNumber": 2, "originalReleaseYear": 2014},
             "offers": [_jw_offer(count=13, url="https://crunchyroll.com/s2")]},
        ]})
    rows = cat.offers_for_title(parsed, status="FINISHED", year=2013, current_year=2026)
    assert len(rows) == 1
    o = rows[0]
    assert (o["provider"], o["monetization"], o["confidence"]) == ("crunchyroll", "flatrate", "confirmed")
    assert o["url"] == "https://crunchyroll.com/x"  # der Serien-Deep-Link
    assert (o["seasons"], o["episodes"]) == (2, 25)
    assert (o["audio"], o["subs"]) == ("ja", "de")


def test_film_traegt_keine_staffel_oder_episodenzahl():
    parsed = cat.parse_node({
        "objectType": "MOVIE",
        "content": {"title": "A", "originalTitle": "A", "originalReleaseYear": 2013},
        "offers": [_jw_offer(count=1)], "seasons": []})
    o = cat.offers_for_title(parsed, status="FINISHED", year=2013, current_year=2026)[0]
    assert o["seasons"] is None and o["episodes"] is None


def test_nur_staffel_angebot_wird_bei_laufendem_titel_vererbt():
    """Entscheidung 24: der Anbieter haengt nur an einer Staffel, das gematchte
    Objekt traegt ihn nicht — bei einem laufenden Titel wird er uebernommen,
    aber als unbestaetigt, mit flatrate und ohne Sprach- oder Episodenangaben."""
    parsed = cat.parse_node({
        "objectType": "SHOW",
        "content": {"title": "A", "originalTitle": "A", "originalReleaseYear": 2026},
        "offers": [],
        "seasons": [{"content": {"title": "S1", "seasonNumber": 1, "originalReleaseYear": 2026},
                     "offers": [_jw_offer(count=12, url="https://crunchyroll.com/s1", monet="FREE")]}]})
    rows = cat.offers_for_title(parsed, status="RELEASING", year=2026, current_year=2026)
    assert len(rows) == 1
    o = rows[0]
    assert (o["provider"], o["monetization"], o["confidence"]) == ("crunchyroll", "flatrate", "unconfirmed")
    assert o["url"] == "https://crunchyroll.com/s1"
    assert (o["audio"], o["subs"], o["seasons"], o["episodes"]) == ("", "", None, None)


def test_nur_staffel_angebot_wird_bei_altem_titel_nicht_vererbt():
    parsed = cat.parse_node({
        "objectType": "SHOW",
        "content": {"title": "A", "originalTitle": "A", "originalReleaseYear": 2010},
        "offers": [],
        "seasons": [{"content": {"title": "S1", "seasonNumber": 1, "originalReleaseYear": 2010},
                     "offers": [_jw_offer(count=12)]}]})
    assert cat.offers_for_title(parsed, status="FINISHED", year=2010, current_year=2026) == []


def test_kauf_und_leih_angebote_am_knoten_werden_nicht_zur_zeile():
    """Der Abruf blaettert sie nicht, das DELETE raeumt sie nicht — der Sweep laesst
    sie deshalb vollstaendig in Ruhe (1.400 Zeilen im Bestand)."""
    parsed = cat.parse_node({
        "objectType": "SHOW",
        "content": {"title": "A", "originalTitle": "A", "originalReleaseYear": 2013},
        "offers": [_jw_offer(clear="Amazon Video", monet="BUY", url="https://amazon.de/x"),
                   _jw_offer(clear="MagentaTV", monet="RENT", url="https://magenta.de/x")],
        "seasons": []})
    assert cat.offers_for_title(parsed, status="FINISHED", year=2013, current_year=2026) == []


def test_kauf_angebot_an_einer_staffel_wird_nicht_als_abo_vererbt():
    """Sonst wuerde aus einem Leih-Angebot ein geerbtes 'flatrate'."""
    parsed = cat.parse_node({
        "objectType": "SHOW",
        "content": {"title": "A", "originalTitle": "A", "originalReleaseYear": 2026},
        "offers": [],
        "seasons": [{"content": {"title": "S1", "seasonNumber": 1, "originalReleaseYear": 2026},
                     "offers": [_jw_offer(clear="Amazon Video", monet="BUY", url="https://amazon.de/x")]}]})
    assert cat.offers_for_title(parsed, status="RELEASING", year=2026, current_year=2026) == []


def test_doppelter_anbieter_wird_ueber_dedupe_offers_zusammengefuehrt():
    """Review Focus 3: Direktanbieter + Amazon-Channel ergeben genau eine Zeile mit
    dem Direktlink und den vereinigten Sprachen — die Regel aus Aufgabe 9."""
    parsed = cat.parse_node({
        "objectType": "SHOW",
        "content": {"title": "A", "originalTitle": "A", "originalReleaseYear": 2013},
        "offers": [_jw_offer(clear="Crunchyroll Amazon Channel", url="https://watch.amazon.de/x",
                             audio=("de",), subs=()),
                   _jw_offer(clear="Crunchyroll", url="https://crunchyroll.com/x", audio=("ja",), subs=("de",))],
        "seasons": []})
    rows = cat.offers_for_title(parsed, status="FINISHED", year=2013, current_year=2026)
    assert len(rows) == 1
    assert rows[0]["url"] == "https://crunchyroll.com/x"
    assert rows[0]["audio"] == "de,ja"


def test_mehrere_anbieter_bleiben_nebeneinander():
    parsed = cat.parse_node({
        "objectType": "SHOW",
        "content": {"title": "A", "originalTitle": "A", "originalReleaseYear": 2013},
        "offers": [_jw_offer(), _jw_offer(clear="Netflix", url="https://netflix.com/x"),
                   _jw_offer(clear="Joyn", monet="ADS", url="https://joyn.de/x")],
        "seasons": []})
    rows = cat.offers_for_title(parsed, status="FINISHED", year=2013, current_year=2026)
    assert {(o["provider"], o["monetization"]) for o in rows} == {
        ("crunchyroll", "flatrate"), ("netflix", "flatrate"), ("joyn", "ads")}


# --- Aufgabe 10: Trockenlauf-Bericht ----------------------------------------------

def test_diff_offers_meldet_neue_und_weggefallene_paare():
    a = {"id": 7, "offers": {("netflix", "flatrate"): None, ("amazon-video", "buy"): None}}
    neu, weg = cat.diff_offers(a, [_offer()])
    assert neu == [("crunchyroll", "flatrate")]
    assert weg == [("netflix", "flatrate")]  # Kauf/Leih faellt nie weg


def test_diff_offers_zaehlt_handarbeit_und_veto_nicht_als_wegfall():
    a = {"id": 7, "offers": {("adn", "flatrate"): None, ("wow", "flatrate"): None},
         "manual": {("adn", "flatrate")}, "rejected": {("wow", "flatrate")}}
    neu, weg = cat.diff_offers(a, [])
    assert (neu, weg) == ([], [])


# --- Aufgabe 10: Vorauswahl der Kandidaten ----------------------------------------

def test_vorauswahl_aendert_die_zuordnung_nicht():
    """`candidates_for` ist eine Vorauswahl, keine zweite Match-Regel: ueber alle
    Knoten der Matcher-Tests muss dasselbe herauskommen wie ohne Index."""
    idx = cat.title_index(ANIME)
    knoten = [
        _node("Suikoden", "幻想水滸伝", 2026),
        _node("Die Rebellen vom Liang Shan Po", "Suikoden", 1973),
        _node("One Piece", "One Piece", 2023),
        _node("Attack on Titan", "Shingeki no Kyojin", 2013),
        _node("Wotakoi: Love ist schwer", "Wotakoi: Love is Hard for Otaku", 2018),
        _node("Kaijuu Movie", "Kaijuu Movie", 2020, "MOVIE"),
        _node("Kaijuu Movie", "Kaijuu Movie", 2020, "SHOW"),
        _node("Voellig unbekannt", "Voellig unbekannt", 2001),
        _node("", "", None),
    ]
    for p in knoten:
        ohne = cat.match_node(p, ANIME)
        mit = cat.match_node(p, cat.candidates_for(p, idx))
        assert (ohne or {}).get("slug") == (mit or {}).get("slug")


def test_vorauswahl_findet_ueber_normalform_und_basistitel():
    idx = cat.title_index(ANIME)
    slugs = {a["slug"] for a in cat.candidates_for(_node("Attack on Titan", "Shingeki no Kyojin", 2013), idx)}
    assert "shingeki-no-kyojin" in slugs
    basis = {a["slug"] for a in cat.candidates_for(_node("Wotakoi: Liebe ist schwer", "Wotakoi: Love is Hard", 2018), idx)}
    assert "wotakoi" in basis
    assert cat.candidates_for(_node("Gar nichts davon", "Gar nichts davon", 2001), idx) == []


# --- Aufgabe 10: Modi und Exit-Codes ----------------------------------------------

def test_instanz_sperre_bricht_mit_exit_code_zwei_ab(monkeypatch):
    """Exit 2 heisst 'hat gar nicht stattgefunden' — weder vollstaendiger Durchlauf (0)
    noch unvollstaendiger Abruf (1). Ein Cron-Wrapper muss das unterscheiden koennen,
    und geschrieben werden darf dabei nichts."""
    monkeypatch.setattr(cat.sys, "argv", ["justwatch-catalog.py", "--sweep"])
    monkeypatch.setattr(cat, "other_instance_running", lambda: True)
    monkeypatch.setattr(cat, "psql", lambda *a, **kw: pytest.fail("kein Datenbankzugriff bei gesperrter Instanz"))
    with pytest.raises(SystemExit) as e:
        cat.main()
    assert e.value.code == 2


def test_ohne_modus_laeuft_nichts(monkeypatch):
    """Kein versehentliches Schreiben: der Modus muss ausdruecklich dastehen."""
    monkeypatch.setattr(cat.sys, "argv", ["justwatch-catalog.py"])
    monkeypatch.setattr(cat, "other_instance_running", lambda: pytest.fail("zu frueh"))
    with pytest.raises(SystemExit) as e:
        cat.main()
    assert "--discovery" in str(e.value.code)


def test_zwei_modi_gleichzeitig_laufen_nicht(monkeypatch):
    monkeypatch.setattr(cat.sys, "argv", ["justwatch-catalog.py", "--dry-run", "--discovery"])
    monkeypatch.setattr(cat, "other_instance_running", lambda: pytest.fail("zu frueh"))
    with pytest.raises(SystemExit) as e:
        cat.main()
    assert "--count-only" in str(e.value.code)


# --- Aufgabe 10: der ganze Durchlauf, mit gestopftem Netz und gestopfter DB -------
#
# Die reinen Funktionen sind oben einzeln geprueft; hier laeuft `main()` einmal durch,
# damit die Verdrahtung nicht unbemerkt auseinanderfaellt (Lader -> Zuordnung ->
# Schreiben -> Stempel) und damit der Abbruch-Fall auch am fertigen Lauf haengt.

def _run(monkeypatch, mode, complete=True, leer=False):
    geschrieben = []
    anime = [{"id": 1, "slug": "testtitel", "titles": ["", "", "Testtitel", ""], "year": 2026,
              "want": "SHOW", "status": "RELEASING", "offers": {}, "manual": set(), "rejected": set()}]
    node = {"objectType": "SHOW",
            "content": {"title": "Testtitel", "originalTitle": "Testtitel", "originalReleaseYear": 2026},
            "offers": [{"monetizationType": "FLATRATE", "standardWebURL": "https://crunchyroll.com/x",
                        "package": {"clearName": "Crunchyroll"}, "audioLanguages": ["ja"],
                        "subtitleLanguages": ["de"], "elementCount": 1}],
            "seasons": []}
    monkeypatch.setattr(cat, "load_all_anime", lambda: anime)
    monkeypatch.setattr(cat.jw, "session", lambda: None)
    monkeypatch.setattr(cat, "fetch_catalog",
                        lambda sess, short, typ: ([] if leer else ([node] if typ == "SHOW" else []), complete))
    monkeypatch.setattr(cat, "psql", lambda sql, read=True: (geschrieben.append(sql), "")[1])
    monkeypatch.setattr(cat.sys, "argv", ["justwatch-catalog.py", mode])
    monkeypatch.setattr(cat, "other_instance_running", lambda: False)
    with pytest.raises(SystemExit) as e:
        cat.main()
    return e.value.code, "\n".join(geschrieben)


def test_vollstaendiger_sweep_schreibt_angebote_und_stempelt(monkeypatch):
    code, sql = _run(monkeypatch, "--sweep")
    assert code == 0
    assert "INSERT INTO anime_streaming_offers" in sql and "'crunchyroll'" in sql
    assert "UPDATE anime SET streaming_verified_at" in sql
    assert "content_updated_at" in sql  # geaenderte Angabe ist eine Inhaltsaenderung


def test_abbruch_mitten_im_durchlauf_schreibt_angebote_aber_keinen_stempel(monkeypatch):
    """Review Focus 1 am fertigen Lauf: die gefundenen Angebote sind echt und bleiben,
    aber ein Netzwerkfehler darf den halben Katalog nicht als geprueft stempeln."""
    code, sql = _run(monkeypatch, "--sweep", complete=False)
    assert code == 1
    assert "INSERT INTO anime_streaming_offers" in sql
    assert "streaming_verified_at" not in sql


def test_leerer_katalog_stempelt_nichts_am_fertigen_lauf(monkeypatch):
    """Jede Seite leer, jeder Abruf formal vollstaendig: der Lauf darf nicht 11.061
    Titel als geprueft stempeln, sondern muss mit 1 abbrechen."""
    code, sql = _run(monkeypatch, "--sweep", leer=True)
    assert code == 1
    assert "streaming_verified_at" not in sql


def test_trockenlauf_schreibt_nichts(monkeypatch):
    code, sql = _run(monkeypatch, "--dry-run")
    assert code == 0
    assert sql == ""


def test_entdeckungslauf_laesst_first_seen_at_leer_und_schweigt_in_der_sitemap(monkeypatch):
    code, sql = _run(monkeypatch, "--discovery")
    assert code == 0
    assert ", NULL, NULL, '" in sql  # available_to und first_seen_at
    assert "content_updated_at" not in sql
    assert "UPDATE anime SET streaming_verified_at" in sql


# --- Fix-Runde 1 ------------------------------------------------------------------

def test_delete_spart_auch_das_veto_aus():
    """Der Lader erkennt eine Veto-Zeile an `confidence='rejected'`, unabhaengig von
    `source`. Spart das DELETE nur `source='manual'` aus, loescht der Sweep eine
    Veto-Zeile mit anderer Herkunft und legt das Angebot im Folgelauf wieder an — das
    Veto haette sich selbst geloescht. Ein Veto ist eine redaktionelle Entscheidung und
    darf nicht davon abhaengen, ob beim Eintragen auch das zweite Feld gesetzt wurde.
    NULL-Semantik beachten: der ganze Altbestand hat `confidence IS NULL`."""
    sql = cat.build_catalog_sql({"id": 7, "offers": {}}, [], NOW, discovery=False)[0]
    assert "source IS DISTINCT FROM 'manual'" in sql
    assert "confidence IS DISTINCT FROM 'rejected'" in sql


def test_staffel_und_episodenzahl_gehen_als_zahl_ins_sql():
    """Beide Werte werden ungequotet interpoliert, und `build_catalog_sql` ist
    ausdruecklich die Schnittstelle fuer Aufgabe 14 — also hier in int() zwingen."""
    sql = " ".join(cat.build_catalog_sql({"id": 7, "offers": {}},
                                         [_offer(seasons="2", episodes="12")], NOW))
    assert ", 2, 12, " in sql
    with pytest.raises(ValueError):
        cat.build_catalog_sql({"id": 7, "offers": {}},
                              [_offer(seasons="1); DROP TABLE anime; --")], NOW)


# Zwei getrennte Knoten fuer dasselbe Werk: das DELETE ist autoritativ ueber alle
# Abo-/Werbe-/Gratis-Zeilen des Titels, also wuerde „erster Treffer gewinnt" die
# Anbieter des zweiten Knotens loeschen. Und weil die Titelsuche ihren Knoten nach
# eigenen Regeln waehlt, kippten dieselben Zeilen bei jeder Rotation hin und her.

def _parsed(clear, year=2013, count=None, season_count=None, title="A"):
    node = {"objectType": "SHOW",
            "content": {"title": title, "originalTitle": title, "originalReleaseYear": year},
            "offers": [_jw_offer(clear=clear, url=f"https://{clear.lower()}/x", count=count)],
            "seasons": ([{"content": {"title": "S1", "seasonNumber": 1, "originalReleaseYear": year},
                          "offers": [_jw_offer(clear=clear, url=f"https://{clear.lower()}/s1",
                                               count=season_count)]}]
                        if season_count else [])}
    return cat.parse_node(node)


def test_zwei_knoten_fuer_dasselbe_werk_werden_vereinigt():
    rows = cat.offers_for_matches([_parsed("Crunchyroll", count=2, season_count=12),
                                   _parsed("Netflix", title="A alternativ")],
                                  status="FINISHED", year=2013, current_year=2026)
    assert {r["provider"] for r in rows} == {"crunchyroll", "netflix"}
    cru = [r for r in rows if r["provider"] == "crunchyroll"][0]
    assert (cru["seasons"], cru["episodes"]) == (2, 12)


def test_vereinigung_zaehlt_episoden_nicht_doppelt():
    """Deshalb wird nicht summiert: die Zahlen des ersten Knotens gelten."""
    p = _parsed("Crunchyroll", count=2, season_count=12)
    rows = cat.offers_for_matches([p, p], status="FINISHED", year=2013, current_year=2026)
    assert len(rows) == 1
    assert (rows[0]["seasons"], rows[0]["episodes"]) == (2, 12)


def test_vereinigung_bevorzugt_den_belegten_knoten():
    """Belegt schlaegt geerbt, egal in welcher Reihenfolge die Knoten kamen."""
    geerbt = cat.parse_node({
        "objectType": "SHOW",
        "content": {"title": "A", "originalTitle": "A", "originalReleaseYear": 2026},
        "offers": [],
        "seasons": [{"content": {"title": "S1", "seasonNumber": 1, "originalReleaseYear": 2026},
                     "offers": [_jw_offer(count=12)]}]})
    belegt = _parsed("Crunchyroll", year=2026, count=1)
    for reihenfolge in ([geerbt, belegt], [belegt, geerbt]):
        rows = cat.offers_for_matches(reihenfolge, status="RELEASING", year=2026, current_year=2026)
        assert len(rows) == 1
        assert rows[0]["confidence"] == "confirmed"


def test_vereinigung_eines_einzelnen_knotens_ist_offers_for_title():
    p = _parsed("Crunchyroll", count=2, season_count=12)
    assert cat.offers_for_matches([p], status="FINISHED", year=2013, current_year=2026) == \
        cat.offers_for_title(p, status="FINISHED", year=2013, current_year=2026)
