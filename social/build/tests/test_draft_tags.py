"""Tags und Kategorie vom Ingest bis zum Adapter (SQLite in tmp_path, ohne Postgres)."""
import json
import sqlite3

import aiosqlite

from app import batch, compose, config, db, models, poster
from app.channels import registry
from app.channels.base import PostResult
from app.sources import articles
from app.sources.articles import SourceItem


async def _enqueue(**kw):
    basis = dict(
        batch_day="2026-11-02", channel="tumblr", source_kind="article",
        source_ref="1", url="https://otakupulse.de/news/x", image_url=None,
        title="T", body="B", perishable=True,
    )
    basis.update(kw)
    return await models.enqueue(**basis)


async def test_enqueue_speichert_tags_als_json(tmp_db):
    did = await _enqueue(tags=["anime", "otakupulse", "sports"], category="simulcast")
    d = await models.get_draft(did)
    assert json.loads(d["tags"]) == ["anime", "otakupulse", "sports"]
    assert d["category"] == "simulcast"


async def test_enqueue_ohne_tags_bleibt_leer(tmp_db):
    did = await _enqueue(tags=None, category=None)
    d = await models.get_draft(did)
    assert d["tags"] is None
    assert d["category"] is None


async def test_enqueue_ohne_neue_argumente_funktioniert_weiter(tmp_db):
    d = await models.get_draft(await _enqueue())
    assert d["tags"] is None


async def test_leere_tagliste_wird_als_json_gespeichert(tmp_db):
    d = await models.get_draft(await _enqueue(tags=[]))
    assert json.loads(d["tags"]) == []


# ---------- Migration ----------

_ALTES_SCHEMA = """
CREATE TABLE drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, batch_day TEXT NOT NULL, channel TEXT NOT NULL,
    source_kind TEXT NOT NULL, source_ref TEXT NOT NULL, url TEXT NOT NULL, image_url TEXT,
    title TEXT, body TEXT NOT NULL, body_edited TEXT,
    state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending','approved','posted','rejected','expired','failed')),
    perishable_at TEXT, created_at TEXT NOT NULL, decided_at TEXT, posted_at TEXT,
    external_id TEXT, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT
);
INSERT INTO drafts(batch_day, channel, source_kind, source_ref, url, body, created_at)
VALUES ('2026-11-01','bluesky','article','7','https://x','alt','2026-11-01T00:00:00+00:00');
"""


def _spalten(pfad) -> set[str]:
    c = sqlite3.connect(pfad)
    try:
        return {r[1] for r in c.execute("PRAGMA table_info(drafts)")}
    finally:
        c.close()


async def test_frische_db_hat_die_neuen_spalten(tmp_db):
    assert {"tags", "category"} <= _spalten(config.DB_PATH)


async def test_migration_ist_idempotent_auf_bestehender_db(tmp_path, monkeypatch):
    pfad = str(tmp_path / "alt.sqlite3")
    c = sqlite3.connect(pfad)
    c.executescript(_ALTES_SCHEMA)
    c.commit()
    c.close()
    assert "tags" not in _spalten(pfad)

    monkeypatch.setattr(config, "DB_PATH", pfad)
    for _ in range(2):  # zweimal: der zweite Lauf darf nicht an "duplicate column" scheitern
        await db.init()
        await db.close()

    assert {"tags", "category"} <= _spalten(pfad)
    # Bestehende Zeilen bleiben erhalten, die neuen Spalten sind dort NULL
    async with aiosqlite.connect(pfad) as a:
        a.row_factory = aiosqlite.Row
        row = await (await a.execute("SELECT * FROM drafts")).fetchone()
    assert row["body"] == "alt" and row["tags"] is None and row["category"] is None


async def test_halb_migrierte_db_wird_vervollstaendigt(tmp_path, monkeypatch):
    pfad = str(tmp_path / "halb.sqlite3")
    c = sqlite3.connect(pfad)
    c.executescript(_ALTES_SCHEMA)
    c.execute("ALTER TABLE drafts ADD COLUMN tags TEXT")  # category fehlt noch
    c.commit()
    c.close()

    monkeypatch.setattr(config, "DB_PATH", pfad)
    await db.init()
    await db.close()
    assert {"tags", "category"} <= _spalten(pfad)


async def test_migration_laesst_echte_fehler_hochschlagen(tmp_path, monkeypatch):
    """Kein breites except: ein Fehler beim ALTER darf nicht verschluckt werden."""
    pfad = str(tmp_path / "alt.sqlite3")
    c = sqlite3.connect(pfad)
    c.executescript(_ALTES_SCHEMA)
    c.commit()
    c.close()
    monkeypatch.setattr(config, "DB_PATH", pfad)
    # NOT NULL ohne Default: SQLite lehnt das ALTER auf einer Tabelle mit Zeilen ab
    monkeypatch.setattr(db, "_NACHGERUESTETE_SPALTEN", (("tags", "TEXT NOT NULL"),))
    fehler = None
    try:
        await db.init()
    except sqlite3.OperationalError as e:
        fehler = e
    finally:
        await db.close()
    assert fehler is not None


# ---------- Ingest: Verdrahtung ----------

def _item(ref, **kw):
    basis = dict(
        kind="article", ref=ref, url=f"https://otakupulse.de/news/{ref}", title="Titel",
        excerpt="Kurz", image_url=None, perishable=True,
        genres=["Sports"], anime_tags=[("School", "setting", 80)],
        series_title="Ao no Hako", category="news", is_hentai=False, anime_count=1,
    )
    basis.update(kw)
    return SourceItem(**basis)


def _patch_ingest(monkeypatch, items, kanaele=("bluesky", "mastodon", "tumblr")):
    aufrufe = {"rarity": 0, "compose": []}

    async def fetch_new(limit):
        return items

    async def rarity():
        aufrufe["rarity"] += 1
        return {"Sports": 5}

    async def compose_for(item, channels):
        aufrufe["compose"].append((item.ref, list(channels)))
        return {c: f"Text {c}" for c in channels}

    monkeypatch.setattr(articles, "fetch_new", fetch_new)
    monkeypatch.setattr(articles, "genre_rarity", rarity)
    monkeypatch.setattr(compose, "compose_for", compose_for)
    monkeypatch.setattr(registry, "active_channel_names", lambda: list(kanaele))
    return aufrufe


async def _drafts():
    cur = await db.conn().execute("SELECT * FROM drafts ORDER BY id")
    return await cur.fetchall()


async def test_ingest_tumblr_bekommt_tags_und_kategorie(tmp_db, monkeypatch):
    _patch_ingest(monkeypatch, [_item("1", category="simulcast")])
    assert await batch.ingest(6) == 3
    per_kanal = {d["channel"]: d for d in await _drafts()}
    assert json.loads(per_kanal["tumblr"]["tags"]) == [
        "anime", "otakupulse", "sports", "school", "ao no hako"]
    assert per_kanal["tumblr"]["category"] == "simulcast"
    # Bluesky und Mastodon bleiben ohne Tags
    for kanal in ("bluesky", "mastodon"):
        assert per_kanal[kanal]["tags"] is None
        assert per_kanal[kanal]["category"] is None


async def test_ingest_fremde_kategorie_entfaellt_nur_fuer_tumblr(tmp_db, monkeypatch):
    aufrufe = _patch_ingest(monkeypatch, [_item("1", category="review")])
    assert await batch.ingest(6) == 2
    assert sorted(d["channel"] for d in await _drafts()) == ["bluesky", "mastodon"]
    assert aufrufe["compose"] == [("1", ["bluesky", "mastodon"])]  # kein Modellaufruf für Tumblr
    assert await models.is_seen("article", "1")


async def test_ingest_kategorie_none_geht_nicht_auf_tumblr(tmp_db, monkeypatch):
    _patch_ingest(monkeypatch, [_item("1", category=None)])
    assert await batch.ingest(6) == 2
    assert "tumblr" not in {d["channel"] for d in await _drafts()}


async def test_ingest_hentai_entfaellt_nur_fuer_tumblr(tmp_db, monkeypatch):
    _patch_ingest(monkeypatch, [_item("1", is_hentai=True), _item("2", genres=["Hentai"])])
    assert await batch.ingest(6) == 4
    assert sorted((d["source_ref"], d["channel"]) for d in await _drafts()) == [
        ("1", "bluesky"), ("1", "mastodon"), ("2", "bluesky"), ("2", "mastodon")]
    assert await models.is_seen("article", "1") and await models.is_seen("article", "2")


async def test_ingest_nur_tumblr_aktiv_und_ausgeschlossen_markiert_trotzdem_gesehen(
        tmp_db, monkeypatch):
    aufrufe = _patch_ingest(monkeypatch, [_item("1", category="review")], kanaele=("tumblr",))
    assert await batch.ingest(6) == 0
    assert aufrufe["compose"] == []
    assert await models.is_seen("article", "1")


async def test_ingest_holt_rarity_einmal_je_lauf(tmp_db, monkeypatch):
    aufrufe = _patch_ingest(monkeypatch, [_item("1"), _item("2"), _item("3")])
    await batch.ingest(6)
    assert aufrufe["rarity"] == 1


async def test_ingest_ohne_tumblr_kanal_braucht_keine_rarity(tmp_db, monkeypatch):
    aufrufe = _patch_ingest(monkeypatch, [_item("1")], kanaele=("bluesky",))
    assert await batch.ingest(6) == 1
    assert aufrufe["rarity"] == 0
    assert aufrufe["compose"] == [("1", ["bluesky"])]  # Bluesky-Aufruf exakt wie vor Tumblr


# ---------- Ingest: Tumblr-Pfad degradiert, reißt nichts mit ----------

async def test_ingest_genre_rarity_wirft_andere_kanaele_laufen_weiter(
        tmp_db, monkeypatch, caplog):
    aufrufe = _patch_ingest(monkeypatch, [_item("1"), _item("2")])

    async def kaputt():
        raise ConnectionError("postgres weg")

    monkeypatch.setattr(articles, "genre_rarity", kaputt)
    with caplog.at_level("WARNING"):
        assert await batch.ingest(6) == 4
    assert sorted((d["source_ref"], d["channel"]) for d in await _drafts()) == [
        ("1", "bluesky"), ("1", "mastodon"), ("2", "bluesky"), ("2", "mastodon")]
    assert aufrufe["compose"] == [("1", ["bluesky", "mastodon"]), ("2", ["bluesky", "mastodon"])]
    assert await models.is_seen("article", "1") and await models.is_seen("article", "2")
    assert any(r.levelname == "WARNING" and "Genre-Häufigkeit" in r.getMessage()
               for r in caplog.records)


async def test_ingest_tags_for_wirft_nur_dieser_artikel_ohne_tumblr(
        tmp_db, monkeypatch, caplog):
    _patch_ingest(monkeypatch, [_item("1", series_title="BOOM"), _item("2")])
    echt = batch.tagging.tags_for

    def tags_for(genres, anime_tags, series_title, rarity):
        if series_title == "BOOM":
            raise ValueError("kaputte Daten")
        return echt(genres, anime_tags, series_title, rarity)

    monkeypatch.setattr(batch.tagging, "tags_for", tags_for)
    with caplog.at_level("ERROR"):
        assert await batch.ingest(6) == 5
    assert sorted((d["source_ref"], d["channel"]) for d in await _drafts()) == [
        ("1", "bluesky"), ("1", "mastodon"),
        ("2", "bluesky"), ("2", "mastodon"), ("2", "tumblr")]
    assert await models.is_seen("article", "1") and await models.is_seen("article", "2")
    assert any(r.levelname == "ERROR" and "1" in r.getMessage() for r in caplog.records)


async def test_ingest_fuer_tumblr_wirft_nur_tumblr_entfaellt(tmp_db, monkeypatch, caplog):
    _patch_ingest(monkeypatch, [_item("1")])

    def kaputt(item):
        raise AttributeError("kaputtes Item")

    monkeypatch.setattr(batch, "_fuer_tumblr", kaputt)
    with caplog.at_level("ERROR"):
        assert await batch.ingest(6) == 2
    assert sorted(d["channel"] for d in await _drafts()) == ["bluesky", "mastodon"]
    assert await models.is_seen("article", "1")
    assert any(r.levelname == "ERROR" for r in caplog.records)


# ---------- Poster: Post-Aufbau ----------

class _FakeChannel:
    def __init__(self):
        self.posts = []

    async def post(self, post):
        self.posts.append(post)
        return PostResult(ok=True, external_id="ext-1")


async def _poste(monkeypatch, draft_id):
    fake = _FakeChannel()

    async def keine_meldung(text):
        pass

    monkeypatch.setattr(config, "DRY_RUN", False)
    monkeypatch.setattr(registry, "get", lambda name: fake)
    monkeypatch.setattr(poster, "_notify", keine_meldung)
    await models.approve(draft_id)
    await poster.run_post_pass()
    return fake.posts


async def test_poster_reicht_tags_und_kategorie_an_post_weiter(tmp_db, monkeypatch):
    did = await _enqueue(tags=["anime", "otakupulse"], category="news")
    (post,) = await _poste(monkeypatch, did)
    assert post.tags == ["anime", "otakupulse"]
    assert post.category == "news"


async def test_poster_ohne_tags_ergibt_leere_liste(tmp_db, monkeypatch):
    did = await _enqueue(channel="bluesky")
    (post,) = await _poste(monkeypatch, did)
    assert post.tags == []
    assert post.category is None


async def test_poster_kaputte_tags_markieren_entwurf_failed_und_weiter(tmp_db, monkeypatch):
    kaputt = await _enqueue(source_ref="1", tags=["anime"])
    await db.conn().execute("UPDATE drafts SET tags='{kein json' WHERE id=?", (kaputt,))
    await db.conn().commit()
    gut = await _enqueue(source_ref="2", channel="bluesky")
    await models.approve(kaputt)
    posts = await _poste(monkeypatch, gut)  # gibt `gut` frei und läuft durch
    assert len(posts) == 1  # nur der gute Entwurf geht raus
    d = await models.get_draft(kaputt)
    assert d["state"] == "failed"
    assert "tags" in (d["last_error"] or "").lower()
    assert (await models.get_draft(gut))["state"] == "posted"
