# OtakuPulse — Betrieb & Deployment

## Production-Build (Performance)

Die App läuft aktuell als `next dev` (unkompiliert, langsam). Für Produktion:

```sh
docker exec otakupulse-app npm run build      # einmalig kompilieren
# Container-Command von `npm run dev` auf `npm run start` umstellen
# (in deinem docker run / compose), dann Container neu erstellen.
```

- **ISR ist aktiv:** Startseite & Kalender (`export const revalidate = 600`) werden im Prod-Build gecacht (alle 10 Min neu) → instant für Besucher. Detailseiten sind dynamisch (lesen `?page`), profitieren aber stark vom kompilierten Build.
- Trade-off: kein Hot-Reload mehr → Code-Änderungen brauchen `npm run build` + Neustart. Daher erst zum Launch umstellen.

## Analytics (datenschutzfreundlich, cookieless)

In `secrets.env` setzen (dann automatisch aktiv, sonst kein Tracking):

```
# Plausible
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=otakupulse.de
# optional Self-Hosted: NEXT_PUBLIC_PLAUSIBLE_SRC=https://<plausible>/js/script.js

# ODER Umami
NEXT_PUBLIC_UMAMI_WEBSITE_ID=...
NEXT_PUBLIC_UMAMI_SRC=https://<umami>/script.js
```

## Google Search Console

1. In `secrets.env`: `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=<token aus GSC>` → erzeugt die Verifizierungs-Meta.
2. Property in der Search Console anlegen (Domain oder URL-Präfix).
3. Sitemap einreichen: `https://<domain>/sitemap.xml`

## Täglicher Auto-Sync (Cron) — EINGERICHTET

Läuft täglich **04:15** automatisch. Wrapper (persistent in der Appdata, da `/root` auf
Unraid den Reboot nicht überlebt): `/mnt/cache/appdata/otakupulse/otakupulse-sync.sh`
(`/root/otakupulse-sync.sh` ist ein Symlink darauf). Er macht:

1. `docker exec otakupulse-app npm run sync` — laufende Anime + aktuelle Season inkl. Episoden.
2. `justwatch-streaming.py --recent 3` — Streaming-Anbieter **für neu hinzugekommene Titel**
   (nur die letzten 3 Tage → kleine Charge, kaum 429-Drosselung). So bekommt jeder neue
   Anime automatisch seine Plattform-Zuordnung; die `/plattform`-Seiten aktualisieren sich.

Geplant **reboot-fest** über Unraids Cron-Mechanismus (kein User-Scripts-Plugin nötig):

```
/boot/config/plugins/dynamix/otakupulse-sync.cron   # Flash → überlebt Reboot
15 4 * * * /mnt/cache/appdata/otakupulse/otakupulse-sync.sh &> /dev/null
```

Nach Änderungen am Fragment: `update_cron` ausführen (regeneriert `/etc/cron.d/root`).
Log: `/tmp/otaku-sync.log`.

**JustWatch-Modi** (`justwatch-streaming.py`):
- *(ohne Flag)* — voll, alle Anime. Achtung: 8 Worker × ~7.800 Titel ⇒ viele 429-Fehler,
  nur populäre Titel kommen sicher durch. Für gelegentliche Voll-Auffrischung (z.B. wöchentlich).
- `--recent N` — nur Titel der letzten N Tage (täglicher Lauf, s.o.).
- `--only-missing` — nur Titel ganz ohne Anbieter.

Die übrigen Host-Skripte (Dub/Logos) weiter nach Bedarf, wöchentlich genügt. `curl_cffi` ist
auf dem Host installiert:

```sh
F=/mnt/cache/appdata/otakupulse/frontend/src/scripts
python3 $F/crunchyroll-dub.py        # echte Ger/Eng-Dub (audio_locales)
python3 $F/wikipedia-dub.py           # legale Ger-Dub-Ergänzung (Klassiker/Filme)
python3 $F/studio-logos.py            # Studio-Logos + Websites aus Wikidata (selten nötig)
```

> **Erst-Lauf-Hinweis:** Bis ~2026-06-08 fällt der Großimport (06-05) noch ins `--recent 3`-
> Fenster → der erste, zweite Lauf ist größer und teils gedrosselt. Danach rollt das Fenster
> weiter und der tägliche Lauf umfasst nur noch die paar wirklich neuen Titel.

## Auto-Blog für neue Titel + Telegram-Channel

**Blog-Beitrag pro neuem Titel** (`generate-anime-news.ts`, Claude Sonnet): erzeugt für
angekündigte (NOT_YET_RELEASED) und im Simulcast laufende (RELEASING) Titel je einen
Artikel (Kategorie `news`, Slug `neu-<anime-slug>` → Dedup). Der **Steckbrief** (Titel,
Studio, Genres, Episoden m. Fallback „unbekannt", Format, Release = Season+Jahr, Status,
Plattform, „Fortsetzung von …" via PREQUEL-Relation) wird DETERMINISTISCH aus DB-Fakten
gebaut; nur Headline + Teaser + der Beschreibungs-Rewrite (Otaku-/Weeb-Style) kommen von
der KI. Standard: **veröffentlicht** (`--draft` für Entwurf). Modi: `--recent N` (Pipeline),
`--season-current --limit N` (Backfill), `--slug <s>` (Test), `--dry`.

**Telegram-Bot** (`telegram-notify.ts`): postet neu *veröffentlichte* Artikel (Anime +
News) in einen Channel. Inkrementell über `frontend/.telegram-posted.json` (gitignored,
kein Schema-Feld). Env in `secrets.env`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`
(@name oder -100…; Bot muss Channel-Admin sein). `--seed` markiert den Altbestand als
gepostet (kein Versand), `--max N`, `--dry`. Selbstdrosselung 3 s/Post; sendPhoto mit
Fallback auf sendMessage.

Beide laufen im **enrich-Container** (bind-mountet Live-Code) via
`docker exec --env-file secrets.env otakupulse-enrich …`. Verdrahtung:
- Täglicher Wrapper (04:15) macht jetzt 4 Schritte: AniList-Sync → JustWatch (neue Titel)
  → `generate-anime-news.ts --recent 3` → `telegram-notify.ts --max 15`.
- Zusätzlicher Cron alle 30 Min: `telegram-notify.ts --max 8`
  (`/boot/config/plugins/dynamix/otakupulse-telegram.cron`) — postet auch manuell
  erstellte Redaktions-News zeitnah.

> **Voraussetzungen:** (1) `ANTHROPIC_API_KEY` mit freiem Limit (News + Übersetzungen).
> (2) `TELEGRAM_CHANNEL_ID` gesetzt + Bot als Channel-Admin. Fehlt eins, no-op'en die
> Scripts sauber (dedup/seed verhindern Dubletten bzw. Flut).

## Bewusst zurückgestellt (mit Begründung)

- **Episoden-Massenimport:** Der tägliche Sync deckt laufende + aktuelle-Season-Episoden ab (~1.100). Ein Voll-Backfill aller 2.080 Titel (~75 Min AniList-Last) bringt wenig, da AniList für ältere/abgeschlossene Titel oft keinen Airing-Schedule mehr hat. Bei Bedarf: `npm run import:batch -- --pages 42 --episodes`.
- **Sprach-/Dub-Filter (`availableLanguages`) — fertig & datenbestückt:** Radio auf `/suche` (Alle / Japanisch / Deutscher Dub / Englischer Dub / Deutscher Sub / Englischer Sub). `ja` aus JP-Herkunft. **Dub/Sub-Daten:** Crunchyroll-Sync (echte audio_locales) **+ Wikipedia** (legale Ergänzung für Klassiker/Filme). Stand 2026-06 → 734 Ger-Dub, 696 Eng-Dub, 1038 Ger-Sub, 959 Eng-Sub. AniList liefert KEINE Sprachinfo (`externalLinks.language` ist bei STREAMING immer null); aniSearch scheidet aus (ToS: Weiterverbreitung verboten).
- **„Wer streamt es" (Streaming-Anbieter):** Fertig. Normalisiertes Feld `streamingProviders` (Slugs), gespeist aus AniList `externalLinks` **+ JustWatch** (DE-Aggregator: Netflix, Amazon, Disney+, WOW, Joyn, RTL+ …). Anbieter-Register `lib/streaming.ts`. Seiten `/plattform` (+ pro Anbieter, leere ausgeblendet), Filter in `/suche`, „Wo streamen?"-Box auf Anime-Detail (verlinkt konkreten externalLink, sonst Anbieter-Startseite). Sagt NICHT, in welcher Sprache — nur, wo der Titel läuft.

## JustWatch-Streaming-Sync (`justwatch-streaming.py`)

Erweitert `streamingProviders` um ALLE DE-Anbieter via JustWatch (inoffizielle GraphQL-API).
HOST, `curl_cffi` + `docker`. Titel-Match per Ähnlichkeit (Schwelle 0.90), nur
FLATRATE/FREE/ADS (kein Kauf/Verleih), gemerged. Liefert KEINE Sprache/Dub.

## Wikipedia-Dub-Sync (`wikipedia-dub.py`)

Legale Dub-Ergänzung: Wikidata (MAL-ID P4086 / AniList-ID P8729) → de.wikipedia-Artikel →
Abschnitt „Synchronisation" vorhanden ⇒ `de-dub` (gemerged). HOST, `curl_cffi` + `docker`.
Fängt Klassiker/Filme, die Crunchyroll fehlen (FMA: Brotherhood, Code Geass, Your Name …).

## Studio-Logos (`studio-logos.py`)

Holt Studio-Logo (Wikidata P154 → Wikimedia Commons) + offizielle Website (P856),
validiert über Label-Match + instance-of (Animationsstudio/Produktionsfirma). HOST,
`curl_cffi` + `docker`. Muss selten laufen (Logos ändern sich kaum). Stand: 309 Logos,
466 Websites. WICHTIG: kein `maxlag`-Parameter (Wikidata-Replikations-Lag ließ sonst
jeden Read als Fehler zurückkommen → 0 Treffer).

## Crunchyroll-Dub-Sync (`crunchyroll-dub.py`)

Holt echte deutsche/englische Dub- & Sub-Verfügbarkeit aus der Crunchyroll-Content-API
(`audio_locales`/`subtitle_locales`) für alle Anime mit Crunchyroll-`/series/<ID>`-Link
und schreibt sie nach `anime_available_languages`.

**Läuft auf dem HOST** (nicht im Container), weil zwei Host-Voraussetzungen nötig sind:

```sh
pip install curl_cffi          # TLS-Impersonation — Crunchyroll steht hinter Cloudflare
python3 /mnt/cache/appdata/otakupulse/frontend/src/scripts/crunchyroll-dub.py
```

- Die **Host-IP muss in DE liegen** (das Skript warnt sonst): Crunchyroll liefert den
  Katalog regionsabhängig, der deutsche Dub erscheint nur im DE-Katalog.
- Grau-Zone: anonymer `cr_web`-Token, konservativ rate-limitiert (8 parallel, 429-Backoff).
- Idempotent: ersetzt pro Anime die Sprach-Zeilen neu. Der AniList-Import/Sync **merged**
  `availableLanguages` (überschreibt also die Dub-Daten nicht).
- **Maximale Abdeckung:** Das Skript löst nicht nur die ~461 `/series/<ID>`-Links direkt
  auf, sondern sucht ALLE übrigen Titel über die CR-Such-API und matcht per `slug_title`
  (alte `/<slug>`-Links) bzw. Titel-Ähnlichkeit. Titel, die nicht im CR-DE-Katalog sind
  (z. B. Netflix-Exklusiv wie Hunter×Hunter), werden bewusst verworfen — keine Fehl-Labels.
- **next/image (WebP/AVIF):** Aktuell `<img>` auf lokal gespiegelten, bereits passend dimensionierten Covern. next/image würde im Dev die Bildladezeiten verschlechtern (On-Demand-Optimierung von ~60k Bildern) bei moderatem Prod-Nutzen. Empfehlung: erst bei echtem Bandbreiten-Bedarf für die Karten-Komponenten aktivieren.
- **Watchlist/Favoriten:** Kommt ausschließlich in der **Android-App** — auf der Web-Seite bewusst nicht vorgesehen.

## Sicherheit

- **API-Key rotieren**, falls im Klartext geteilt (Anthropic-Dashboard) und neu in `secrets.env` ablegen.
- `secrets.env` ist in `.gitignore` (nie committen).
