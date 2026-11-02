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
