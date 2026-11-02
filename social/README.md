# OtakuPulse Social-Agent (`otakupulse-social`)

Formuliert Social-Media-Posts aus neuen OtakuPulse-Artikeln und schickt sie **einmal am Tag
als Freigabe-Batch** per Telegram. Du tippst ✅ (posten), ✏️ (umschreiben) oder ❌ (verwerfen).
Es wird **ausschließlich auf eigenen Kanälen** gepostet; nichts geht ungeprüft raus.

**Ausgeliefert wird über Coolify, nicht über `manage.sh`** — siehe [`DEPLOY.md`](DEPLOY.md) (Compose-Fragment, Volume, Variablen, Inbetriebnahme-Reihenfolge). `manage.sh` ist nur für lokale Entwicklung und Tests.

Ersetzt den nie funktionierenden n8n-Autoposter. Muster nach `../../habitbot` (Python-Container,
`docker run` via `manage.sh`, kein compose-Plugin auf dem Unraid-Host).

## v1-Umfang
- **Quelle:** neue publizierte Artikel aus der Postgres (nur lesend, Rolle `social_ro`).
- **Formulierung:** ein Anthropic-Call (`claude-sonnet-5`) pro Artikel für alle aktiven Kanäle.
- **Kanäle:** Bluesky + Mastodon. (Discord/X/Reddit/Facebook folgen als ~50-Zeilen-Adapter.)
- **Freigabe:** täglicher Batch (Default 18:00), Ein-Tap je Entwurf + „alle freigeben".
- **Dranbleiben:** News verfallen nach 48 h → die Queue kann nicht zur Halde werden.
- **Resilienz:** Circuit-Breaker (nach 5 Fehlern Kanal 6 h still + 1 Telegram-Meldung).

Noch **nicht** dabei: Evergreen-Recycling (v1.5), Antworten-Inbox (v2), weitere Kanäle (v2.5+).

## Einrichtung
1. **Eigenen Telegram-Bot** via [@BotFather](https://t.me/BotFather) anlegen → `SOCIAL_BOT_TOKEN`.
   NICHT den @otakupulse_de_bot mitbenutzen (zwei Long-Poller auf einem Token = 409).
2. `cp secrets.env.example secrets.env && chmod 600 secrets.env`, dann ausfüllen:
   - `SOCIAL_BOT_TOKEN`, `ANTHROPIC_API_KEY`
   - `PG_PASSWORD` = Passwort der Rolle `social_ro`
   - `CHANNELS_ENABLED=bluesky,mastodon` (oder was du zuerst willst)
   - Bluesky-App-Passwort / Mastodon-Access-Token
   - `DRY_RUN=1` **beim ersten Start lassen** (Trockenmodus).
3. `./manage.sh build && ./manage.sh up`
4. Im Freigabe-Chat **einmal `/start`** senden (registriert die Chat-ID), falls
   `SOCIAL_APPROVAL_CHAT_ID` nicht gesetzt ist.
5. **PFLICHT vor dem echten Betrieb:** `./manage.sh seed`
   → markiert alle 590 bereits publizierten Artikel als „gesehen". **Ohne diesen Schritt
   erzeugt der erste Lauf 590 Entwürfe.**

## Bedienung
- `/status` — Modus, Kanäle, Entwurfs-Zähler.
- `/batch` — Batch sofort bauen (Ingest + Formulierung), statt auf 18:00 zu warten. Gut zum Testen.
- `/pause` / `/resume` — Posten anhalten/fortsetzen (Entwürfe entstehen weiter).

## Trockenlauf & Verifikation
- `DRY_RUN=1`: der komplette Ablauf läuft echt (Quellen, LLM, Queue, Batch, Freigabe,
  `posted_log`) — nur `Channel.post()` wird kurzgeschlossen. Du siehst echte Entwürfe im
  Telegram-Batch, ohne dass ein Zeichen nach außen geht.
- Vorschau ohne alles: `./manage.sh cli compose 3` — formuliert 3 neue Artikel und gibt sie
  aus, ohne zu speichern.
- Reihenfolge zum Echtbetrieb: `DRY_RUN=1` → Testkonten (Bluesky-Zweitkonto, offene
  Mastodon-Instanz) → `DRY_RUN=0` und echte Kanäle, einen nach dem anderen.

## Architektur (Kurz)
```
sources/articles ─▶ compose (LLM) ─▶ Queue (drafts) ─▶ Batch (Telegram-Freigabe)
                                                  │
                                        approved  ▼
                        breaker ◀─ poster ─▶ channels/{bluesky,mastodon}
```
- **DB = einzige Wahrheit** (`data/social.sqlite3`): `drafts`, `posted_log` (Post-Dedup je
  Kanal), `seen_sources` (Ingest-Dedup, 1× formulieren je Artikel), `channel_state` (Breaker).
- Kanal-Interface in `channels/base.py` — neuer Kanal = ~50 Zeilen, in `registry.py` eintragen.
- Für Modell-IDs/Preise/Params gilt das `claude-api`-Skill, nicht das Gedächtnis.

## Stolperfallen
- **Bluesky-Umlaute:** der Link steckt als externe Karte (`embed.external`), NICHT im Text →
  keine Facet-Byte-Offsets nötig (die brechen sonst bei Umlauten).
- **Mastodon-Limit** wird aus `GET /api/v1/instance` gelesen (Fallback: `MASTODON_CHAR_LIMIT`).
- **Erststart ohne `seed`** = 590 Entwürfe. Immer erst seeden.

## Tumblr-Kanal
Zusätzlicher Kanal `tumblr` (Blog `otakupulse-de.tumblr.com`). Nur Artikel der Kategorien `news` und
`simulcast`. Anders als Bluesky/Mastodon gibt es **keine Einzelfreigabe** je Entwurf, dafür ein
Tageslimit (`TUMBLR_MAX_POSTS_PER_DAY`, Default 6) und einen eigenen Verfall. Tumblr hat keinen
Idempotency-Key: bei unklarem Ausgang gibt der Poster auf und meldet es, statt doppelt zu posten.

### Einrichtung
1. **App registrieren** unter <https://www.tumblr.com/oauth/apps>. In **beiden** Callback-Feldern
   (OAuth1-Callback und OAuth2-Weiterleitung) exakt `http://localhost:8808/callback` eintragen.
   Daraus kommen Consumer Key und Consumer Secret.
2. **Einmalig autorisieren** auf deinem eigenen Rechner (nicht auf dem VPS, nicht im Container;
   Python ≥ 3.10 und dieser Checkout genügen):
   ```bash
   export TUMBLR_CONSUMER_KEY=...
   export TUMBLR_CONSUMER_SECRET=...      # fehlt es, fragt das Skript unsichtbar danach
   python3 social/tools/tumblr_auth.py
   ```
   Das Skript gibt eine Tumblr-Adresse aus; im Browser öffnen und bestätigen. Tumblr leitet auf
   `localhost:8808/callback` zurück, wo das Skript kurz lauscht und danach endet. Am Ende stehen
   zwei Zeilen auf der Konsole: `TUMBLR_OAUTH_TOKEN=...` und `TUMBLR_OAUTH_TOKEN_SECRET=...`.
   Das Skript schreibt nichts in Dateien und gibt das Consumer Secret nie aus. Port 8808 muss
   frei sein. Bei Ablehnung durch Tumblr erklärt es auf Deutsch die wahrscheinlichen Ursachen
   (Key/Secret, Callback-URL, Zeitversatz der Rechneruhr).
3. In `secrets.env` eintragen: `TUMBLR_BLOG_IDENTIFIER`, `TUMBLR_CONSUMER_KEY`,
   `TUMBLR_CONSUMER_SECRET` und die zwei Token-Zeilen aus Schritt 2. `tumblr` in
   `CHANNELS_ENABLED` aufnehmen.
4. **Theme einsetzen:** siehe [`tumblr-theme/README.md`](tumblr-theme/README.md).

Das Verfahren ist OAuth 1.0a (HMAC-SHA1), die Begründung steht im Kopf von
`build/app/channels/tumblr.py`. Die Signatur liegt in `build/app/oauth1.py` und wird vom Adapter
und vom Hilfsskript gemeinsam benutzt. Ob Tumblr die Access-Tokens irgendwann ablaufen lässt, sagt
die Doku nicht: kommt im Betrieb ein 401, Schritt 2 wiederholen.

### Rolle von `DRY_RUN_CHANNELS`
`DRY_RUN=1` setzt **alle** Kanäle trocken. `DRY_RUN_CHANNELS` ist die feinere Stellschraube bei
`DRY_RUN=0`: die dort genannten Kanäle (Komma-getrennt) posten weiter nur zum Schein. So geht
Tumblr als einziger Kanal live, während die anderen trocken bleiben:
```
DRY_RUN=0
DRY_RUN_CHANNELS=bluesky,mastodon
```
Beim Start warnt der Agent vor unbekannten Kanalnamen (Tippfehler, Leerzeichen statt Komma) und
davor, dass `DRY_RUN=0` mit leerer `DRY_RUN_CHANNELS` **alle** aktivierten Kanäle live schaltet.
Vor dem ersten echten Post: erst `DRY_RUN=1`, Entwürfe im Telegram-Batch prüfen, dann umstellen.

### Stolperfallen
- **Tumblr parst Template-Tags auch in HTML-Kommentaren.** Steht im Theme in einem Kommentar ein
  Tag wie `block:Photo` in geschweiften Klammern, zählt es als geöffneter Block, und alles danach
  verschwindet: komplett weiße Seite, **ohne Fehlermeldung**. Genau daran ist die erste
  Theme-Fassung gescheitert. In Kommentaren nie geschweifte Klammern um Tag-Namen setzen;
  `tumblr-theme/check-balance.py` prüft das Theme darauf (Details in `tumblr-theme/README.md`).
- **Falsche Callback-URL:** weicht sie von `http://localhost:8808/callback` ab, lehnt Tumblr schon
  den ersten Schritt der Autorisierung ab. Beide Felder der App prüfen.
- **Uhr des Rechners:** die OAuth-Signatur enthält einen Zeitstempel; geht die Uhr um mehr als ein
  paar Minuten falsch, kommt ein 401, das wie falsche Zugangsdaten aussieht.
