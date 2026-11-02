import pytest

from app import tagging
from app.tagging import (
    is_excluded,
    normalize_series_title,
    pick_genre,
    pick_tags,
    sanitize_tag,
    tags_for,
)


def test_pick_genre_waehlt_das_seltenste():
    rarity = {"Comedy": 4867, "Action": 3144, "Sports": 553}
    assert pick_genre(["Comedy", "Action", "Sports"], rarity) == "Sports"


def test_pick_genre_ueberspringt_ecchi_und_hentai():
    rarity = {"Ecchi": 815, "Hentai": 788, "Comedy": 4867}
    assert pick_genre(["Ecchi", "Hentai", "Comedy"], rarity) == "Comedy"


def test_pick_genre_ohne_genres_gibt_none():
    assert pick_genre([], {}) is None


def test_pick_genre_nur_gesperrte_gibt_none():
    assert pick_genre(["Hentai"], {"Hentai": 788}) is None


def test_pick_tags_blue_box():
    at = [("Primarily Teen Cast", "element", 97), ("Heterosexual", "theme", 96),
          ("School", "setting", 91), ("Male Protagonist", "element", 84),
          ("Badminton", "theme", 84), ("Coming of Age", "theme", 80)]
    assert pick_tags(at) == ["School", "Badminton"]


def test_pick_tags_dandadan():
    at = [("Urban Fantasy", "setting", 97), ("Ghost", "element", 96),
          ("Youkai", "theme", 96), ("Super Power", "theme", 92)]
    assert pick_tags(at) == ["Urban Fantasy", "Youkai"]


def test_pick_tags_verwirft_unter_rangschwelle():
    at = [("Unrequited Love", "theme", 20), ("Tokusatsu", "theme", 36)]
    assert pick_tags(at) == []


def test_pick_tags_ohne_tags_gibt_leere_liste():
    assert pick_tags([]) == []


def test_pick_tags_liefert_auch_nur_einen():
    at = [("Kingdom Management", "theme", 72), ("Ghost", "element", 99)]
    assert pick_tags(at) == ["Kingdom Management"]


def test_pick_tags_rang_60_bleibt_drin():
    # Grenze ist >=, Rang genau 60 zaehlt noch
    assert pick_tags([("Grenzfall", "theme", 60), ("Knapp", "theme", 59)]) == ["Grenzfall"]


def test_pick_tags_ranggleichheit_behaelt_eingabereihenfolge():
    at = [("Zuerst", "theme", 80), ("Danach", "setting", 80), ("Zuletzt", "theme", 80)]
    assert pick_tags(at) == ["Zuerst", "Danach"]
    assert pick_tags(list(reversed(at))) == ["Zuletzt", "Danach"]


def test_pick_genre_ohne_rarity_eintrag_gewinnt():
    assert pick_genre(["Comedy", "Neu"], {"Comedy": 10}) == "Neu"


def test_normalize_entfernt_staffel_suffix():
    assert normalize_series_title("Ao no Hako Season 2") == "ao no hako"
    assert normalize_series_title("Tensei Kizoku 3rd Season") == "tensei kizoku"
    assert normalize_series_title("Shingeki no Kyojin Final Season") == "shingeki no kyojin"


def test_normalize_entfernt_subtitel_nach_doppelpunkt():
    """Der Doppelpunkt ist der verlaessliche Untertitel-Trenner (an der Produktion geprueft)."""
    assert normalize_series_title("Tempal: Item no Chikara") == "tempal"
    assert normalize_series_title("Pokémon: Arceus and the Jewel of Life") == "pokémon"
    assert normalize_series_title("NARUTO: Shippuuden – Sunny Side Battle!!!") == "naruto"
    assert normalize_series_title("Lagrange: The Flower of Rin-ne") == "lagrange"
    assert normalize_series_title("Beelzebub: Kaiketsu!! Kuro no Majo") == "beelzebub"


# --- C4: am Komma wird NICHT geschnitten ---

def test_normalize_schneidet_nicht_am_komma():
    """Der Komma-Schnitt war als Regel falsch: das Komma steht im Titel, nicht vor dem Untertitel."""
    assert normalize_series_title(
        "Hello, I am a Witch and my Crush Wants me to Make a Love Potion!"
    ) == "hello, i am a witch and my crush wants me to make a love potion"


@pytest.mark.parametrize("titel,erwartet", [
    ("No Game, No Life", "no game, no life"),
    ("DON'T TOY WITH ME, MISS NAGATORO", "don't toy with me, miss nagatoro"),
    ("Demon Lord, Retry!", "demon lord, retry"),
    ("With Vengeance, Sincerely, Your Broken Saintess Season 2",
     "with vengeance, sincerely, your broken saintess"),
    ("Tensei Kizoku, Kantei Skill de Nariagaru", "tensei kizoku, kantei skill de nariagaru"),
])
def test_normalize_laesst_titel_mit_komma_vollstaendig(titel, erwartet):
    assert normalize_series_title(titel) == erwartet


@pytest.mark.parametrize("titel", [
    "Hello, I am a Witch and my Crush Wants me to Make a Love Potion!",
    "No Game, No Life",
    "DON'T TOY WITH ME, MISS NAGATORO",
    "Demon Lord, Retry!",
    "With Vengeance, Sincerely, Your Broken Saintess Season 2",
])
def test_kette_normalize_dann_sanitize_laesst_kein_komma_durch(titel):
    """Seit dem Wegfall des Schnitts entfernt NUR sanitize_tag das Komma — lueckenlos belegen.

    Ein Komma, das bis zur Tumblr-API durchkommt, zerreisst den Tag in zwei falsche.
    """
    roh = normalize_series_title(titel)
    assert roh is not None
    tag = sanitize_tag(roh)
    assert "," not in tag
    # Jedes Wort bleibt erhalten, nur das Komma faellt weg (keine Verstuemmelung).
    assert tag.split() == roh.replace(",", " ").split()


def test_kette_auch_ueber_tags_for(monkeypatch):
    """Derselbe Weg, wie der Poster ihn geht: tags_for schickt jeden Tag durch sanitize_tag."""
    out = tags_for(["Drama"], [], "No Game, No Life", {"Drama": 1})
    assert out == ["anime", "otakupulse", "drama", "no game no life"]
    assert all("," not in t for t in out)


def test_override_faengt_den_einzelfall_des_alten_komma_schnitts():
    """Der eine Fall, der den Komma-Schnitt begruendet hatte, steht jetzt als Override."""
    assert normalize_series_title(
        "Tensei Kizoku, Kantei Skill de Nariagaru 3rd Season") == "tensei kizoku"
    assert tagging.SERIES_TAG_OVERRIDES[
        "Tensei Kizoku, Kantei Skill de Nariagaru 3rd Season"] == "tensei kizoku"


def test_normalize_laesst_einfache_titel_unberuehrt():
    assert normalize_series_title("Dandadan") == "dandadan"


def test_normalize_zu_kurz_gibt_none():
    assert normalize_series_title("K2") is None
    assert normalize_series_title("") is None
    assert normalize_series_title(None) is None


def test_override_schlaegt_heuristik(monkeypatch):
    monkeypatch.setitem(tagging.SERIES_TAG_OVERRIDES, "Ao no Hako Season 2", "blue box")
    assert normalize_series_title("Ao no Hako Season 2") == "blue box"


def test_override_none_unterdrueckt_slot6(monkeypatch):
    monkeypatch.setitem(tagging.SERIES_TAG_OVERRIDES, "Irgendein Titel", None)
    assert normalize_series_title("Irgendein Titel") is None


def test_sanitize_entfernt_komma():
    assert sanitize_tag("Tensei Kizoku, Kantei") == "tensei kizoku kantei"


def test_sanitize_behaelt_leerzeichen_im_tag():
    assert sanitize_tag("Urban Fantasy") == "urban fantasy"


def test_is_excluded_bei_hentai():
    assert is_excluded(["Comedy"], True) is True
    assert is_excluded(["Hentai"], False) is True
    assert is_excluded(["Ecchi"], False) is False
    assert is_excluded(["Comedy"], False) is False


def test_tags_for_blue_box_volles_schema():
    out = tags_for(
        genres=["Romance", "Slice of Life", "Sports"],
        anime_tags=[("School", "setting", 91), ("Badminton", "theme", 84)],
        series_title="Ao no Hako Season 2",
        rarity={"Romance": 1925, "Slice of Life": 2079, "Sports": 553},
    )
    assert out == ["anime", "otakupulse", "sports", "school", "badminton", "ao no hako"]


def test_tags_for_ohne_daten_nur_feste_slots():
    assert tags_for([], [], None, {}) == ["anime", "otakupulse"]


def test_tags_for_ecchi_ohne_serientag():
    out = tags_for(["Ecchi", "Comedy"], [], "Irgendein Ecchi Anime",
                   {"Ecchi": 815, "Comedy": 4867})
    assert out == ["anime", "otakupulse", "comedy"]


def test_normalize_mehrstellige_zahl_bleibt_im_namen():
    assert normalize_series_title("Mob Psycho 100") == "mob psycho 100"
    assert normalize_series_title("Eyeshield 21") == "eyeshield 21"


def test_normalize_ziffern_0_und_1_bleiben():
    assert normalize_series_title("Steins;Gate 0") == "steins;gate 0"


def test_normalize_einstellige_zahl_2_bis_9_wird_gekuerzt():
    assert normalize_series_title("Ao no Hako 2") == "ao no hako"


def test_normalize_season_suffixe_weiter_entfernt():
    assert normalize_series_title("Ao no Hako Season 2") == "ao no hako"
    assert normalize_series_title("Tensei Kizoku 3rd Season") == "tensei kizoku"


def test_normalize_roemische_suffixe_werden_entfernt():
    assert normalize_series_title("Overlord II") == "overlord"
    assert normalize_series_title("Overlord III") == "overlord"
    assert normalize_series_title("Overlord IV") == "overlord"


def test_normalize_mehrfach_suffix_wird_vollstaendig_bereinigt():
    assert normalize_series_title("Boku no Hero Season 2 Part 2") == "boku no hero"


def test_normalize_nummer_hinter_punkt_bleibt():
    assert normalize_series_title("Kaiju No. 8") == "kaiju no. 8"
    assert normalize_series_title("Kaiju No. 8 Season 2") == "kaiju no. 8"
    assert normalize_series_title("Kaiju No. 8: Mission Recon") == "kaiju no. 8"
    assert normalize_series_title("Kaiju No.8: Hoshina's Day Off") == "kaiju no.8"


def test_normalize_entfernt_abschliessende_klammergruppen():
    assert normalize_series_title("Doraemon (2005)") == "doraemon"
    assert normalize_series_title("BUZZER BEATER (2007)") == "buzzer beater"
    assert normalize_series_title("Foo Bar (TV) (2011)") == "foo bar"
    assert normalize_series_title("Foo Bar (2011) Season 2") == "foo bar"


def test_normalize_suffix_nur_an_wortgrenze():
    assert normalize_series_title("Counterpart 2") == "counterpart"
    assert normalize_series_title("Counterpart Season 2") == "counterpart"
    assert normalize_series_title("Xpart 3") == "xpart"
    assert normalize_series_title("Wallpart 12") == "wallpart 12"


def test_tags_for_komma_im_tag_wird_entfernt():
    out = tags_for(["Drama"], [("Boys, Love", "theme", 80)], "Foo, Bar", {"Drama": 1})
    # Serientitel bleibt vollstaendig (kein Komma-Schnitt), das Komma faellt in sanitize_tag weg.
    assert out == ["anime", "otakupulse", "drama", "boys love", "foo bar"]
    assert all("," not in t for t in out)


def test_tags_for_komma_im_serientitel_override_wird_entfernt(monkeypatch):
    monkeypatch.setitem(tagging.SERIES_TAG_OVERRIDES, "X", "a, b")
    out = tags_for([], [], "X", {})
    assert out == ["anime", "otakupulse", "a b"]


def test_tags_for_hentai_ohne_serientag():
    out = tags_for(["Hentai", "Comedy"], [], "Irgendein Titel", {"Hentai": 788, "Comedy": 4867})
    assert out == ["anime", "otakupulse", "comedy"]
