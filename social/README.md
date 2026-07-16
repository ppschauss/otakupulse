# OtakuPulse Social-Agent (`otakupulse-social`)

Formuliert Social-Media-Posts aus neuen OtakuPulse-Artikeln und schickt sie **einmal am Tag
als Freigabe-Batch** per Telegram. Du tippst ✅ (posten), ✏️ (umschreiben) oder ❌ (verwerfen).
Es wird **ausschließlich auf eigenen Kanälen** gepostet; nichts geht ungeprüft raus.

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
