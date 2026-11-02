"""Tests für sources/articles.py: Abbildungslogik (ohne DB) und Integration (mit DB)."""
import os

import pytest

from app import config
from app.sources import articles
from app.sources.articles import TUMBLR_CATEGORIES, bild_url, row_to_item


def _row(**kw):
    """Erfundene aggregierte Zeile, so wie ARTICLES_SQL sie liefert."""
    basis = dict(
        id=42, slug="blue-box-s2", title="Titel", excerpt="Kurz", cover_image_url="http://x/c.jpg",
        category="news", anime_count=1, series_title="Ao no Hako", is_hentai=False,
        genres=["Sports", "Romance"], tag_names=["Blue Box", "School"],
        tag_categories=["theme", "setting"], tag_ranks=[1, 2],
    )
    basis.update(kw)
    return basis


def test_kategorien_sind_news_und_simulcast():
    assert TUMBLR_CATEGORIES == frozenset({"news", "simulcast"})


def test_einzelner_anime_liefert_alle_felder():
    it = row_to_item(_row())
    assert it.ref == "42" and it.kind == "article" and it.perishable is True
    assert it.url.endswith("/news/blue-box-s2")
    assert it.category == "news"
    assert it.genres == ["Sports", "Romance"]
    assert it.anime_tags == [("Blue Box", "theme", 1), ("School", "setting", 2)]
    assert it.series_title == "Ao no Hako"
    assert it.anime_count == 1
    assert it.is_hentai is False


def test_mehrere_anime_behalten_genres_und_tags_ohne_serientitel():
    it = row_to_item(_row(anime_count=3))
    assert it.genres == ["Sports", "Romance"]
    assert it.anime_tags == [("Blue Box", "theme", 1), ("School", "setting", 2)]
    assert it.series_title is None
    assert it.anime_count == 3


def test_kein_anime_gibt_leere_felder_trotz_befuellter_aggregate():
    # befüllte Aggregate bei anime_count=0 dürfen nicht durchschlagen
    it = row_to_item(_row(anime_count=0))
    assert it.genres == [] and it.anime_tags == [] and it.series_title is None
    assert it.anime_count == 0


def test_kein_anime_behaelt_hentai_flag():
    assert row_to_item(_row(anime_count=0, is_hentai=True)).is_hentai is True


def test_anime_count_none_wird_null():
    it = row_to_item(_row(anime_count=None))
    assert it.anime_count == 0
    assert it.genres == [] and it.anime_tags == [] and it.series_title is None


def test_null_aggregate_bei_einem_anime_werden_leere_listen():
    it = row_to_item(_row(genres=None, tag_names=None, tag_categories=None, tag_ranks=None))
    assert it.genres == [] and it.anime_tags == []
    assert it.series_title == "Ao no Hako"


def test_hentai_bleibt_auch_bei_mehreren_anime_erhalten():
    it = row_to_item(_row(anime_count=2, is_hentai=True))
    assert it.is_hentai is True


def test_is_hentai_none_wird_false():
    assert row_to_item(_row(is_hentai=None)).is_hentai is False


def test_tag_rank_none_wird_zu_null():
    it = row_to_item(_row(tag_names=["A"], tag_categories=["mood"], tag_ranks=[None]))
    assert it.anime_tags == [("A", "mood", 0)]


def test_leerer_titel_und_excerpt_werden_leerstring():
    it = row_to_item(_row(title=None, excerpt=None, series_title=""))
    assert it.title == "" and it.excerpt == "" and it.series_title is None


def test_category_none_bleibt_none():
    assert row_to_item(_row(category=None)).category is None


async def test_fetch_new_dedup_und_limit(monkeypatch):
    zeilen = [_row(id=i, slug=f"s{i}") for i in range(1, 8)]
    aufrufe = []

    async def fake_fetch(sql, *args):
        aufrufe.append((sql, args))
        return zeilen

    async def fake_is_seen(kind, ref):
        assert kind == "article"
        return ref in {"2", "3"}

    monkeypatch.setattr(articles.pg, "fetch", fake_fetch)
    monkeypatch.setattr(articles.models, "is_seen", fake_is_seen)

    items = await articles.fetch_new(3)
    assert [i.ref for i in items] == ["1", "4", "5"]  # 2, 3 gesehen; Abbruch bei limit
    assert aufrufe[0][0] == articles.ARTICLES_SQL
    assert aufrufe[0][1] == (40,)  # max(limit*6, 40), kein Kategoriefilter


async def test_fetch_new_filtert_nicht_nach_kategorie(monkeypatch):
    async def fake_fetch(sql, *args):
        return [_row(id=1, category="guide"), _row(id=2, category="review")]

    async def fake_is_seen(kind, ref):
        return False

    monkeypatch.setattr(articles.pg, "fetch", fake_fetch)
    monkeypatch.setattr(articles.models, "is_seen", fake_is_seen)
    items = await articles.fetch_new(5)
    assert [i.category for i in items] == ["guide", "review"]
    assert "category" not in articles.ARTICLES_SQL.rsplit("WHERE", 1)[1]


# ---------- C3: cover_image_url steht relativ in der Datenbank ----------

def test_bild_url_macht_relative_pfade_absolut():
    """Produktionsform: /media/anime/banner/195/195604.jpg (1158-mal relativ, 0-mal absolut)."""
    assert bild_url("/media/anime/banner/195/195604.jpg") == (
        f"{config.SITE_BASE_URL}/media/anime/banner/195/195604.jpg")


def test_bild_url_laesst_absolute_urls_unveraendert():
    assert bild_url("https://cdn.example/x.jpg") == "https://cdn.example/x.jpg"
    assert bild_url("http://cdn.example/x.jpg") == "http://cdn.example/x.jpg"
    assert bild_url("HTTPS://cdn.example/x.jpg") == "HTTPS://cdn.example/x.jpg"


@pytest.mark.parametrize("leer", [None, "", "   ", 7, ["/x.jpg"]])
def test_bild_url_ohne_brauchbaren_wert_bleibt_none(leer):
    assert bild_url(leer) is None


@pytest.mark.parametrize("roh", ["media/x.jpg", "/media/x.jpg", "//media/x.jpg", " /media/x.jpg "])
def test_bild_url_setzt_genau_einen_schraegstrich(roh):
    assert bild_url(roh) == f"{config.SITE_BASE_URL}/media/x.jpg"


def test_row_to_item_liefert_eine_absolute_bild_url():
    it = row_to_item(_row(cover_image_url="/media/c.jpg"))
    assert it.image_url == f"{config.SITE_BASE_URL}/media/c.jpg"
    assert it.url.startswith(config.SITE_BASE_URL)  # gleiche Quelle wie die Artikel-URL


def test_row_to_item_ohne_bild_bleibt_ohne_bild():
    assert row_to_item(_row(cover_image_url=None)).image_url is None


def test_npf_bildblock_bekommt_die_absolute_url():
    from app.channels.base import Post
    from app.channels.tumblr import build_npf_content

    it = row_to_item(_row(cover_image_url="/media/c.jpg"))
    bloecke = build_npf_content(Post(text="T", url=it.url, title=it.title,
                                     image_url=it.image_url))
    assert bloecke[0]["type"] == "image"
    assert bloecke[0]["media"][0]["url"] == f"{config.SITE_BASE_URL}/media/c.jpg"

    ohne = row_to_item(_row(cover_image_url=None))
    assert [b["type"] for b in build_npf_content(
        Post(text="T", url=ohne.url, title=ohne.title, image_url=ohne.image_url))] == ["text"] * 3


# ---------- I1: Tag-Material in einer zweiten, eigenen Abfrage ----------

def _grund(**kw):
    """Zeile der Grundabfrage: nur Spalten aus `articles`."""
    basis = dict(id=42, slug="blue-box-s2", title="Titel", excerpt="Kurz",
                 cover_image_url="/media/c.jpg", category="news")
    basis.update(kw)
    return basis


def _tagzeile(**kw):
    """Zeile von TAGS_SQL."""
    basis = dict(id=42, anime_count=1, series_title="Ao no Hako", is_hentai=False,
                 genres=["Sports"], tag_names=["School"], tag_categories=["setting"],
                 tag_ranks=[80])
    basis.update(kw)
    return basis


def _fetch_patchen(monkeypatch, kanaele, grundzeilen, tagzeilen):
    aufrufe = []

    async def fake_fetch(sql, *args):
        aufrufe.append((sql, args))
        if sql is articles.ARTICLES_SQL:
            return grundzeilen
        if callable(tagzeilen):
            return tagzeilen()
        return tagzeilen

    async def fake_is_seen(kind, ref):
        return False

    monkeypatch.setattr(articles.pg, "fetch", fake_fetch)
    monkeypatch.setattr(articles.models, "is_seen", fake_is_seen)
    monkeypatch.setattr(config, "CHANNELS_ENABLED", list(kanaele))
    return aufrufe


def test_grundabfrage_liest_nur_articles():
    """Die sechs Tag-Tabellen stehen ausschliesslich in TAGS_SQL."""
    for tabelle in ("articles_rels", "anime_rels", "anime_tags", "genres", "tags", "LATERAL"):
        assert tabelle not in articles.ARTICLES_SQL, tabelle
        assert tabelle in articles.TAGS_SQL, tabelle
    assert "FROM articles a" in articles.ARTICLES_SQL


async def test_fetch_new_ohne_tumblr_fragt_nur_die_grundabfrage(monkeypatch):
    """Eine reine Tumblr-Datenabhaengigkeit darf Bluesky und Mastodon nicht beruehren."""
    aufrufe = _fetch_patchen(monkeypatch, ["bluesky", "mastodon"],
                             [_grund(id=1, slug="s1")], [_tagzeile(id=1)])
    items = await articles.fetch_new(5)
    assert [a[0] for a in aufrufe] == [articles.ARTICLES_SQL]
    assert [i.ref for i in items] == ["1"]
    assert items[0].title == "Titel" and items[0].category == "news"
    assert items[0].tag_data_ok is False  # nichts geladen: niemand darf die Felder fuer echt nehmen


async def test_fetch_new_mit_tumblr_holt_die_tagdaten_nach(monkeypatch):
    aufrufe = _fetch_patchen(
        monkeypatch, ["tumblr", "bluesky"],
        [_grund(id=1, slug="s1"), _grund(id=2, slug="s2")],
        [_tagzeile(id=1), _tagzeile(id=2, anime_count=0)])
    items = await articles.fetch_new(5)
    assert [a[0] for a in aufrufe] == [articles.ARTICLES_SQL, articles.TAGS_SQL]
    assert aufrufe[1][1] == ([1, 2],)  # nur die ausgewaehlten Artikel
    assert items[0].genres == ["Sports"] and items[0].series_title == "Ao no Hako"
    assert items[0].anime_tags == [("School", "setting", 80)]
    assert items[1].anime_count == 0 and items[1].genres == []
    assert all(i.tag_data_ok for i in items)


async def test_fetch_new_ohne_treffer_fragt_die_tagdaten_nicht(monkeypatch):
    aufrufe = _fetch_patchen(monkeypatch, ["tumblr"], [], [])
    assert await articles.fetch_new(5) == []
    assert [a[0] for a in aufrufe] == [articles.ARTICLES_SQL]


async def test_gescheiterte_tagabfrage_reisst_den_ingest_nicht_mit(monkeypatch, caplog):
    """Fehlendes SELECT-Recht oder Schema-Drift: Tumblr entfaellt, der Rest laeuft weiter."""
    def kaputt():
        raise PermissionError("permission denied for table anime_tags")

    _fetch_patchen(monkeypatch, ["tumblr", "bluesky"], [_grund(id=1, slug="s1")], kaputt)
    with caplog.at_level("WARNING"):
        items = await articles.fetch_new(5)  # darf nicht werfen
    assert [i.ref for i in items] == ["1"]
    assert items[0].title == "Titel"        # Grunddaten sind da
    assert items[0].tag_data_ok is False
    assert any("Tag-Rohdaten" in r.getMessage() and r.levelname == "WARNING"
               for r in caplog.records)


async def test_fehlende_tagzeile_laesst_nur_diesen_artikel_ohne_tumblr(monkeypatch, caplog):
    _fetch_patchen(monkeypatch, ["tumblr"],
                   [_grund(id=1, slug="s1"), _grund(id=2, slug="s2")],
                   [_tagzeile(id=1)])  # Zeile fuer 2 fehlt
    with caplog.at_level("WARNING"):
        items = await articles.fetch_new(5)
    assert items[0].tag_data_ok is True
    assert items[1].tag_data_ok is False


@pytest.mark.skipif(not os.environ.get("PG_PASSWORD"), reason="keine DB")
async def test_fetch_new_liefert_tagdaten():
    items = await articles.fetch_new(3)
    assert items, "keine Artikel"
    it = items[0]
    assert it.category is not None
    assert isinstance(it.genres, list)
    assert isinstance(it.anime_tags, list)
    assert len({i.ref for i in items}) == len(items), "doppelte Artikel"


@pytest.mark.skipif(not os.environ.get("PG_PASSWORD"), reason="keine DB")
async def test_genre_rarity_kennt_comedy_und_sports():
    r = await articles.genre_rarity()
    assert r["Comedy"] > r["Sports"]
