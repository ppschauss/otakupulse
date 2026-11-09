from .conftest import load
jw = load("justwatch-streaming")

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
