"""Tests für sources/articles.py: Abbildungslogik (ohne DB) und Integration (mit DB)."""
import os

import pytest

from app.sources import articles
from app.sources.articles import TUMBLR_CATEGORIES, row_to_item


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


def test_kein_anime_gibt_leere_felder():
    it = row_to_item(_row(anime_count=0, series_title=None, genres=None,
                          tag_names=None, tag_categories=None, tag_ranks=None))
    assert it.genres == [] and it.anime_tags == [] and it.series_title is None
    assert it.anime_count == 0


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


@pytest.mark.skipif(not os.environ.get("PG_PASSWORD"), reason="keine DB")
async def test_fetch_new_liefert_tagdaten():
    items = await articles.fetch_new(3)
    assert items, "keine Artikel"
    it = items[0]
    assert it.category in {"news", "simulcast"}
    assert isinstance(it.genres, list)
    assert isinstance(it.anime_tags, list)
    assert len({i.ref for i in items}) == len(items), "doppelte Artikel"


@pytest.mark.skipif(not os.environ.get("PG_PASSWORD"), reason="keine DB")
async def test_genre_rarity_kennt_comedy_und_sports():
    r = await articles.genre_rarity()
    assert r["Comedy"] > r["Sports"]
