# OtakuPulse

**Deutschsprachige Anime-Datenbank** — Titel, Charaktere, Synchronsprecher, Studios,
Genres, Tags, Seasons, Streaming-Verfügbarkeit (Dub/Sub), Simulcast-Kalender und
automatisch generierte News. Alles verlinkt, durchsuchbar, SEO-optimiert.

Live: **https://www.otakupulse.de**

📱 **Android-App:** [ppschauss/otakupulse-android](https://github.com/ppschauss/otakupulse-android) — Kotlin-WebView-Wrapper mit AdMob-Werbung

Stammdaten stammen aus **AniList**, angereichert um echte **Dub-/Sub-Sprachen** und
**Streaming-Anbieter** aus mehreren Quellen sowie um **eigene deutsche Beschreibungen**
(KI-Rewrite gegen Duplicate Content).

> 📄 **Vollständige Pfad-Referenz & Architektur:** [`docs/PROJEKT.md`](docs/PROJEKT.md)
> (auch als PDF: `docs/OtakuPulse-Projektdokumentation.pdf`).
> Betrieb/Deployment im Detail: [`docs/BETRIEB.md`](docs/BETRIEB.md).

---

## Inhalt

- [Stack](#stack)
- [Features](#features)
- [Projektstruktur](#projektstruktur)
- [Setup (lokal / Docker)](#setup-lokal--docker)
- [`secrets.env`](#secretsenv--niemals-committen)
- [Daten-Pipeline](#daten-pipeline)
- [Streaming & Sprachen](#streaming--sprachen)
- [Redaktion & Automatik](#redaktion--automatik)
- [Community & Social](#community--social)
- [Jugendschutz](#jugendschutz)
- [SEO & IndexNow](#seo--indexnow)
- [Analytics (Umami, self-hosted)](#analytics-umami-self-hosted)
- [Backups & Monitoring](#backups--monitoring)
- [Deployment](#deployment)
- [Cronjobs](#cronjobs)
- [Sicherheit](#sicherheit)
- [Lizenz](#lizenz)

---

## Stack

- **Next.js 16** (App Router, React 19) — Frontend & Server Components, ISR
- **Payload CMS 3.85** — Collections/Globals, Local API, Admin unter `/legal/admin`
- **PostgreSQL** — via `@payloadcms/db-postgres` (Dev-Push-Modus, keine Migrationen)
- **Docker** auf Unraid:
  - `otakupulse-app` (Prod, `next start`, Port 3001→3000)
  - `otakupulse-db` (Postgres)
  - `otakupulse-enrich` (Worker/Builds, bind-mountet den Live-Code)
  - `otakupulse-n8n` (Social-Autoposter, LAN Port 5678)
  - `umami` + `umami-db` (self-hosted Analytics)
- **Anthropic Claude** — deutsche Beschreibungen (Haiku) + News-Texte (Sonnet)
- **Umami** (self-hosted) — datenschutzfreundliches, first-party Analytics
- Host-Skripte (Grau-Zonen-Scraper) in **Python** mit `curl_cffi` (TLS-Impersonation)

---

## Features

**Katalog & Navigation**
- ~11.000 Anime, ~75k Charaktere, ~48k Personen, ~1.700 Studios, 424 Tags, 19 Genres
- Detailseiten für Anime, Charaktere, Personen, Studios, Genres, Tags, Seasons
- Volltextsuche mit Filtern (`/suche`: Genre, Tag, Typ, Status, Jahr, Sprache, Anbieter — kombinierbar)
- **Simulcast-Kalender** (`/kalender`) — Wochenraster mit **Genre-Filter**, Heute-Markierung
- Anime-Vergleich (`/vergleich/[a]-vs-[b]`)

**Streaming & Sprachen**
- Pro Titel **anbieter-genaue Angebote** (`streamingOffers`): Deep-Link, Abo/Werbung/Free,
  Audio- und Untertitelsprachen **je Anbieter**, Staffel-/Episodenstand, Ablaufdatum, „Neu"-Marker
  (Crunchyroll, Netflix, Prime Video, Disney+, Joyn, RTL+, WOW, Aniverse, ADN, Toggo …)
- „Wo kann man … streamen?"-Block direkt auf der Anime-Seite (mit WatchAction-JSON-LD);
  `/streamen/[slug]` und `/aehnlich/[slug]` sind per 308 in die Anime-Seite eingefaltet
- Plattform-Übersicht (`/plattform` + `/plattform/[slug]`) und **Listen-Seiten**
  `/plattform/[slug]/[filter]` (`deutscher-dub`, `deutscher-sub`, `kostenlos`, `neu`, `filme`, Genre) —
  indexierbar nur ab 10 Titeln
- Rollierender Verfügbarkeits-Abgleich, damit die Daten aktuell bleiben (siehe unten)

**Redaktion**
- Automatisch generierte Ankündigungs-/Simulcast-Artikel pro neuem Titel (KI, Steckbrief)
- Wiederkehrende Formate (Tages-Digest, Wochenvorschau/-rückblick, Genre-Spotlight)
- News-Bereich (`/news`) mit Kategorie-Hubs, Sidebar-Filter & -Suche, Autor-Seiten
- Neueste-News-Block auf der Startseite (`LatestNews`)
- **Trailer-Embeds** (YouTube-nocookie) & **Teilen-Leiste** auf Artikelseiten
- **Telegram-Bot** postet neue Artikel in den Channel
- **RSS-Feeds** (`/feeds`) — Teaser- und Vollinhalts-Feed inkl. Cover-Bilder

**Mehr**
- Kontaktformular (`/kontakt`, mehrschichtiger Spam-Schutz, Server Action)
- Jugendschutz: Hentai-Cover-Blur + FSK-18-Altersfreigabe (siehe unten)
- Rechtsseiten: `/impressum`, `/datenschutz`, `/nutzungsbedingungen`

---

## Projektstruktur

```
otakupulse/
├── frontend/                       # Next.js + Payload App
│   └── src/
│       ├── app/(frontend)/         # öffentliche Seiten
│       │   ├── anime/ top-anime/ genre/ tag/ studio/ season/ plattform/
│       │   ├── character/ person/ news/ suche/ kalender/ vergleich/
│       │   ├── streamen/[slug]/    # Intent-Seite „Wo läuft X im Stream?"
│       │   ├── aehnlich/[slug]/    # Intent-Seite „Anime ähnlich wie X"
│       │   ├── kontakt/ feeds/ feed/[slug]/   # Kontakt + RSS
│       │   └── impressum/ datenschutz/ nutzungsbedingungen/
│       ├── app/sitemap.xml/ app/sitemaps/[chunk]/  # Sitemap-Index + Chunks
│       ├── proxy.ts                # host-abhängige CSP/HSTS + LAN-only Admin/API-Sperre
│       ├── collections/            # Payload-Collections (Anime, Articles, Feeds, …)
│       ├── globals/                # Navigation, PageContent, Settings (Jugendschutz)
│       ├── components/             # React-Komponenten (AdultGate, ShareButtons, LatestNews …)
│       ├── lib/                    # streaming, import, anime, seo, sitemap, settings …
│       └── scripts/                # Import-/Sync-/News-/Backfill-Skripte (.ts + .py)
├── docs/
│   ├── PROJEKT.md                  # vollständige Pfad-Referenz (+ PDF)
│   ├── BETRIEB.md                  # Betrieb, Deployment, Cron, Sicherheit (Detail)
│   └── ARCHITEKTUR-BLUEPRINT.md
├── n8n-workflows/                  # Autoposter-Workflow (+ README) für n8n
├── backup-db.sh                    # nächtliches DB-Backup (lokal + B2-Offsite)
├── watchdog.sh                     # Uptime-Watchdog (Auto-Neustart + Telegram-Alarm)
├── otakupulse-sync.sh              # täglicher Sync-Wrapper (AniList → JustWatch → News → Telegram → IndexNow)
├── refresh-streaming.sh            # rollierender Streaming-Refresh (--stale)
├── backfill-streaming.sh           # Einmal-Backfill (JustWatch + Dub-Scraper)
└── README.md
```

> `bin/` (rclone-Binary) und `rclone.conf` (Offsite-Credentials) liegen im Ordner,
> sind aber **gitignored**.

---

## Setup (lokal / Docker)

Voraussetzung: laufender Postgres + `frontend/secrets.env`.

```sh
cd frontend
npm install
npm run dev            # Dev-Server auf 0.0.0.0:3000 (im Container → Host-Port 3001)
```

- Admin-Oberfläche: `http://localhost:3001/legal/admin` (nur im LAN erreichbar, s. Sicherheit)
- Typecheck: `npm run typecheck` · Tests: `npm run test`
- Payload-Typen nach Schema-Änderung neu generieren: `npm run generate:types`

### Schema-Änderungen (neue Felder/Globals)

In Produktion gibt es **keinen Auto-Push**. Neue Felder/Globals einmalig pushen:

```sh
docker exec --env-file frontend/secrets.env -e NODE_ENV=development \
  otakupulse-enrich sh -lc 'cd /app && npx tsx src/scripts/db-push.ts'
```

(Additive Änderungen — neue Spalten/Tabellen — werden ohne Rückfrage angelegt.)

---

## `secrets.env` — NIEMALS committen

Liegt unter `frontend/secrets.env`, ist in `.gitignore`. Vorlage: `secrets.env.example`.

```
DATABASE_URI=postgres://USER:PASS@otakupulse-db:5432/otakupulse
PAYLOAD_SECRET=<langer-zufallsstring>
ANTHROPIC_API_KEY=<key>                       # News-Generierung + Übersetzung
NEXT_PUBLIC_SITE_URL=https://www.otakupulse.de

# Telegram-Bot (News-Posts + Watchdog-Alarm)
TELEGRAM_BOT_TOKEN=<botfather-token>
TELEGRAM_CHANNEL_ID=@otakupulse_de
ALERT_CHAT_ID=<private-chat-id>               # Ziel der Watchdog-Alarme

# n8n-Autoposter (stabiler Key für gespeicherte Credentials)
N8N_ENCRYPTION_KEY=<hex-key>

# IndexNow (Bing/Yandex/Seznam/Naver-Push)
INDEXNOW_KEY=<hex-key>                         # + Key-Datei public/<key>.txt

# Analytics (self-hosted Umami, first-party über /stats)
NEXT_PUBLIC_UMAMI_WEBSITE_ID=<website-id>
NEXT_PUBLIC_UMAMI_SRC=/stats/script.js
NEXT_PUBLIC_UMAMI_HOST_URL=https://www.otakupulse.de/stats
```

> `NEXT_PUBLIC_*` werden beim **Build** in den Client-Bundle eingebacken — nach
> Änderung neu bauen.

---

## Daten-Pipeline

### Im Container (`npm run …` bzw. `tsx src/scripts/…`)

| Script | Zweck |
|---|---|
| `import:anime` | Einzelnen Anime von AniList importieren |
| `import:batch` / `import:years` | Massenimport (season-/jahrweise, überspringt Vorhandene) |
| `scripts/backfill-years.ts` | Voll-Coverage je Jahrgang (`seasonYear` allein, `isAdult:false`, erfasst season-lose Filme/OVAs) |
| `import:tags` | Tag-Stammdaten importieren |
| `sync` | Täglicher Sync: laufende Anime + aktuelle Season inkl. Episoden |
| `mirror` | Cover/Banner/Portraits lokal nach `public/media` spiegeln (inkrementell) |
| `translate` | Beschreibungen ins Deutsche umschreiben (Claude Haiku, inkrementell) |
| `news:anime` | Ankündigungs-/Simulcast-Artikel je neuem Titel (siehe Redaktion) |
| `scripts/generate-recurring-news.ts` | wiederkehrende Formate (`--daily`, `--weekly-preview`, `--genre-spotlight`, `--weekly-recap`) |
| `telegram:notify` | neue Artikel in den Telegram-Channel posten |
| `indexnow` | URLs an IndexNow pushen (`--all`, `--recent N`, `--dry`) |
| `backfill:languages` | `availableLanguages` aus vorhandenen Daten ableiten |
| `scripts/db-push.ts` | Additiver Schema-Push (nur mit `NODE_ENV=development`) |

> **OPS:** `otakupulse-app` läuft aus einem gebackenen Image (nur `public/media`
> gemountet) → Host-Code-Edits sind dort nicht live. `otakupulse-enrich` bind-mountet
> `frontend → /app` = Live-Code + `tsx` + DB + Env → tsx-Skripte hier ausführen.

### Auf dem HOST (Python, `pip install curl_cffi`)

Brauchen TLS-Impersonation (Cloudflare) bzw. eine **DE-IP**. Laufen außerhalb des Containers.

| Script | Zweck |
|---|---|
| `crunchyroll-dub.py` | Echte Ger-/Eng-Dub & -Sub aus der Crunchyroll-Content-API |
| `justwatch-streaming.py` | Anbieter-Verfügbarkeit (`--recent N`, `--only-missing`, `--stale N`) → `streamingProviders` |
| `wikipedia-dub.py` | Legale Ger-Dub-Ergänzung (Klassiker/Filme) via Wikidata |
| `studio-logos.py` | Studio-Logos (Wikimedia Commons) + Websites aus Wikidata |

> **Datenquellen:** AniList liefert bei STREAMING keine Sprach-Info. Dub-/Sub-Daten
> kommen aus Crunchyroll (echte `audio_locales`) + Wikipedia. aniSearch scheidet
> bewusst aus (ToS). Cron-Beispiele & Details: [`docs/BETRIEB.md`](docs/BETRIEB.md).

---

## Streaming & Sprachen

Kern ist das Array-Feld **`streamingOffers`** auf dem Anime — pro Anbieter ein Angebot mit
Deep-Link, Monetarisierung (`flatrate`/`ads`/`free`), Audio-/Untertitelsprachen (`de,ja`),
Staffel-/Episodenzahl beim Anbieter, `availableTo`, `firstSeenAt`/`lastSeenAt`. Quelle ist
JustWatch DE (`justwatch-streaming.py`). Anbieter ohne Deep-Link werden **nicht** übernommen.
Daraus abgeleitet: **`streamingProviders`** (Slugs, Filter-Index für Suche/Plattform-Seiten;
Register `lib/streaming.ts`) und **additiv** `availableLanguages`. Der AniList-Import fasst
diese Felder **nie** an. Solange ein Titel noch keine Offers hat, fällt die UI auf die
Flags + AniList-Link zurück (`streamingOffersOf` → `legacy`).

**Seiten:** „Wo kann man … streamen?"-Block auf `/anime/[slug]` (Komponente `StreamingBox`,
Title/Description datenabhängig), Listen `/plattform/[slug]/[filter]` (`lib/platformLists.ts`,
SQL über `anime_streaming_offers`, `MIN_LIST_SIZE = 10` → sonst `noindex` + nicht in der Sitemap).
`/streamen/[slug]` und `/aehnlich/[slug]` existieren nicht mehr (308 → `/anime/[slug]`,
`next.config.mjs`); ihre Sitemap-Dateien antworten 404.

**Rollierender Refresh** (`refresh-streaming.sh`, Cron alle 4 h): Feld
**`streamingCheckedAt`** merkt sich pro Titel den letzten Abgleich. `justwatch-streaming.py
--stale N` nimmt die N am längsten nicht geprüften Titel, gleicht sie **autoritativ** ab
(Offers exakt auf JustWatch-Stand, nur bei sicherem Titel-Match ≥ 0.90; `firstSeenAt`
bleibt erhalten) und stempelt sie. Rate-Limit 4 Worker + 0,25 s (ein großer Blast hatte
JustWatch schon mit HTTP 403 geblockt). Voll-Backfill (~11k Titel, ~30 min) über
`backfill-streaming.sh`.

---

## Redaktion & Automatik

- **`generate-anime-news.ts`** (`news:anime`) — erzeugt pro neuem Titel einen Artikel: ein
  **deterministischer Steckbrief** (Studio, Genres, Episoden, Release, Plattform,
  Vorgänger-Staffel) + KI-Rewrite der Beschreibung im „Otaku/Weeb-Stil" (Sonnet).
  Modi: `--recent N`, `--season-current`, `--slug <slug>`, `--draft`, `--dry`.
  Hentai-Titel werden **nie** automatisch erzeugt (nur manuell).
- **`generate-recurring-news.ts`** — wiederkehrende Formate: Tages-Digest,
  Wochenvorschau/-rückblick, Genre-Spotlight (per Cron, siehe unten).
- **`telegram-notify.ts`** — postet neue, veröffentlichte Artikel in den Telegram-Channel
  (`telegramPostedAt`-Feld als Dedup). Flags `--max N`, `--seed`, `--dry`.
- **Artikelseiten** tragen `og:type=article` (published/modified/author/section), eine
  **Teilen-Leiste** (`ShareButtons.tsx`: Web-Share-API + WhatsApp/Telegram/X/Bluesky/
  Facebook/Reddit) und optional einen **YouTube-nocookie-Trailer** (Feld `trailerUrl`).
- **RSS** — pflegbare `Feeds` (Artikel + Anime + Custom-Items), Übersicht unter `/feeds`.

### RSS-Feeds

Alle Feeds tragen Cover-Bilder (`<enclosure>` + `media:content`); jede Seite weist
den Haupt-Feed via `<link rel="alternate">` aus (Auto-Discovery durch Reader/Crawler).

| Feed | Zweck |
|---|---|
| `/feed.xml` | Haupt-Feed (Teaser + Cover) — Quelle des Autoposters |
| `/feed-full.xml` | **Vollinhalt** (`content:encoded`) — für Flipboard & Volltext-Reader |
| `/kalender/feed.xml` | Simulcast-Kalender |
| `/news/kategorie/<cat>/feed.xml` | je News-Kategorie |
| `/genre/<slug>/feed.xml` | je Genre |
| `/feed/<slug>.xml` | kuratierte Themen-Feeds (Collection `Feeds`) |

---

## Community & Social

Konstanten zentral in `frontend/src/lib/site.ts` (`DISCORD_INVITE`,
`TELEGRAM_CHANNEL`, `X_URL`) — verlinkt in Header, Footer und auf der Startseite.

- **Discord** — Community-Server; SEO-Landingpage `/anime-discord-server`.
- **Telegram** — News-Kanal `@otakupulse_de` (Bot `@otakupulse_de_bot` postet Artikel
  automatisch); Landingpage `/anime-telegram-kanal`.
- **X / Twitter** — `@OtakuPulseDE` (Header/Footer).

**n8n-Autoposter** (`n8n-workflows/otakupulse-autoposter.json`): self-hosteter
Container `otakupulse-n8n` (LAN, Port 5678) zieht intern
`http://otakupulse-app:3000/feed.xml` und postet neue Artikel nach **Discord,
Mastodon, Bluesky, Reddit und Facebook**. Dedup über den RSS-Trigger; Tokens werden
im n8n-UI eingetragen. Anleitung: `n8n-workflows/README.md`.

> Der Container läuft via `docker run` (kein compose-Plugin auf dem Host); der
> `N8N_ENCRYPTION_KEY` muss beim Recreate exakt erhalten bleiben, sonst sind
> gespeicherte Credentials unentschlüsselbar. Die Footer-„Community"-Spalte ist
> **fest in `components/Footer.tsx`** verdrahtet — nicht über das CMS pflegbar.

---

## Jugendschutz

- Anime-Feld **`isHentai`** (beim Import automatisch aus dem Genre „Hentai" gesetzt,
  im Admin überschreibbar).
- Global **„Jugendschutz & Allgemein"** (`Settings`) → Schalter
  **„Hentai-Cover unkenntlich machen"** (Standard: an).
- Bei aktivem Schalter: alle Hentai-Cover/Banner werden **geblurrt** + mit
  **FSK-18-Siegel** überlagert (`AdultGuard`/`AdultGate`/`Fsk18Overlay`).
- **Altersfreigabe**: Button „Inhalte anzeigen (18+)" → Ja/Nein-Abfrage. „Ja" gibt
  alle Hentai-Bilder frei (gemerkt in `localStorage`), „Nein" leitet auf `/anime`.
- Hentai/Adult-Inhalte sind `noindex` und werden **nie** automatisch in News/RSS
  eingespeist (nur manuell).

---

## SEO & IndexNow

- **Landingpages**: Startseite (Index mit allen Bereichen, Stats, Rotation),
  `/anime`, `/top-anime`, `/genre`, `/season`, `/plattform` — je mit Intro-Text,
  FAQ-Schema und `ItemList`-JSON-LD.
- **Programmatische Intent-Seiten** (Longtail):
  - `/streamen/[slug]` — „Wo läuft *X* im Stream?" (nur mit Anbietern indexierbar)
  - `/aehnlich/[slug]` — „Anime ähnlich wie *X*" (Empfehlungen + Relationen + Genre-Fallback)
  - Dünne Varianten setzen automatisch `noindex`.
- **Eigene deutsche Beschreibungen** für ~97 % der Anime + alle Genres/Tags/Studios
  (gegen Duplicate Content; via `translate`).
- **Bilder lokal gespiegelt** (kein CDN-Leak, schneller; `next/image`-Optimierung).
- **Structured Data**: `WebSite`+`SearchAction`, `Organization`, `BreadcrumbList`,
  `CollectionPage`, `ItemList`, `FAQPage`, `NewsArticle`.
- **Sitemaps** (Index unter `/sitemap.xml`, je Datei max. 5.000 URLs):
  - `static`, `anime-*`, `characters-*`, `persons-*`, `studios-*`, `seasons-*`, `articles-*`
  - `genres-*`/`tags-*` (Übersichtsseiten)
  - **`genre__<slug>__N`** — Anime je Genre (Indexierung pro Genre in der GSC verfolgbar)
  - **`tagsanime__N`** — alle getaggten Anime (dedupliziert, gestaffelt)
  - **`streamen-*`**, **`aehnlich-*`** — die inhaltsstarken Intent-Seiten
- **Community-Landingpages**: `/anime-discord-server`, `/anime-telegram-kanal`
  (Keyword-Fokus „anime discord/telegram … deutsch", FAQPage-Schema, interne Verlinkung).
- **Open Graph**: generiertes Default-Bild (`app/(frontend)/opengraph-image.tsx`),
  per-Seite über `pageMeta` (`lib/seo.ts`); `og:image`/`twitter:image` automatisch.
- **Feed-Discovery**: `pageMeta` setzt auf jeder Seite `<link rel="alternate" type="application/rss+xml">`.

### IndexNow

`npm run indexnow` (`src/scripts/indexnow.ts`) pusht URLs an
`api.indexnow.org` → Bing/Yandex/Seznam/Naver. Modi: `--all` (gesamte kanonische Site
aus den Sitemap-Typen), `--recent N` (nur kürzlich geänderte Anime/Artikel, inkl.
`/streamen` + `/aehnlich`), `--dry`, `--limit N`. Der Key liegt als `INDEXNOW_KEY` in
`secrets.env` und als Key-Datei unter `public/<key>.txt`. `--recent 3` läuft täglich
im Sync-Wrapper mit.

> **Achtung:** `next start` cacht das `public/`-Listing beim Boot — nach dem Anlegen
> neuer public-Dateien (z. B. der Key-Datei) `otakupulse-app` neu starten, sonst 404.

---

## Analytics (Umami, self-hosted)

Datenschutzfreundlich, cookielos, lädt **nur nach Statistik-Einwilligung** (Consent).

- Container `umami` + `umami-db` (eigene Postgres) im Docker-Netz `otakupulse-net`.
- **First-Party** eingebunden: `next.config.mjs` proxyt `/stats/script.js` und
  `/stats/api/send` auf den Umami-Container → kein Dritt-Host, CSP bleibt `'self'`,
  adblock-resistent. `/api` bleibt für Payload frei.
- Dashboard nur im LAN/Tailscale (`http://<unraid-ip>:3002`, Port nicht auf `0.0.0.0` gebunden).
- Setup-Details & Website-ID: siehe `secrets.env` + interne Notizen.

---

## Backups & Monitoring

**`backup-db.sh`** (Cron 03:30 täglich):
- `pg_dump` der App-DB (`otakupulse`) **und** Umami-DB → `/mnt/cache/appdata/backups`, gzip
- **Rotation**: behält 14 Tage je DB
- **Offsite**: lädt via **rclone** nach **Backblaze B2** (`offsite:otakupulse-backups`),
  sobald das Remote `offsite` konfiguriert ist (`rclone.conf`, gitignored)

**`watchdog.sh`** (Cron alle 5 Min):
- Prüft `http://localhost:3001/`. Greift **nur ein, wenn der Container läuft, aber
  kein HTTP 200** liefert (stört Deploys nicht, die den Container bewusst stoppen).
- Heilt per `docker restart` und schickt einen **Telegram-Alarm** an `ALERT_CHAT_ID`.
- Logs: `/mnt/cache/appdata/backups/{backup,watchdog}.log`.

---

## Deployment

`next dev` ist langsam (Compile-on-demand); produktiv liefert `next build` + `next start`
in Millisekunden. **Risikoarmer Flow** (kurze Downtime, mit Rollback):

```sh
# 1. altes Backup-Build entfernen, App stoppen, aktuelles Build sichern
cd frontend && rm -rf .next.bak && docker stop otakupulse-app && mv .next .next.bak

# 2. sauber neu bauen (im enrich-Container, der den Code bind-mountet)
docker exec otakupulse-enrich sh -lc 'rm -rf /app/.next'          # WICHTIG: Clean-Build
docker exec --env-file frontend/secrets.env otakupulse-enrich \
  sh -lc 'cd /app && npm run build'

# 3. App starten + Health prüfen
docker start otakupulse-app
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/

# Rollback bei Problemen: mv .next.bak zurück nach .next, App neu starten
```

> **Fallstrick:** IMMER `.next` vor dem Prod-Build löschen. Ein inkrementeller Build über
> stale `.next/cache` erzeugte HTML, das auf nie emittierte CSS-Chunks verwies → kaputte
> Seiten-CSS. `styles.css` scannt daher via `@source '../../**/*.{ts,tsx}'` den ganzen
> `src`-Baum.

Bei **Schema-Änderungen** vorher `db-push.ts` ausführen (s. o.), damit der neue Code
nicht auf fehlende Spalten trifft. Mehr in [`docs/BETRIEB.md`](docs/BETRIEB.md).

---

## Cronjobs

Reboot-fest über Unraid (`/boot/config/plugins/dynamix/*.cron` → `update_cron`):

| Zeit | Job | Zweck |
|---|---|---|
| `30 3 * * *` | `backup-db.sh` | DB-Backup lokal + B2-Offsite, rotierend |
| `15 4 * * *` | `otakupulse-sync.sh` | AniList-Sync → JustWatch → News → Telegram → IndexNow |
| `45 */4 * * *` | `refresh-streaming.sh` | rollierender Streaming-Abgleich (`--stale`) |
| `0 6 * * *` | `generate-recurring-news --daily` | Tages-Digest |
| `30 6 * * 1` | `generate-recurring-news --weekly-preview` | Wochenvorschau (Mo) |
| `0 12 * * 3` | `generate-recurring-news --genre-spotlight` | Genre-Spotlight (Mi) |
| `0 19 * * 0` | `generate-recurring-news --weekly-recap` | Wochenrückblick (So) |
| `*/30 * * * *` | `telegram-notify.ts` | neue Artikel in den Channel posten |
| `*/5 * * * *` | `watchdog.sh` | Uptime-Watchdog + Auto-Neustart |

---

## Sicherheit

- `secrets.env`, `.env*`, `rclone.conf`, `bin/`, `db/`, `__pycache__/`, `.next*` sind
  **gitignored** — niemals committen.
- Versehentlich geteilte Keys (`ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, B2-Key)
  in den jeweiligen Dashboards **rotieren**.
- **Admin & Payload-API nur im LAN**: `src/proxy.ts` blockt `/legal/admin*` **und**
  `/api/*` (inkl. Login/GraphQL) mit nacktem 404, sobald der Request über den
  öffentlichen Cloudflare-Tunnel kommt (Erkennung via `cf-ray` / `x-forwarded-proto`).
  LAN-/Tailscale-Direktzugriff bleibt frei. Die öffentliche Seite nutzt `/api` nicht
  (Server Components = Local API, Formulare = Server Actions).
- **Kontaktformular-Anti-Spam** (DSGVO-frei, kein Drittdienst): Honeypot-Feld,
  JS-Zeittrap, In-Memory-Rate-Limit (5/Std je IP) und Link-Heuristik.
- Härtung: Payload-Field-Access (interne Felder API-seitig versteckt), Drafts nicht
  öffentlich, **CSP** (`'self'`), **CORS/CSRF** auf die eigene Domain begrenzt,
  Login-Rate-Limit, On-Demand-Import mit Flut-Schutz.
- **HTTP-Header**: statische Header aus `next.config.mjs`
  (X-Content-Type-Options, X-Frame-Options, Referrer-/Permissions-Policy,
  **COOP** `same-origin-allow-popups`, **CORP** `cross-origin`, `poweredByHeader: false`).
  **CSP** + **HSTS** kommen aus `src/proxy.ts` (nur über die öffentliche HTTPS-Domain,
  nicht beim LAN-Plain-HTTP). `frame-src` erlaubt nur `youtube-nocookie.com` (Trailer).
  **COEP** wurde bewusst **entfernt** (`credentialless` brach eingebettete Dritt-iframes);
  „Subscribe with Google" wurde ebenfalls wieder **entfernt**.
- **`public/.well-known/security.txt`** (RFC 9116, Kontakt p.p.schauss@gmail.com).
  Offen: **DNSSEC** (manueller Cloudflare-Schritt).
- Rechtsseiten: `/impressum`, `/datenschutz`, `/nutzungsbedingungen` (ToS).

---

## Lizenz

Privates Projekt — **all rights reserved**. Keine Nutzung/Weitergabe ohne Erlaubnis.
