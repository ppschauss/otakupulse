from app.tagging import pick_genre, pick_tags


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
