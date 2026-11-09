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
