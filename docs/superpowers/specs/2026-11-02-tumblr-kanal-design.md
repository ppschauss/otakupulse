# Tumblr-Kanal für den OtakuPulse-Social-Agent

Entwurfsdokument, 2026-11-02. Grundlage für die Umsetzungsplanung.

## Intent

OtakuPulse soll auf mehr Social-Kanälen präsent sein. Tumblr ist der erste
Zuwachs nach Bluesky und Mastodon, weitere Kanäle folgen. Ein automatisch
bespielter Tumblr-Blog verteilt Links zurück auf otakupulse.de und erzeugt
Nennungen der Marke in einer sehr großen, aktiven Anime-Community.

**Was Tumblr nicht leistet:** ausgehende Links in Tumblr-Posts tragen keine
Linkkraft (`rel="nofollow"`). Rankings über Backlinks sind nicht das Ziel und
dürfen nicht als Erfolgsmaßstab herangezogen werden. Das Ziel ist Reichweite:
Referral-Traffic, Marken-/Entity-Nennungen und indexierbare Seiten, die
OtakuPulse als Quelle nennen.

## Ziele

- Neue publizierte Artikel landen ohne manuelle Arbeit als Tumblr-Post.
- Jeder Post trägt das festgelegte Tag-Schema, weil über Tags die
  Entdeckung auf Tumblr läuft.
- Der Kanal reiht sich in den bestehenden Social-Agent ein, statt ein zweites
  System zu sein.
- Die Blog-Seite `otakupulse-de.tumblr.com` sieht nach OtakuPulse aus.

## Nicht-Ziele

- Kein Reblog-, Ask- oder Antwort-Betrieb. Nur eigene Posts raus.
- Keine Tumblr-spezifische Redaktion. Die Formulierung kommt aus dem
  bestehenden `compose.py`-Lauf.
- Keine Migration von Bluesky/Mastodon. Deren Verhalten bleibt unverändert.
- Kein Backfill der 1161 Altartikel (siehe „Volumen").

## Anti-Ziele

Wenn eines davon eintritt, ist das Projekt gescheitert, auch wenn es technisch
läuft:

- Der Blog sieht nach RSS-Bot aus — blanker Titel plus Link, Hashtag-Wand.
- Explizite oder peinliche Tags an Marken-Posts. Die AniList-Tag-Sammlung
  enthält beides (siehe Befund 2), und ein `#heterosexual` unter einer
  Episoden-Meldung ist ein Marken-Schaden, kein Schönheitsfehler.
- Tumblr stuft den Blog als Spam ein, weil in einer Simulcast-Nacht 40 Posts
  in Serie rausgehen.
- Doppelposts nach einem Neustart.

## Rahmenbedingungen: was schon existiert

Der Social-Agent liegt im Repo unter `social/`; der Code unter
`social/build/app/`, die Pfade in der Tabelle sind relativ dazu.

**Wo das läuft (geprüft 2026-11-02):** OtakuPulse läuft produktiv auf dem VPS
`onecom-vps` als **Coolify-Service** `otakupulse`
(uuid `ei9kq0mxqajfydp1vcydbnyg`, Docker-Netz gleichen Namens). Darin unter
anderem `otakupulse-app` (bedient `www.otakupulse.de`), `otakupulse-enrich`,
`otakupulse-companion` und `otakupulse-db` (postgres:16-alpine). Die Kopie
auf dem Unraid-Host ist der Altstand: dortige Container sind gestoppt, und
die dort noch laufende Postgres ist eingefroren (neuester Artikel
2026-10-25 gegenüber 2026-11-02 in der Produktion). **Alle Zahlen in diesem
Dokument stammen aus der Produktionsdatenbank auf dem VPS.**

Der Social-Agent existiert dort noch nicht — er ist auf dem VPS ein
Neuzugang. `manage.sh` bleibt das Werkzeug für lokale Entwicklung und Tests;
ausgeliefert wird über Coolify (siehe „Deployment“).

| Datei | Rolle |
|---|---|
| `app/sources/articles.py` | liest publizierte Artikel aus der Postgres (Rolle `social_ro`) |
| `app/compose.py` | ein Anthropic-Call je Artikel, formuliert für alle aktiven Kanäle |
| `app/channels/base.py` | `Channel`-Interface, `Post`- und `PostResult`-Dataclass |
| `app/channels/registry.py` | `CHANNELS_ENABLED` → Adapter-Instanz |
| `app/poster.py` | Post-Lauf mit Breaker, Retry (max 3), `DRY_RUN`-Kurzschluss |
| `app/models.py` | SQLite: `drafts`, `posted_log`, `seen_sources`, `channel_state` |
| `app/batch.py` | täglicher Telegram-Freigabe-Batch |

`channels/mastodon.py` ist die Vorlage für einen Adapter: HTTP-Call, 429 →
`retry_after`, Fehler als `PostResult(ok=False)`, keine eigene Fehlerbehandlung
darüber hinaus.

**Zwei Lücken**, die der Tumblr-Kanal aufreißt:

1. `Post` in `channels/base.py` hat kein Tag-Feld (`text`, `url`, `title`,
   `image_url`). Tags müssen von der Quelle bis zum Adapter durchgetragen
   werden.
2. Der Agent ist bewusst freigabepflichtig („nichts geht ungeprüft raus",
   README). Tumblr soll automatisch laufen. Siehe „Freigabe".

## Getroffene Entscheidungen

### Design: Richtung „Editorial Dark"

Vom Auftraggeber aus drei Vorlagen gewählt. Eine Spalte, Cover klein links,
Schlagzeile groß, ein Satz Anreißer, Kategorie-Pille, Tag-Zeile, Quellenzeile
mit Link. Tokens aus `frontend/src/app/(frontend)/styles.css`:
Grund `#09090b`, Akzent `#ff4d6d`, Zweitakzent `#8b5cf6`, Zinc-Graustufen.

Mockup: <https://claude.ai/artifact/UWAJgqaFis4HdUNB7CXfnh>

Das Theme betrifft nur die Seite `otakupulse-de.tumblr.com`. Im Dashboard und in
der App — wo die Reichweite entsteht — wird kein Theme gerendert, sondern nur
der einzelne Post. Deshalb ist der Post-Aufbau (Bild, Schlagzeile, Tags) der
wichtigere Teil, und das Theme ein einmaliger Nebenschauplatz.

### Tag-Schema: sechs Slots, feste Reihenfolge

Vom Auftraggeber festgelegt, Slot 6 auf Empfehlung ergänzt:

```
#anime  #otakupulse  #genre1  #tag1  #tag2  #serientitel
```

Die ersten zwei sind konstant. Slot 3–6 kommen aus den Daten. Mehr Tags gibt
es nicht; Season- und Kategorie-Tags wurden bewusst abgewählt.

Hinweis zur Einordnung: dass Tumblr nur die ersten 20 Tags in die Tag-Feeds
aufnimmt, ist verbreitetes Community-Wissen, steht aber **nicht** in der
offiziellen API-Doku. Bei sechs Tags ist das folgenlos — es sollte nur niemand
später eine Zahl darauf stützen.

### Herleitung von Slot 3–6

Verknüpfung: `articles_rels.anime_id` → `anime`. Bei **1158 von 1161**
publizierten Artikeln gesetzt, die Slots sind also praktisch immer füllbar.
Gibt es keinen verknüpften Anime, entfallen Slot 3–6 und der Post geht mit
`#anime #otakupulse` raus. Bei mehreren verknüpften Anime entfällt nur Slot 6
(siehe „Umfang“ weiter unten).

**Slot 3 `#genre1`** — das *seltenste* Genre des Anime, gemessen an der
Häufigkeit im eigenen Katalog, nicht das erste gespeicherte (Befund 3).
`Ecchi` und `Hentai` sind hart gesperrt und werden übersprungen, auch wenn sie
die seltensten wären.

**Slot 4+5 `#tag1 #tag2`** — die zwei höchstgerankten Einträge aus
`anime_tags` unter allen folgenden Bedingungen:

```sql
coalesce(t.is_adult, false) = false
and t.category in ('theme', 'setting')     -- 'element' ist die Deskriptor-Halde
and coalesce(at_.rank, 0) >= 60
and t.name not in (<Deskriptor-Sperrliste>)
```

Sperrliste als Startwert, beim Bau an echten Daten zu erweitern:
`Heterosexual`, `Primarily Teen Cast`, `Primarily Adult Cast`,
`Primarily Female Cast`, `Primarily Male Cast`, `Primarily Child Cast`,
`Male Protagonist`, `Female Protagonist`, `Ensemble Cast`, `Nudity`, `CGI`,
`Episodic`.

Reicht es nicht für zwei Tags, wird mit dem nächsten Genre aufgefüllt; reicht
es auch dafür nicht, bleibt der Post bei weniger Tags. Nie auffüllen durch
Absenken der Filter.

**Slot 6 `#serientitel`** — Auf Tumblr folgen Leute Serien-Tags, nicht
Genre-Tags; das ist der stärkste einzelne Reichweiten-Hebel im Schema. Genau
deshalb ist der rohe Datenbanktitel falsch: `#blue box season 2` ist ein toter
Tag, `#blue box` der Fandom-Tag. Normalisierung (meine Festlegung, nicht die
des Auftraggebers):

1. `anime.title_english`, sonst `anime.title_romaji`
2. kleingeschrieben
3. Staffel-Suffixe am Ende streichen, case-insensitiv:
   `season <n>`, `<n>(st|nd|rd|th) season`, `final season`, `part <n>`,
   `cour <n>`, eine angehängte arabische oder römische Zahl (`2`, `ii`, `iii`)
4. alles ab dem ersten `:` oder `,` streichen (Subtitel)
5. Rand-Satzzeichen und Mehrfach-Leerzeichen bereinigen

Reicht das Ergebnis nicht auf mindestens 3 Zeichen oder bleibt nur ein
generisches Einzelwort übrig, entfällt Slot 6 — besser kein Tag als ein
falscher.

Dazu eine Override-Tabelle `SERIES_TAG_OVERRIDES: dict[str, str | None]` in
`tagging.py`, Schlüssel ist die Anime-ID oder der Rohtitel. Die Heuristik wird
bei einigen Titeln danebenliegen (`Tensei Kizoku, Kantei Skill de Nariagaru
3rd Season` → `#tensei kizoku` ist bereits grenzwertig mehrdeutig); ein
Eintrag in der Tabelle muss das ohne Codeänderung korrigieren können, `None`
unterdrückt Slot 6 für diesen Titel.

**Adult-Ausschluss auf Artikelebene** (meine Festlegung): ist `anime.isHentai`
gesetzt oder enthält der Titel das Genre `Hentai`, wird der Artikel **gar
nicht** auf Tumblr gepostet — nicht nur das Genre-Tag unterdrückt. Sonst
landen Cover und expliziter Serientitel am Marken-Blog, was dasselbe
Anti-Ziel trifft wie `#heterosexual` und zudem Tumblrs eigene
Adult-Content-Regeln für den Blog berührt. Bei `Ecchi` geht der Post raus,
aber ohne Slot 6 und ohne `#ecchi`. Im Katalog betrifft das 788 Hentai- und
815 Ecchi-Einträge.

Alle Tags kleingeschrieben, Leerzeichen bleiben erhalten (Tumblr-Tags dürfen
Leerzeichen enthalten: `#urban fantasy` ist ein Tag, nicht zwei). Deutsche
Tags kommen nicht vor — die Fandom-Tags sind englisch, deutsche Begriffe haben
kein Volumen.

Verifizierte Beispielausgaben dieser Regeln gegen die Live-Datenbank:

| Artikel | Anime | Ergebnis |
|---|---|---|
| Blue Box S2 Episode 4 | Ao no Hako Season 2 | `#anime #otakupulse #sports #coming of age #school #blue box` |
| Dandadan | Dandadan | `#anime #otakupulse #supernatural #urban fantasy #youkai #dandadan` |
| Overgeared Episode 5 | Tempal: Item no Chikara | `#anime #otakupulse #adventure #virtual world #video games #overgeared` |

### Drei Befunde aus der Datenbank

Alle gegen die laufende Postgres geprüft, nicht geschätzt. Sie sind der Grund
für die Regeln oben; wer sie ignoriert, baut etwas Kaputtes.

**Befund 1 — `articles.tags` ist leer.** Belegt bei 6 von 1161 publizierten
Artikeln. Als Quelle für `#tag1 #tag2` fällt das Feld aus. Stattdessen
`anime_tags` des verknüpften Anime: gefüllt bei 10 202 von 11 058 Anime, und
mit `rank` zum Sortieren.

**Befund 2 — die höchstgerankten Tags sind unbrauchbar.** Die AniList-Tags
sind Metadaten, keine Fandom-Tags. Nach `rank` sortiert stehen oben
Cast-Beschreibungen; Blue Box ergäbe wörtlich `#primarily teen cast
#heterosexual`. Darunter liegen explizite Tags wie `Nudity`, und hinter
`is_adult` sehr viel Expliziteres. Mit den Filtern oben wird daraus
`#school #badminton`.

**Befund 3 — `anime_rels.order` sortiert Genres alphabetisch**, nicht nach
Gewicht. „Erstes Genre" heißt deshalb fast immer `#action`, `#adventure` oder
`#comedy` — die größten und zugedecktesten Tags auf Tumblr, in denen ein neuer
Blog unsichtbar ist. Genre-Häufigkeit im eigenen Katalog als Maß für
Spezifität: `Comedy` 4867, `Action` 3144, `Fantasy` 2686, `Drama` 2161,
`Slice of Life` 2079, `Adventure` 1937, `Romance` 1925, `Sci-Fi` 1796,
`Supernatural` 1354, `Ecchi` 815, `Hentai` 788, `Mystery` 725, `Mecha` 639,
`Music` 592, `Sports` 553, `Psychological` 451, `Horror` 327,
`Mahou Shoujo` 317, `Thriller` 193.

### Freigabe: automatisch, mit Tagesmeldung

Der Auftraggeber will den Kanal automatisch. Das weicht vom Prinzip des
bestehenden Agents ab, deshalb explizit:

Tumblr-Entwürfe gehen **ohne Einzelfreigabe** raus. Sie werden bei der
Erzeugung direkt als freigegeben markiert und vom normalen `poster.py`-Lauf
abgeholt; Bluesky und Mastodon bleiben freigabepflichtig. Statt der Freigabe
gibt es eine Telegram-Tagesmeldung: wie viele Tumblr-Posts rausgingen, mit
Links, plus jede Drosselung oder jeder Breaker-Trip.

Diese Entscheidung ist meine, nicht die des Auftraggebers — er hat
„automatisch" gesagt, nicht „ohne Freigabe-Mechanik". Die Kompensation ist der
Pflicht-Trockenlauf unten: `DRY_RUN=1`, bis die Tag-Ausgabe über mindestens
einen vollen Simulcast-Tag hinweg stichprobenfest ist.

## Was gebaut wird

### 1. `app/tagging.py` (neu)

Reine Funktion, kein LLM, kein I/O:

```python
def tags_for(genres: list[str], anime_tags: list[tuple[str, str, int]],
             series_title: str | None, genre_rarity: dict[str, int]) -> list[str]
```

Nimmt die Rohdaten eines Artikels, gibt die fertige, kleingeschriebene
Tag-Liste in Schema-Reihenfolge zurück. Sperrliste, Rangschwelle und
Kategorie-Filter sind Modulkonstanten. Das ist der Teil mit den Regeln und
damit der Teil, der Tests braucht.

`genre_rarity` wird beim Start einmal aus der Postgres geladen (ein `GROUP BY`
über `anime_rels`) und im Prozess gehalten; die Zahlen ändern sich im
Stundenmaßstab nicht.

### 2. `app/sources/articles.py` erweitern

`SourceItem` bekommt die Felder, die `tagging.py` und der Post-Aufbau
brauchen: `genres`, `anime_tags`, `series_title`, `category` und
`is_hentai`. Dazu ein Join über `articles_rels` →
`anime` → `anime_rels`/`anime_tags`/`genres`/`tags`. Bestehendes Verhalten
(Dedup über `seen_sources`, `_status='published'`, Sortierung nach
`publish_date`) bleibt unberührt. Wichtig: der Join darf die Artikelzeilen
nicht vervielfachen — Aggregation in SQL oder eine zweite Abfrage je Artikel.

### 3. `Post` und `drafts` um Tags erweitern

- `channels/base.py`: `Post` bekommt `tags: list[str] = field(default_factory=list)`.
  Kanal-agnostisch; Bluesky und Mastodon ignorieren das Feld vorerst.
- `models.py`/SQLite: Spalte `tags` auf `drafts` (JSON-Text), damit die Tags
  von der Erzeugung bis zum Post-Lauf überleben. Migration muss auf der
  bestehenden `data/social.sqlite3` idempotent laufen.
- `poster.py`: Tags beim Bauen des `Post` mitgeben.

Tags entstehen beim Ingest, nicht im `compose.py`-Call. Das Modell formuliert
den Text; die Tags sind Daten und dürfen nicht halluziniert werden.

### 4. `app/channels/tumblr.py` (neu)

`POST https://api.tumblr.com/v2/blog/{blog-identifier}/posts`, Neue Post
Format: `content` als Block-Liste, `tags` als kommaseparierte Zeichenkette,
`state: "published"`.

Post-Aufbau, passend zum gewählten Design:

1. Bild-Block mit `post.image_url` (Artikel-Cover), falls vorhanden
2. Text-Block mit der Kicker-Zeile aus `articles.category`
   („Simulcast“, „News“, „Guide“ …) — das ist die Datenquelle für die
   Kategorie-Pille im Theme
3. Text-Block `heading2` mit der Schlagzeile
4. Text-Block mit dem formulierten Text aus `compose.py`
5. Text-Block mit dem Link auf otakupulse.de

Das Bild bleibt der **erste** Block, weil das Theme das Cover über
`.op-body > figure:first-child` nach links holt. Das Dashboard-Mockup zeigt
die Schlagzeile über dem Bild — das war die Darstellung von Tumblrs eigener
Karte, nicht eine Aussage über die Blockreihenfolge. NPF-Blöcke folgen strikt
aufeinander, eine Schlagzeile über dem Bild ist nicht herstellbar.

Rückgabe wie bei den anderen Adaptern: `PostResult(ok=True, external_id=…)`,
bei 429 `retry_after` aus dem Header, Fehler als Text. Keine eigene
Retry-Logik — das macht `poster.py`.

Zu verifizieren beim Bau (die Doku-Seiten sind alt, und die Suche hat kein
vollständiges OAuth2-Beispiel für die Post-Route hergegeben):

- ob die Post-Route OAuth 1.0a (HMAC-SHA1) oder ein OAuth2-Bearer-Token
  erwartet. Token-Endpunkt ist `https://api.tumblr.com/v2/oauth2/token` mit
  Authorization-Code- und Refresh-Token-Grant.
- die Refresh-Mechanik, falls OAuth2: ein ablaufendes Token in einem
  Dauerläufer-Container muss erneuert und persistiert werden, sonst steht der
  Kanal nach Tagen still.

Offiziell belegte Limits: **250 veröffentlichte Posts pro Tag und Nutzer**,
1000 API-Calls pro Stunde und 5000 pro Tag je Consumer-Key, 429 bei
Überschreitung. NPF-Posts sind auf 1 MB Gesamtgröße begrenzt.

### 5. Volumen und Drosselung

Von 1161 publizierten Artikeln sind 668 `simulcast` (Episoden-Meldungen) und
402 `news`. In einer Simulcast-Nacht entstehen entsprechend viele Artikel
gleichzeitig. Ungebremst sieht das auf Tumblr nach Bot aus, lange bevor das
250er-Limit greift.

- Harte Obergrenze Tumblr-Posts pro Tag, als Config-Wert mit konservativem
  Default (Vorschlag: 12). Darüber wird nicht gepostet, nicht aufgestaut.
- Mindestabstand zwischen zwei Posts, als Config-Wert (Vorschlag: 20 Minuten),
  damit die Posts über den Tag verteilt statt in Serie erscheinen.
- Bei Überschreitung: verwerfen, nicht aufschieben. Eine Halde wäre
  schlimmer als ein verpasster Post.
- **Eigener Verfall nötig.** `models.expire_due()` verfällt nur Entwürfe im
  Zustand `pending`. Tumblr-Entwürfe sind ab Erzeugung `approved` und
  verfallen damit nie von selbst — ohne eigene Logik geht eine
  Episoden-Meldung Tage später raus. Das gilt unabhängig davon, wie die
  Taktfrage unten entschieden wird.
- **Bekannte Enge im Ingest.** `articles.fetch_new()` holt nur die
  `max(limit*6, 40)` neuesten Artikel und filtert erst danach in Python gegen
  `seen_sources`. Stauen sich mehr als 40 ungesehene Artikel, fallen die
  älteren dauerhaft aus dem Fenster. Bei höherem Takt muss das Fenster an die
  Datenbankabfrage wandern (`NOT EXISTS` gegen `seen_sources`).
- Kein Backfill. Die Altartikel werden wie bei der Erstinbetriebnahme des
  Agents über `manage.sh seed` als „gesehen" markiert. Sonst entstehen beim
  ersten Lauf über tausend Entwürfe.

### 6. Theme

Eine Datei `social/tumblr-theme/theme.html`: Tumblr-Theme-HTML mit Tumblrs
Template-Variablen (`{Title}`, `{block:Posts}`, `{block:Tags}` …), Design wie
oben, einmalig im Tumblr-Theme-Editor eingesetzt. Kein Deploy-Pfad, kein
Automatismus — aber versioniert, damit Änderungen nachvollziehbar sind.

Das Theme ist der kleinste Teil des Projekts und sollte nicht als erstes
gebaut werden, weil es die Reichweite nicht beeinflusst.

### 7. Config und Secrets

Nach dem Muster von `secrets.env.example`:
`TUMBLR_BLOG_IDENTIFIER`, `TUMBLR_CONSUMER_KEY`, `TUMBLR_CONSUMER_SECRET`,
Token-Felder je nach Auth-Verfahren, `TUMBLR_MAX_POSTS_PER_DAY`,
`TUMBLR_MIN_GAP_MINUTES`. `tumblr` in `CHANNELS_ENABLED` und in
`registry._FACTORY`.

### 8. Deployment: Coolify-Service auf dem VPS

Der Agent wird **kein** eigener Dienst auf Unraid. Er kommt als weiterer
Container in das Compose des bestehenden Coolify-Service `otakupulse`
(uuid `ei9kq0mxqajfydp1vcydbnyg`). Das ist die einzige Stelle, von der aus er
`otakupulse-db` erreicht, ohne die Datenbank nach außen zu öffnen.

- `PG_HOST=otakupulse-db`, `PG_PORT=5432`, `PG_DB=otakupulse`,
  `PG_USER=social_ro`. Die Rolle existiert auf der Produktionsdatenbank
  bereits (geprüft 2026-11-02).
- Das Image wird aus `social/build/` gebaut. Ob Coolify es selbst baut oder
  eine Registry nötig ist, hängt an der Service-Konfiguration und gilt beim
  Bau zu klären.
- Alle Secrets als Service-Umgebungsvariablen in Coolify, nicht als Datei im
  Container und nicht im Repo.
- Die SQLite-Zustandsdatei (`drafts`, `posted_log`, `seen_sources`) braucht ein
  **persistentes Volume**. Ohne das verliert ein Redeploy den Dedup-Zustand,
  und der nächste Lauf postet alles erneut.
- `manage.sh` bleibt für lokale Entwicklung und Tests. Es ist ab jetzt
  ausdrücklich **kein** Deploy-Weg mehr.

**Eingriff in die Produktion:** Das Compose dieses Service bedient auch
`www.otakupulse.de`. Eine Änderung daran ist ein Eingriff in die laufende
Seite und gehört abgestimmt, nicht nebenbei gemacht.

## Verifikation

Der Trockenlauf ist hier nicht optional, weil es keine Einzelfreigabe gibt.

1. **Tests für `tagging.py`** gegen echte Datenbankzeilen, mindestens: die
   drei Beispiele aus der Tabelle oben, ein Artikel ohne verknüpften Anime,
   ein Anime mit nur einem zulässigen Tag, ein Anime mit `is_adult`-Tags, ein
   Ecchi/Hentai-Titel.
2. **`manage.sh cli compose`-Vorschau**: Tag-Zeilen von mindestens 30
   Artikeln quer über die Kategorien von Hand durchsehen. Jeder peinliche oder
   explizite Tag darin ist ein Grund, die Sperrliste zu erweitern und erneut
   zu prüfen.
3. **`DRY_RUN=1` über mindestens einen vollen Simulcast-Tag**, inklusive der
   Drosselung: greifen Tagesgrenze und Mindestabstand wie gedacht?
4. Erst dann `DRY_RUN=0`, und zwar zuerst gegen einen **Test-Tumblr**, nicht
   gegen den Marken-Blog.
5. `manage.sh seed` vor dem Echtbetrieb. Ohne diesen Schritt erzeugt der erste
   Lauf über tausend Entwürfe.

Erfolgsmaßstab nach vier Wochen: Referral-Sitzungen von tumblr.com in der
Analytics und die Zahl der Posts, die überhaupt Reblogs oder Likes bekommen.
Nicht: Rankings, nicht Backlink-Zahlen.

## Was dem Builder überlassen bleibt

- Tag-Berechnung in SQL oder in Python (`tagging.py`) — die Regeln stehen
  fest, der Ort nicht. Python ist testbarer, SQL spart eine Runde.
- Form der Drosselung: eigene Tabelle, Spalte auf `channel_state`, oder
  Ableitung aus `posted_log`.
- Konkrete NPF-Blockstruktur innerhalb der vier beschriebenen Blöcke.
- Aufbau des Theme-HTML.
- Erweiterung der Deskriptor-Sperrliste beim Durchsehen der echten Ausgabe.

## Entschieden am 2026-11-02 (nach dem Builder-Review)

### Takt: beim bestehenden Tagesbatch bleiben

Kein eigener Tumblr-Ingest. Tumblr hängt sich an `batch.run_daily()` um 18:00
und an `MAX_DRAFTS_PER_BATCH = 6`. Folgen, die bewusst in Kauf genommen
werden:

- Höchstens 6 Tumblr-Posts pro Tag, alle zwischen 18:00 und etwa 20:00.
- Episoden-Meldungen gehen teils einen Tag nach dem Simulcast raus.
- Die ursprünglich geplanten Drosselwerte (12/Tag, 20 Minuten Abstand)
  **entfallen** — der Ingest begrenzt das Volumen bereits härter. Ein
  Mindestabstand von etwa 3 Minuten zwischen zwei Tumblr-Posts bleibt
  sinnvoll, damit die 6 Posts nicht als Block in derselben Minute erscheinen;
  das erledigt der ohnehin alle 2 Minuten laufende `post_pass`, wenn er je
  Durchlauf höchstens einen Tumblr-Post abarbeitet.
- `MAX_DRAFTS_PER_BATCH` wird **nicht** erhöht. Das Nicht-Ziel
  „Bluesky/Mastodon bleiben unverändert“ bleibt damit gehalten.
- Die Enge in `fetch_new()` (Fenster von 40 Artikeln) bleibt bestehen und ist
  bei 6 Entwürfen pro Tag unkritisch. Steigt der Takt später doch, muss das
  Fenster zuerst in die SQL-Abfrage wandern.

Eigener Verfall bleibt trotzdem nötig: `models.expire_due()` fasst nur
`pending` an, auto-freigegebene Tumblr-Entwürfe verfallen also nie von selbst.

### Scharfschalten: kanalweises Trockenflag

`DRY_RUN_CHANNELS` kommt in den Projektumfang. Semantik: eine Kanalliste, die
trotz `DRY_RUN=0` weiter trocken läuft. Startwert
`DRY_RUN_CHANNELS=bluesky,mastodon`, damit Tumblr allein echt postet.

Hintergrund (geprüft in `data/social.sqlite3`): der Agent hat **nie** extern
gepostet. Alle 30 als `posted` markierten Entwürfe tragen eine `external_id`
der Form `dry-N` vom 17.–19.07.2026; dazu 763 `expired`, 69 `rejected`, 14
`pending`. Letzte Aktivität 19.07.2026, der Container `otakupulse-social`
existiert derzeit nicht. Ohne kanalweises Flag hätte `DRY_RUN=0` Bluesky und
Mastodon im selben Moment zum ersten Mal überhaupt live geschaltet, samt der
14 alten `pending`-Entwürfe.

Die 14 `pending` und die 763 `expired` werden **nicht** angefasst — sie
bleiben liegen, weil Bluesky und Mastodon trocken bleiben.

### Umfang: nur `news` und `simulcast`

Auf Tumblr gehen ausschließlich Artikel der Kategorien `news` (402) und
`simulcast` (668), zusammen 1070 von 1161. Ausgeschlossen sind `ranking` (36),
`guide` (20), `editorial` (18), `review` (9) und `seasonal_preview` (8).

Grund: `Articles.relatedAnime` ist `hasMany`, und bei genau diesen Kategorien
hängen mehrere Anime an einem Artikel. Ein Season-Überblick bekäme sonst die
Tags eines willkürlich gewählten Einzeltitels — das Falsch-Tagging aus den
Anti-Zielen.

Umsetzung: Der Filter gehört **nicht** in `articles.fetch_new()`, sondern in
den kanalspezifischen Pfad in `batch.ingest`. `fetch_new()` wird von allen
Kanälen gemeinsam benutzt; ein Filter dort nähme auch Bluesky und Mastodon
die übrigen Kategorien weg. `SourceItem.category` trägt den Wert,
`TUMBLR_CATEGORIES` steht als Konstante in `articles.py`.

**Mehrere verknüpfte Anime** (geprüft an der Produktion: 94 `news`- und 185
`simulcast`-Artikel, bis zu 12 Anime an einem Artikel — zusammen 279 von 1070):
Dort entfällt **nur Slot 6**, der Serientag. Genres und Anime-Tags bleiben,
aggregiert über alle verknüpften Anime. Das Anti-Ziel ist ein falscher
*Serientag* unter einem Sammelartikel; aggregierte Genres und Tags
beschreiben den Artikel dagegen zutreffend. Würden auch sie entfallen,
bekäme ein Viertel aller Posts nur die zwei festen Tags und wäre praktisch
unauffindbar.

Die naheliegende Verschärfung „ein Tag muss auf der Hälfte der verknüpften
Anime vorkommen“ wurde an der Produktion gemessen und ist **schlechter**: ein
Wochenrückblick über acht Serien bekäme damit gar keinen Tag mehr, ein
anderer `#chibi`, ein dritter `#foreign`. Sammelartikel haben keine
gemeinsamen spezifischen Tags.

Gibt es **gar keinen** verknüpften Anime, entfallen Slot 3–6 und der Post
geht mit `#anime #otakupulse` raus.

Die ausgeschlossenen Kategorien sind die evergreen-fähigen Inhalte. Wenn der
Kanal läuft, lohnt ein zweiter Blick darauf — mit einem eigenen Tag-Schema
für Mehrfach-Anime-Artikel. Das ist ausdrücklich nicht Teil dieser Runde.

## Offen, außerhalb des Codes

- **Blog-Name/Handle**: `otakupulse-de.tumblr.com` muss registriert werden oder
  ist schon vergeben. Das Handle wandert in `TUMBLR_BLOG_IDENTIFIER`.
- **Tumblr-App registriert** (2026-11-02). Consumer Key und Secret liegen in
  `social/secrets.env`; die Platzhalter stehen in `secrets.env.example`. Der
  App-Name erscheint öffentlich als „via <Name>“ an jedem Post und sollte
  `OtakuPulse` lauten.
- **Callback-URL geklärt**: Tumblr hat `http://localhost:8808/callback` in
  beiden Feldern (OAuth1-Callback und OAuth2-Weiterleitung) akzeptiert. Die
  einmalige Autorisierung läuft damit auf dem Rechner des Betreibers: ein
  kurzlebiger lokaler Listener auf Port 8808 nimmt den Code entgegen, das
  Token wandert von Hand in `social/secrets.env`. Kein öffentlicher Endpunkt,
  keine Route im Frontend nötig. Ein Hilfsskript dafür gehört in den Umfang
  (`social/tools/tumblr-auth.py` o. ä.), damit der Schritt beim Tokenwechsel
  wiederholbar ist.
- **Test-Tumblr und Marken-Blog unter demselben Konto?** Dann genügt eine
  Autorisierung und `TUMBLR_BLOG_IDENTIFIER` wird umgestellt. Zwei Konten
  bedeuten zwei Autorisierungen und zwei Token-Sätze — auf einem
  Headless-Host jeweils mit Browser-Redirect.
