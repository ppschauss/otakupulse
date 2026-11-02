# Tumblr-Kanal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der OtakuPulse-Social-Agent postet neue `news`- und `simulcast`-Artikel automatisch auf `otakupulse.tumblr.com`, mit dem festgelegten Sechs-Slot-Tag-Schema.

**Architecture:** Tumblr reiht sich als weiterer `Channel`-Adapter in den bestehenden Agent ein und hängt am vorhandenen Tagesbatch (18:00, max. 6 Artikel). Die Tag-Herleitung ist eine reine, testbare Funktion in einem eigenen Modul; die Rohdaten dafür liefert die erweiterte Postgres-Abfrage. Tumblr-Entwürfe überspringen die Telegram-Einzelfreigabe, bleiben aber über ein neues kanalweises Trockenflag vom Live-Gang von Bluesky und Mastodon getrennt.

**Tech Stack:** Python 3 (async), httpx, aiosqlite, asyncpg, APScheduler, pytest + pytest-asyncio (neu), Tumblr API v2 (Neue Post Format).

**Spec:** `docs/superpowers/specs/2026-11-02-tumblr-kanal-design.md`

## Global Constraints

- Code liegt unter `social/build/app/`. `social/manage.sh` ist das Werkzeug für lokale Entwicklung und Tests (`docker run`, kein compose-Plugin vorausgesetzt).
- **Zielumgebung ist der VPS**, nicht Unraid: OtakuPulse läuft dort als Coolify-Service `otakupulse` (uuid `ei9kq0mxqajfydp1vcydbnyg`). Der Tumblr-Agent kommt als weiterer Container in dieses Service-Compose, damit er `otakupulse-db` über das Service-Netz erreicht. `PG_HOST=otakupulse-db`, Rolle `social_ro` (existiert dort bereits).
- Kommentare und Log-Meldungen auf Deutsch, wie im bestehenden Code.
- Secrets ausschließlich in `social/secrets.env` (gitignored). Platzhalter in `secrets.env.example`. Niemals Werte ins Repo.
- Postgres wird **nur lesend** über die Rolle `social_ro` angesprochen.
- Bestehendes Verhalten von Bluesky und Mastodon bleibt unverändert: `MAX_DRAFTS_PER_BATCH` bleibt `6`, der Ingest-Takt bleibt einmal täglich.
- Für Anthropic-Modell-IDs und -Parameter gilt das `claude-api`-Skill, nicht das Gedächtnis.
- Tag-Schema, feste Reihenfolge: `#anime`, `#otakupulse`, `#genre1`, `#tag1`, `#tag2`, `#serientitel`. Alles kleingeschrieben.
- Nur Artikel der Kategorien `news` und `simulcast` gehen auf Tumblr.
- Tumblr-Limits: 250 veröffentlichte Posts pro Tag und Nutzer, 1000 API-Calls/Stunde und 5000/Tag je Consumer-Key, NPF-Post max. 1 MB.

## Review Focus

Fünf Eingaben, die der Entwurf voraussetzt, aber nicht als Testfall benennt. Jede bekommt ihren Test in der Task, der den Code besitzt.

1. **Ein Tag enthält ein Komma.** Tumblr trennt den `tags`-Parameter an Kommas — ein Tag mit Komma zerfällt in zwei falsche Tags. Kommas (und Steuerzeichen) müssen vor dem Senden entfernt werden. → Task 2 und Task 6.
2. **Anime ohne verwertbare Genres oder Tags.** 856 der 11 058 Anime haben keine Tags. Der Post muss mit weniger als sechs Tags rausgehen, nicht abstürzen. → Task 1.
3. **Artikel ohne `cover_image_url`.** Der NPF-Post darf dann keinen leeren Bild-Block enthalten; der Kicker rutscht an die erste Stelle. → Task 6.
4. **Tumblr antwortet 429 oder das Tageslimit ist erschöpft.** `retry_after` muss aus dem Header kommen, damit der Breaker den Kanal still legt statt zu hämmern. → Task 6.
5. **Serientitel wird durch die Normalisierung leer oder zu kurz.** Dann entfällt Slot 6, statt einen sinnlosen Tag zu senden. → Task 2.

---

## File Structure

**Neu:**
- `social/build/app/tagging.py` — reine Tag-Herleitung, kein I/O
- `social/build/app/channels/tumblr.py` — Adapter
- `social/build/tests/conftest.py`, `test_tagging.py`, `test_tumblr.py`, `test_poster_dryrun.py`
- `social/tools/tumblr_auth.py` — einmalige Autorisierung über lokalen Listener

**Bereits geliefert, nicht Teil dieses Plans:**
- `social/tumblr-theme/theme.html`, `README.md`, `check-balance.py` — das Theme
  ist gebaut und im Tumblr-Editor eingesetzt. Offen ist dort nur die Prüfung
  des Cover-Selektors am ersten echten Post, siehe Inbetriebnahme Schritt 4.
- `social/secrets.env.example` — die Tumblr-Platzhalter und
  `DRY_RUN_CHANNELS` stehen bereits drin.

**Geändert:**
- `build/requirements.txt` — pytest, pytest-asyncio
- `build/app/config.py` — Tumblr-Werte, `DRY_RUN_CHANNELS`, `TUMBLR_MAX_POSTS_PER_DAY`
- `build/app/db.py` — Spalten `tags`, `category` auf `drafts`
- `build/app/models.py` — `enqueue()` um `tags`/`category`, Verfall für auto-freigegebene Entwürfe
- `build/app/sources/articles.py` — Joins, Kategorie-Filter, Genre-Häufigkeiten
- `build/app/channels/base.py` — `Post.tags`, `Post.category`
- `build/app/channels/registry.py` — `tumblr` eintragen
- `build/app/batch.py` — Auto-Freigabe und Tageslimit für Tumblr
- `build/app/poster.py` — kanalweiser Trockenmodus, Tags durchreichen, ein Tumblr-Post je Durchlauf
- `social/manage.sh` — `test`-Kommando
- `social/README.md` — Tumblr-Abschnitt

---

### Task 1: Testharness und Tag-Auswahl (Slots 3–5)

**Files:**
- Create: `social/build/app/tagging.py`
- Create: `social/build/tests/conftest.py`, `social/build/tests/test_tagging.py`
- Modify: `social/build/requirements.txt`
- Modify: `social/manage.sh`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `GENRE_BLOCKLIST: frozenset[str]` — `{"Ecchi", "Hentai"}`
  - `TAG_BLOCKLIST: frozenset[str]` — Deskriptoren aus dem Entwurf
  - `MIN_TAG_RANK: int = 60`
  - `ALLOWED_TAG_CATEGORIES: frozenset[str]` — `{"theme", "setting"}`
  - `pick_genre(genres: list[str], rarity: dict[str, int]) -> str | None`
  - `pick_tags(anime_tags: list[tuple[str, str, int]], limit: int = 2) -> list[str]`
  - `anime_tags`-Tupel sind `(name, category, rank)`.

- [ ] **Step 1: pytest in `build/requirements.txt` aufnehmen**

`pytest==8.3.4` und `pytest-asyncio==0.25.0` ergänzen.

- [ ] **Step 2: `manage.sh test` ergänzen**

Neues Kommando nach dem Muster von `cli`: startet das Image und führt `python -m pytest /app/tests -v` aus.

- [ ] **Step 3: `tests/conftest.py` anlegen**

Nur `asyncio_mode = "auto"` für pytest-asyncio setzen und den `app`-Import-Pfad verfügbar machen.

- [ ] **Step 4: Die fehlschlagenden Tests schreiben**

```python
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
```

- [ ] **Step 5: Tests laufen lassen, Fehlschlag bestätigen**

Run: `./manage.sh test`
Expected: FAIL, `ModuleNotFoundError: app.tagging`

- [ ] **Step 6: `tagging.py` mit den Konstanten und beiden Funktionen anlegen**

`pick_genre` sortiert nach `rarity.get(name, 0)` aufsteigend und überspringt `GENRE_BLOCKLIST`; Genres ohne Eintrag in `rarity` gelten als am seltensten. `pick_tags` filtert auf `ALLOWED_TAG_CATEGORIES`, `rank >= MIN_TAG_RANK` und `name not in TAG_BLOCKLIST`, sortiert absteigend nach Rang und schneidet bei `limit` ab. Die Reihenfolge der Eingabe entscheidet bei Ranggleichheit.

`TAG_BLOCKLIST` enthält: `Heterosexual`, `Primarily Teen Cast`, `Primarily Adult Cast`, `Primarily Female Cast`, `Primarily Male Cast`, `Primarily Child Cast`, `Male Protagonist`, `Female Protagonist`, `Ensemble Cast`, `Nudity`, `CGI`, `Episodic`.

- [ ] **Step 7: Tests laufen lassen, Erfolg bestätigen**

Run: `./manage.sh test`
Expected: PASS, 9 Tests

- [ ] **Step 8: Commit**

```bash
git add social/build/requirements.txt social/manage.sh social/build/tests social/build/app/tagging.py
git commit -m "feat(social): Tag-Auswahl fuer Tumblr plus pytest-Harness"
```

---

### Task 2: Serientitel-Normalisierung, Adult-Ausschluss, Gesamtschema

**Files:**
- Modify: `social/build/app/tagging.py`
- Modify: `social/build/tests/test_tagging.py`

**Interfaces:**
- Consumes: `pick_genre`, `pick_tags` aus Task 1
- Produces:
  - `SERIES_TAG_OVERRIDES: dict[str, str | None]` — leer vorbelegt, Schlüssel ist der Rohtitel
  - `normalize_series_title(title: str | None) -> str | None`
  - `sanitize_tag(tag: str) -> str` — Kommas und Steuerzeichen raus, Mehrfach-Leerzeichen zusammen, `strip()`, kleingeschrieben
  - `is_excluded(genres: list[str], is_hentai: bool) -> bool`
  - `tags_for(genres, anime_tags, series_title, rarity) -> list[str]` — die fertige Liste in Schema-Reihenfolge

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

```python
def test_normalize_entfernt_staffel_suffix():
    assert normalize_series_title("Ao no Hako Season 2") == "ao no hako"
    assert normalize_series_title("Tensei Kizoku 3rd Season") == "tensei kizoku"
    assert normalize_series_title("Shingeki no Kyojin Final Season") == "shingeki no kyojin"

def test_normalize_entfernt_subtitel_nach_komma_und_doppelpunkt():
    assert normalize_series_title("Tensei Kizoku, Kantei Skill de Nariagaru") == "tensei kizoku"
    assert normalize_series_title("Tempal: Item no Chikara") == "tempal"

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
    assert "irgendein ecchi anime" not in out
    assert "ecchi" not in out
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `./manage.sh test`
Expected: FAIL, `normalize_series_title` nicht definiert

- [ ] **Step 3: Die vier Funktionen in `tagging.py` ergänzen**

`normalize_series_title`: zuerst `SERIES_TAG_OVERRIDES` nachschlagen (Treffer gewinnt, auch `None`); sonst kleinschreiben, alles ab dem ersten `,` oder `:` abschneiden, dann am Ende per Regex streichen: `season \d+`, `\d+(st|nd|rd|th) season`, `final season`, `part \d+`, `cour \d+`, eine angehängte arabische Zahl oder römische Zahl (`ii`, `iii`, `iv`); Rand-Satzzeichen und Mehrfach-Leerzeichen bereinigen; unter 3 Zeichen `None`.

`tags_for` setzt zusammen: `["anime", "otakupulse"]`, dann `pick_genre`, dann `pick_tags`, dann `normalize_series_title`. Bei `Ecchi` in `genres` entfällt Slot 6. Jeder Wert läuft durch `sanitize_tag`; leere Ergebnisse fallen raus.

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `./manage.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add social/build/app/tagging.py social/build/tests/test_tagging.py
git commit -m "feat(social): Serientitel-Normalisierung und Gesamt-Tagschema"
```

---

### Task 3: Postgres-Quelle erweitern

**Files:**
- Modify: `social/build/app/sources/articles.py`
- Modify: `social/build/tests/test_tagging.py` (Integrationstest gegen die Live-DB, mit `pytest.mark.skipif` bei fehlender Verbindung)

**Interfaces:**
- Consumes: `tagging.tags_for`
- Produces:
  - `SourceItem` zusätzlich: `genres: list[str]`, `anime_tags: list[tuple[str, str, int]]`, `series_title: str | None`, `category: str | None`, `is_hentai: bool`, `anime_count: int`
  - `TUMBLR_CATEGORIES: frozenset[str]` — `{"news", "simulcast"}`
  - `async def genre_rarity() -> dict[str, int]` — einmal je Prozess, Ergebnis im Modul gecacht

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

```python
@pytest.mark.skipif(not os.environ.get("PG_PASSWORD"), reason="keine DB")
async def test_fetch_new_liefert_tagdaten():
    items = await articles.fetch_new(3)
    assert items, "keine Artikel"
    it = items[0]
    assert it.category in {"news", "simulcast"}
    assert isinstance(it.genres, list)
    assert isinstance(it.anime_tags, list)

@pytest.mark.skipif(not os.environ.get("PG_PASSWORD"), reason="keine DB")
async def test_genre_rarity_kennt_comedy_und_sports():
    r = await articles.genre_rarity()
    assert r["Comedy"] > r["Sports"]
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `./manage.sh test`
Expected: FAIL, `SourceItem` hat kein Attribut `category`

- [ ] **Step 3: `SourceItem` erweitern und die Abfrage umbauen**

`fetch_new()` filtert zusätzlich auf `category = ANY($…)` mit `TUMBLR_CATEGORIES`, und das Dedup gegen `seen_sources` bleibt wie es ist. Genres, Anime-Tags und Titel kommen über `articles_rels` → `anime` → `anime_rels`/`anime_tags`. **Die Artikelzeilen dürfen sich durch den Join nicht vervielfachen**: entweder in SQL aggregieren (`array_agg` in Unterabfragen) oder eine zweite Abfrage je Artikel. `anime_count` zählt die verknüpften Anime; bei `> 1` liefern `genres`, `anime_tags` und `series_title` leere Werte, damit Slot 3–6 entfallen.

`genre_rarity()` ist ein `GROUP BY` über `anime_rels` mit `genres_id IS NOT NULL`.

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `./manage.sh test`
Expected: PASS

- [ ] **Step 5: Von Hand gegenprüfen**

Run: `./manage.sh cli compose 3`
Expected: Artikel aus `news`/`simulcast`, keine Duplikate in der Liste

- [ ] **Step 6: Commit**

```bash
git add social/build/app/sources/articles.py social/build/tests/test_tagging.py
git commit -m "feat(social): Genres, Anime-Tags und Kategorie aus der Postgres holen"
```

---

### Task 4: Tags und Kategorie bis zum Adapter durchreichen

**Files:**
- Modify: `social/build/app/channels/base.py`
- Modify: `social/build/app/db.py:16-39`
- Modify: `social/build/app/models.py:32-47`
- Modify: `social/build/app/batch.py:18-47`
- Modify: `social/build/app/poster.py:25-31`
- Create: `social/build/tests/test_draft_tags.py`

**Interfaces:**
- Consumes: `tagging.tags_for`, `articles.SourceItem` aus Task 3
- Produces:
  - `Post` zusätzlich: `tags: list[str] = field(default_factory=list)`, `category: str | None = None`
  - `models.enqueue(..., tags: list[str] | None = None, category: str | None = None)`
  - Spalten `drafts.tags` (JSON-Text) und `drafts.category` (TEXT)

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

```python
async def test_enqueue_speichert_tags_als_json(tmp_db):
    did = await models.enqueue(
        batch_day="2026-11-02", channel="tumblr", source_kind="article",
        source_ref="1", url="https://otakupulse.de/news/x", image_url=None,
        title="T", body="B", perishable=True,
        tags=["anime", "otakupulse", "sports"], category="simulcast",
    )
    d = await models.get_draft(did)
    assert json.loads(d["tags"]) == ["anime", "otakupulse", "sports"]
    assert d["category"] == "simulcast"

async def test_enqueue_ohne_tags_bleibt_leer(tmp_db):
    did = await models.enqueue(..., tags=None, category=None)
    d = await models.get_draft(did)
    assert d["tags"] is None
```

`tmp_db` ist eine neue Fixture in `conftest.py`: setzt `config.DB_PATH` auf eine Datei in `tmp_path` und ruft `db.init()`.

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `./manage.sh test`
Expected: FAIL, `enqueue() got an unexpected keyword argument 'tags'`

- [ ] **Step 3: Schema, `enqueue`, `Post` und die Aufrufer erweitern**

In `db.py` die Spalten ans `CREATE TABLE drafts` anhängen **und** idempotent nachrüsten, damit die bestehende `data/social.sqlite3` migriert: nach `executescript(SCHEMA)` für jede Spalte ein `ALTER TABLE drafts ADD COLUMN …` in `try/except` gegen `sqlite3.OperationalError` ("duplicate column name").

In `batch.ingest()` die Tags nur für den Kanal `tumblr` berechnen (`tagging.tags_for(...)` mit den Feldern aus `SourceItem` und `await articles.genre_rarity()`), und Artikel mit `tagging.is_excluded(...)` für Tumblr überspringen — die anderen Kanäle bekommen den Artikel weiterhin.

In `poster.py` beim Bauen des `Post` `tags=json.loads(d["tags"] or "[]")` und `category=d["category"]` mitgeben.

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `./manage.sh test`
Expected: PASS

- [ ] **Step 5: Migration an der echten Datenbank prüfen**

Run: `./manage.sh cli status` (oder ein Start mit `DRY_RUN=1`)
Expected: kein Fehler, `sqlite3 data/social.sqlite3 "select name from pragma_table_info('drafts')"` zeigt `tags` und `category`

- [ ] **Step 6: Commit**

```bash
git add social/build/app/channels/base.py social/build/app/db.py social/build/app/models.py social/build/app/batch.py social/build/app/poster.py social/build/tests/test_draft_tags.py
git commit -m "feat(social): Tags und Kategorie vom Ingest bis zum Adapter durchreichen"
```

---

### Task 5: Kanalweiser Trockenmodus

**Files:**
- Modify: `social/build/app/config.py`
- Modify: `social/build/app/poster.py:33-38`
- Create: `social/build/tests/test_poster_dryrun.py`
- Modify: `social/secrets.env.example` (Eintrag existiert bereits, nur verifizieren)

**Interfaces:**
- Consumes: nichts
- Produces: `config.DRY_RUN_CHANNELS: frozenset[str]`, `config.is_dry(channel: str) -> bool`

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

```python
def test_is_dry_bei_globalem_dry_run(monkeypatch):
    monkeypatch.setattr(config, "DRY_RUN", True)
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset())
    assert config.is_dry("tumblr") is True

def test_is_dry_nur_fuer_gelistete_kanaele(monkeypatch):
    monkeypatch.setattr(config, "DRY_RUN", False)
    monkeypatch.setattr(config, "DRY_RUN_CHANNELS", frozenset({"bluesky", "mastodon"}))
    assert config.is_dry("bluesky") is True
    assert config.is_dry("mastodon") is True
    assert config.is_dry("tumblr") is False
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `./manage.sh test`
Expected: FAIL, `config` hat kein `is_dry`

- [ ] **Step 3: `DRY_RUN_CHANNELS` und `is_dry()` ergänzen, `poster.py` umstellen**

`DRY_RUN_CHANNELS` wird wie `CHANNELS_ENABLED` aus einer kommaseparierten Umgebungsvariablen gelesen, Default `""`. `is_dry(channel)` ist `DRY_RUN or channel in DRY_RUN_CHANNELS`. In `poster.run_post_pass()` ersetzt `if config.is_dry(channel):` die Zeile `if config.DRY_RUN:`.

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `./manage.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add social/build/app/config.py social/build/app/poster.py social/build/tests/test_poster_dryrun.py
git commit -m "feat(social): kanalweiser Trockenmodus ueber DRY_RUN_CHANNELS"
```

---

### Task 6: Tumblr-Adapter

**Files:**
- Create: `social/build/app/channels/tumblr.py`
- Modify: `social/build/app/channels/registry.py`
- Modify: `social/build/app/config.py`
- Create: `social/build/tests/test_tumblr.py`

**Interfaces:**
- Consumes: `Channel`, `Post`, `PostResult` aus `channels/base.py`
- Produces:
  - `class Tumblr(Channel)` mit `name = "tumblr"`, `char_limit = 1000`
  - `build_npf_content(post: Post) -> list[dict]` — als Modulfunktion, damit sie ohne HTTP testbar ist
  - `config.TUMBLR_BLOG_IDENTIFIER`, `TUMBLR_CONSUMER_KEY`, `TUMBLR_CONSUMER_SECRET`, `TUMBLR_OAUTH_TOKEN`, `TUMBLR_OAUTH_TOKEN_SECRET`

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

```python
def test_npf_blockreihenfolge_mit_bild():
    p = Post(text="Taikis Doppel steht.", url="https://otakupulse.de/news/x",
             title="Blue Box S2 Folge 4", image_url="https://cdn/x.jpg",
             tags=["anime", "otakupulse"], category="simulcast")
    c = build_npf_content(p)
    assert [b["type"] for b in c] == ["image", "text", "text", "text", "text"]
    assert c[1]["text"] == "Simulcast"
    assert c[2]["subtype"] == "heading2"
    assert c[2]["text"] == "Blue Box S2 Folge 4"
    assert p.url in c[4]["text"]

def test_npf_ohne_bild_laesst_bildblock_weg():
    p = Post(text="T", url="https://otakupulse.de/news/x", title="H",
             image_url=None, category="news")
    c = build_npf_content(p)
    assert [b["type"] for b in c] == ["text", "text", "text", "text"]
    assert c[0]["text"] == "News"

def test_npf_ohne_kategorie_laesst_kicker_weg():
    p = Post(text="T", url="https://u", title="H", image_url=None, category=None)
    c = build_npf_content(p)
    assert [b["type"] for b in c] == ["text", "text", "text"]

async def test_post_gibt_retry_after_bei_429(httpx_mock):
    httpx_mock.add_response(status_code=429, headers={"Retry-After": "900"})
    r = await Tumblr().post(Post(text="T", url="https://u", title="H"))
    assert r.ok is False and r.retry_after == 900

async def test_post_sendet_tags_kommasepariert(httpx_mock):
    httpx_mock.add_response(status_code=201, json={"response": {"id": 42}})
    await Tumblr().post(Post(text="T", url="https://u", title="H",
                             tags=["anime", "urban fantasy"]))
    body = json.loads(httpx_mock.get_requests()[0].content)
    assert body["tags"] == "anime,urban fantasy"
    assert body["state"] == "published"
```

`pytest-httpx` in `requirements.txt` ergänzen.

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `./manage.sh test`
Expected: FAIL, `app.channels.tumblr` existiert nicht

- [ ] **Step 3: `build_npf_content` und `Tumblr.post` implementieren**

`build_npf_content` baut in dieser Reihenfolge, Teile ohne Daten entfallen: Bild-Block (`{"type": "image", "media": [{"url": post.image_url}]}`), Kicker-Text-Block mit der Kategorie als Anzeigename (`news` → „News", `simulcast` → „Simulcast"), `heading2` mit `post.title`, Fließtext, Link-Zeile mit `post.url`.

`Tumblr.post` schickt `POST https://api.tumblr.com/v2/blog/{TUMBLR_BLOG_IDENTIFIER}/posts` mit `{"content": …, "tags": ",".join(post.tags), "state": "published"}`. **Vor dem Senden jeden Tag durch `tagging.sanitize_tag` schicken** — ein Komma im Tag würde den Parameter zerreißen. Fehlerbehandlung genau wie in `channels/mastodon.py`: 429 → `retry_after` aus dem Header, `HTTPStatusError` → `PostResult(ok=False, error=…)`, keine eigene Retry-Logik.

**Authentifizierung zuerst verifizieren**, bevor der Code festgeschrieben wird: die Doku-Seiten sind alt und nennen kein vollständiges OAuth2-Beispiel für die Post-Route. Token-Endpunkt ist `https://api.tumblr.com/v2/oauth2/token`; OAuth 1.0a (HMAC-SHA1) ist die Alternative. Das Ergebnis dieser Prüfung gehört als Kommentar in den Modulkopf.

- [ ] **Step 4: `tumblr` in `registry._FACTORY` eintragen**

- [ ] **Step 5: Tests laufen lassen, Erfolg bestätigen**

Run: `./manage.sh test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add social/build/app/channels/tumblr.py social/build/app/channels/registry.py social/build/app/config.py social/build/requirements.txt social/build/tests/test_tumblr.py
git commit -m "feat(social): Tumblr-Adapter mit NPF-Post und Tag-Bereinigung"
```

---

### Task 7: Auto-Freigabe, Tageslimit, eigener Verfall

**Files:**
- Modify: `social/build/app/batch.py`
- Modify: `social/build/app/models.py:126-136`
- Modify: `social/build/app/poster.py`
- Modify: `social/build/app/config.py`
- Create: `social/build/tests/test_tumblr_flow.py`

**Interfaces:**
- Consumes: alles aus Task 4–6
- Produces:
  - `config.TUMBLR_MAX_POSTS_PER_DAY: int = 6`
  - `models.posted_today(channel: str) -> int`
  - `models.expire_due()` verfällt zusätzlich `approved`-Entwürfe

- [ ] **Step 1: Die fehlschlagenden Tests schreiben**

```python
async def test_tumblr_entwurf_wird_direkt_freigegeben(tmp_db):
    # nach ingest: state == 'approved' fuer tumblr, 'pending' fuer bluesky

async def test_expire_erfasst_auch_approved(tmp_db):
    # approved-Entwurf mit perishable_at in der Vergangenheit -> 'expired'

async def test_posted_today_zaehlt_nur_heute_und_kanal(tmp_db):
    # zwei tumblr-Posts heute, einer gestern, einer bluesky -> 2

async def test_post_pass_haelt_tageslimit_ein(tmp_db, monkeypatch):
    # TUMBLR_MAX_POSTS_PER_DAY=2, drei approved Entwuerfe -> nur zwei gehen raus,
    # der dritte wird 'expired', nicht aufgeschoben

async def test_post_pass_schickt_hoechstens_einen_tumblr_post(tmp_db):
    # zwei approved Entwuerfe, ein Durchlauf -> genau einer gepostet
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `./manage.sh test`
Expected: FAIL

- [ ] **Step 3: Die drei Änderungen umsetzen**

In `batch.ingest()`: nach `enqueue` für den Kanal `tumblr` sofort `models.approve(draft_id)`.

In `models.expire_due()`: die `WHERE`-Bedingung von `state='pending'` auf `state IN ('pending','approved')` erweitern. Das ist für Bluesky und Mastodon folgenlos, weil deren Entwürfe erst kurz vor dem Posten `approved` werden.

In `poster.run_post_pass()`: je Durchlauf höchstens **einen** Tumblr-Entwurf abarbeiten (der Lauf ist alle 2 Minuten, damit verteilen sich die 6 Posts). Vor dem Posten `models.posted_today("tumblr") >= config.TUMBLR_MAX_POSTS_PER_DAY` prüfen; ist das Limit erreicht, den Entwurf auf `expired` setzen statt aufzuschieben.

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `./manage.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add social/build/app/batch.py social/build/app/models.py social/build/app/poster.py social/build/app/config.py social/build/tests/test_tumblr_flow.py
git commit -m "feat(social): Tumblr ohne Einzelfreigabe, mit Tageslimit und eigenem Verfall"
```

---

### Task 8: Autorisierungs-Hilfsskript

**Files:**
- Create: `social/tools/tumblr_auth.py`
- Modify: `social/README.md`

**Interfaces:**
- Consumes: `TUMBLR_CONSUMER_KEY`/`SECRET` als Argumente oder aus der Umgebung
- Produces: ein eigenständiges Skript, kein Import aus `app/`

- [ ] **Step 1: Das Skript schreiben**

Läuft auf dem Rechner des Betreibers, nicht im Container. Öffnet einen kurzlebigen `http.server` auf **Port 8808** mit Pfad `/callback` — exakt die bei Tumblr registrierte URL —, gibt die Autorisierungs-URL zum Anklicken aus, nimmt den Code bzw. die Token entgegen und druckt die fertigen `secrets.env`-Zeilen auf die Konsole. **Das Skript schreibt nichts in Dateien und loggt keine Secrets.**

Das konkrete Verfahren richtet sich nach dem Ergebnis der Auth-Prüfung aus Task 6.

- [ ] **Step 2: Von Hand ausführen und ein Token erzeugen**

Run: `python3 social/tools/tumblr_auth.py`
Expected: Browser öffnet Tumblr, nach dem Bestätigen erscheinen die `secrets.env`-Zeilen auf der Konsole

- [ ] **Step 3: README um den Tumblr-Abschnitt ergänzen**

Einrichtung, die Rolle von `DRY_RUN_CHANNELS`, der Verweis auf `social/tumblr-theme/README.md` und die Stolperfalle, dass Tumblr Template-Tags auch in HTML-Kommentaren parst.

- [ ] **Step 4: Commit**

```bash
git add social/tools/tumblr_auth.py social/README.md
git commit -m "feat(social): Hilfsskript fuer die einmalige Tumblr-Autorisierung"
```

---

### Task 9: Telegram-Tagesmeldung statt Freigabe

**Files:**
- Modify: `social/build/app/batch.py`
- Modify: `social/build/app/texts_de.py`
- Modify: `social/build/app/poster.py` (`_note_posted`)

**Interfaces:**
- Consumes: `models.posted_today`
- Produces: `batch.tumblr_summary() -> str`

- [ ] **Step 1: Den fehlschlagenden Test schreiben**

```python
async def test_tagesmeldung_zaehlt_posts_und_nennt_links(tmp_db):
    # zwei geposteten tumblr-Entwuerfen -> Text enthaelt "2" und beide URLs

async def test_tagesmeldung_bei_null_posts(tmp_db):
    # keine Posts -> Text sagt das ausdruecklich, kein leerer String
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `./manage.sh test`
Expected: FAIL

- [ ] **Step 3: Tagesmeldung bauen und einhängen**

`tumblr_summary()` liest die heutigen Tumblr-Einträge und formuliert die Meldung (Anzahl, Links, verworfene wegen Tageslimit, Breaker-Trips). `run_daily()` hängt sie an den bestehenden Batch-Versand an. In `poster._note_posted()` die Einzelmeldung für den Kanal `tumblr` unterdrücken, damit nicht beide Wege melden.

- [ ] **Step 4: Tests laufen lassen, Erfolg bestätigen**

Run: `./manage.sh test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add social/build/app/batch.py social/build/app/texts_de.py social/build/app/poster.py social/build/tests/test_tumblr_flow.py
git commit -m "feat(social): taegliche Tumblr-Meldung statt Einzelfreigabe"
```

---

### Task 10: Deployment als Coolify-Service

**Files:**
- Create: `social/DEPLOY.md`
- Modify: `social/README.md`

**Interfaces:**
- Consumes: das fertige Image aus `social/build/`
- Produces: kein Code — eine nachvollziehbare Deploy-Anleitung plus die
  Compose-Erweiterung, die in Coolify eingetragen wird

Dieser Task schreibt **keinen** Python-Code und hat keinen Testzyklus im
üblichen Sinn. Er ist trotzdem ein eigener Task, weil ohne ihn nichts
ausgeliefert wird.

- [ ] **Step 1: Compose-Fragment für den Service schreiben**

Ein `social`-Container im Compose des Coolify-Service `otakupulse`
(uuid `ei9kq0mxqajfydp1vcydbnyg`), im selben Netz wie `otakupulse-db`:
Image aus `social/build/`, `PG_HOST=otakupulse-db`, `PG_USER=social_ro`,
`DB_PATH=/data/social.sqlite3` und ein **persistentes Volume auf `/data`**.
Ohne das Volume verliert jeder Redeploy den Dedup-Zustand und der nächste
Lauf postet alles erneut.

- [ ] **Step 2: `social/DEPLOY.md` schreiben**

Compose-Fragment, die vollständige Liste der Service-Umgebungsvariablen
(Namen, keine Werte), der Weg zum Erstdeploy, und wie man Logs liest. Dazu
ausdrücklich: `manage.sh` ist lokal, Coolify ist produktiv.

- [ ] **Step 3: Prüfen, dass die Datenbank erreichbar ist**

Nach dem Deploy aus dem Container heraus eine Leseabfrage gegen
`otakupulse-db` als `social_ro`.
Expected: Zeilenzahl aus `articles`, kein Verbindungsfehler

- [ ] **Step 4: Commit**

```bash
git add social/DEPLOY.md social/README.md
git commit -m "docs(social): Deployment als Coolify-Service auf dem VPS"
```

---

## Inbetriebnahme (nach Task 10, von Hand)

Kein Code, aber ohne diese Schritte geht nichts live. Reihenfolge einhalten.

1. **Deploy mit `DRY_RUN=1`** in den Coolify-Service, Volume auf `/data`
   gesetzt. Dann `seed` ausführen — ohne `seed` erzeugt der erste Lauf
   über tausend Entwürfe.
2. Einen vollen Tag trocken laufen lassen. Die Tag-Zeilen von mindestens 30
   Artikeln quer über `news` und `simulcast` von Hand durchsehen. Jeder
   peinliche oder explizite Tag ist ein Grund, `TAG_BLOCKLIST` zu erweitern
   und erneut zu prüfen.
3. `DRY_RUN=0` **mit** `DRY_RUN_CHANNELS=bluesky,mastodon`, und
   `TUMBLR_BLOG_IDENTIFIER` auf einen **Test-Tumblr** zeigend.
4. Ersten echten Post im Browser prüfen: sitzt das Cover links? Wenn das
   erste Bild nicht als erstes Kind in `.op-body` ankommt, den Selektor in
   `social/tumblr-theme/theme.html` nachziehen (siehe dortige README).
5. `TUMBLR_BLOG_IDENTIFIER` auf den Marken-Blog umstellen.
6. Den Tumblr-Consumer-Secret neu erzeugen — der alte stand in einem
   Screenshot.
7. Die App unter `tumblr.com/oauth/apps` von `Otaku` auf `OtakuPulse`
   umbenennen; der Name erscheint öffentlich als „via <Name>“ an jedem Post.
