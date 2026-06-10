# OtakuPulse

**Deutschsprachige Anime-Datenbank** — Titel, Charaktere, Synchronsprecher, Studios,
Genres, Tags, Seasons, Streaming-Verfügbarkeit (Dub/Sub), Simulcast-Kalender und
automatisch generierte News. Alles verlinkt, durchsuchbar, SEO-optimiert.

Live: **https://www.otakupulse.de**

Stammdaten stammen aus **AniList**, angereichert um echte **Dub-/Sub-Sprachen** und
**Streaming-Anbieter** aus mehreren Quellen sowie um **eigene deutsche Beschreibungen**
(KI-Rewrite gegen Duplicate Content).

> 📄 **Vollständige Pfad-Referenz & Architektur:** [`docs/PROJEKT.md`](docs/PROJEKT.md)
> (auch als PDF: `docs/OtakuPulse-Projektdokumentation.pdf`).

---

## Inhalt

- [Stack](#stack)
- [Features](#features)
- [Projektstruktur](#projektstruktur)
- [Setup (lokal / Docker)](#setup-lokal--docker)
- [`secrets.env`](#secretsenv--niemals-committen)
- [Daten-Pipeline](#daten-pipeline)
- [Redaktion & Automatik](#redaktion--automatik)
- [Community & Social](#community--social)
- [Jugendschutz](#jugendschutz)
- [SEO](#seo)
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
- **Docker** auf Unraid — `otakupulse-app` (Port 3001→3000), `otakupulse-db`,
  `otakupulse-enrich` (Worker/Builds), `umami` + `umami-db` (Analytics)
- **Anthropic Claude** — deutsche Beschreibungen (Haiku) + News-Texte (Sonnet)
- **Umami** (self-hosted) — datenschutzfreundliches, first-party Analytics
- Host-Skripte (Grau-Zonen-Scraper) in **Python** mit `curl_cffi` (TLS-Impersonation)

---

## Features

**Katalog & Navigation**
- ~7.700 Anime, ~58k Charaktere, ~43k Personen, ~1.500 Studios, 423 Tags, 19 Genres
- Detailseiten für Anime, Charaktere, Personen, Studios, Genres, Tags, Seasons
- Volltextsuche mit Filtern (`/suche`: Genre, Jahr, Typ, Sprache kombinierbar)
- **Simulcast-Kalender** (`/kalender`) — Wochenraster mit **Genre-Filter**, Heute-Markierung
- Anime-Vergleich (`/vergleich/[a]-vs-[b]`)

**Streaming & Sprachen**
- Pro Titel: verfügbare Streaming-Anbieter (Crunchyroll, Netflix, ADN, …) + Sprachfassungen
- Plattform-Übersicht (`/plattform`) je Anbieter

**Redaktion**
- Automatisch generierte Ankündigungs-/Simulcast-Artikel pro neuem Titel (KI, Steckbrief)
- News-Bereich (`/news`), Autor-Seiten, Kategorien
- **Telegram-Bot** postet neue Artikel in den Channel
- **RSS-Feeds** (`/feeds`) — pflegbare Kanäle inkl. Anime & frei wählbarer Items

**Mehr**
- Kontaktformular (`/kontakt`, Honeypot-/Spam-geschützt, Server Action)
- Jugendschutz: Hentai-Cover-Blur + FSK-18-Altersfreigabe (siehe unten)
- Rechtsseiten: `/impressum`, `/datenschutz` (mit Cookie-Consent)

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
│       │   └── impressum/ datenschutz/
│       ├── app/sitemap.xml/ app/sitemaps/[chunk]/  # Sitemap-Index + Chunks
│       ├── collections/            # Payload-Collections (Anime, Articles, Feeds, …)
│       ├── globals/                # Navigation, PageContent, Settings (Jugendschutz)
│       ├── components/             # React-Komponenten (AdultGate, HomeDiscover, …)
│       ├── lib/                    # streaming, import, anime, seo, sitemap, settings …
│       └── scripts/                # Import-/Sync-/News-/Backfill-Skripte (.ts + .py)
├── docs/
│   ├── BETRIEB.md                  # Betrieb, Deployment, Cron, Sicherheit (Detail)
│   └── ARCHITEKTUR-BLUEPRINT.md
├── backup-db.sh                    # nächtliches DB-Backup (lokal + B2-Offsite)
├── watchdog.sh                     # Uptime-Watchdog (Auto-Neustart + Telegram-Alarm)
├── otakupulse-sync.sh              # täglicher Sync-Wrapper (AniList → JustWatch → News → Telegram)
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

- Admin-Oberfläche: `http://localhost:3001/legal/admin`
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
TELEGRAM_CHANNEL=@otakupulse_de
ALERT_CHAT_ID=<private-chat-id>               # Ziel der Watchdog-Alarme

# n8n-Autoposter (stabiler Key für gespeicherte Credentials)
N8N_ENCRYPTION_KEY=<hex-key>

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
| `import:tags` | Tag-Stammdaten importieren |
| `sync` | Täglicher Sync: laufende Anime + aktuelle Season inkl. Episoden |
| `mirror` | Cover/Banner/Portraits lokal nach `public/media` spiegeln (inkrementell) |
| `translate` | Beschreibungen ins Deutsche umschreiben (Claude Haiku, inkrementell) |
| `news:anime` | Ankündigungs-/Simulcast-Artikel je neuem Titel (siehe Redaktion) |
| `backfill:languages` | `availableLanguages` aus vorhandenen Daten ableiten |
| `scripts/db-push.ts` | Additiver Schema-Push (nur mit `NODE_ENV=development`) |
| `scripts/_hentai-backfill.ts` | Einmal: `isHentai` für bestehende Hentai-Titel setzen |

### Auf dem HOST (Python, `pip install curl_cffi`)

Brauchen TLS-Impersonation (Cloudflare) bzw. eine **DE-IP**. Wöchentlich genügt.

| Script | Zweck |
|---|---|
| `crunchyroll-dub.py` | Echte Ger-/Eng-Dub & -Sub aus der Crunchyroll-Content-API |
| `justwatch-streaming.py` | Anbieter-Verfügbarkeit (`--recent N`, `--only-missing`) → `streamingProviders` |
| `wikipedia-dub.py` | Legale Ger-Dub-Ergänzung (Klassiker/Filme) via Wikidata |
| `studio-logos.py` | Studio-Logos (Wikimedia Commons) + Websites aus Wikidata |

> **Datenquellen:** AniList liefert keine Sprach-Info. Dub-/Sub-Daten kommen aus
> Crunchyroll (echte `audio_locales`) + Wikipedia. aniSearch scheidet bewusst aus
> (ToS). Cron-Beispiele & Details: [`docs/BETRIEB.md`](docs/BETRIEB.md).

---

## Redaktion & Automatik

- **`generate-anime-news.ts`** — erzeugt pro neuem Titel einen Artikel: ein
  **deterministischer Steckbrief** (Studio, Genres, Episoden, Release, Plattform,
  Vorgänger-Staffel) + KI-Rewrite der Beschreibung im „Otaku/Weeb-Stil" (Sonnet).
  Modi: `--recent N`, `--season-current`, `--slug <slug>`, `--draft`, `--dry`.
  Hentai-Titel werden **nie** automatisch erzeugt (nur manuell).
- **`telegram-notify.ts`** — postet neue, veröffentlichte Artikel in den Telegram-Channel
  (`telegramPostedAt`-Feld als Dedup). Flags `--max N`, `--seed`, `--dry`.
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
- **Telegram** — News-Kanal `@otakupulse_de` (Bot postet Artikel automatisch);
  Landingpage `/anime-telegram-kanal`.
- **X / Twitter** — `@OtakuPulseDE` (Header/Footer).

**n8n-Autoposter** (`n8n-workflows/otakupulse-autoposter.json`): self-hosteter
Container `otakupulse-n8n` (LAN, Port 5678) zieht intern
`http://otakupulse-app:3000/feed.xml` und postet neue Artikel nach **Discord,
Mastodon, Bluesky, Reddit und Facebook**. Dedup über den RSS-Trigger; Tokens werden
im n8n-UI eingetragen. Anleitung: `n8n-workflows/README.md`.

> Die Footer-„Community"-Spalte (Discord/Telegram/X-Landingpages) ist **fest in
> `components/Footer.tsx`** verdrahtet — nicht über das CMS pflegbar.

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
- Hentai-Titel werden **nie** automatisch in News/RSS eingespeist (nur manuell).

---

## SEO

- **Landingpages**: Startseite (Index mit allen Bereichen, Stats, Rotation),
  `/anime`, `/top-anime`, `/genre` — je mit Intro-Text, FAQ-Schema und `ItemList`-JSON-LD.
- **Programmatische Intent-Seiten** (Longtail):
  - `/streamen/[slug]` — „Wo läuft *X* im Stream?" (nur mit Anbietern indexierbar)
  - `/aehnlich/[slug]` — „Anime ähnlich wie *X*" (Empfehlungen + Relationen + Genre-Fallback)
  - Dünne Varianten setzen automatisch `noindex`.
- **Eigene deutsche Beschreibungen** für ~100 % der Anime + alle Genres/Tags/Studios
  (gegen Duplicate Content; via `translate`).
- **Bilder lokal gespiegelt** (kein CDN-Leak, schneller; `next/image`-Optimierung).
- **Structured Data**: `WebSite`+`SearchAction`, `Organization`, `BreadcrumbList`,
  `CollectionPage`, `ItemList`, `FAQPage`.
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
- **Google „Subscribe with Google"** (Reader Revenue Manager, Open Access):
  `components/SubscribeWithGoogle.tsx` nur auf Artikelseiten + `NewsArticle`-JSON-LD
  mit `isAccessibleForFree`/`isPartOf` (Publication `CAow_dDLDA`).

---

## Analytics (Umami, self-hosted)

Datenschutzfreundlich, cookielos, lädt **nur nach Statistik-Einwilligung** (Consent).

- Container `umami` + `umami-db` (eigene Postgres) im Docker-Netz `otakupulse-net`.
- **First-Party** eingebunden: `next.config.mjs` proxyt `/stats/script.js` und
  `/stats/api/send` auf den Umami-Container → kein Dritt-Host, CSP bleibt `'self'`,
  adblock-resistent. `/api` bleibt für Payload frei.
- Dashboard nur im LAN (`http://<unraid-ip>:3002`).
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

# 2. neu bauen (im enrich-Container, der den Code bind-mountet)
docker exec --env-file frontend/secrets.env otakupulse-enrich \
  sh -lc 'cd /app && npm run build'

# 3. App starten + Health prüfen
docker start otakupulse-app
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001/

# Rollback bei Problemen: mv .next.bak zurück nach .next, App neu starten
```

Bei **Schema-Änderungen** vorher `db-push.ts` ausführen (s. o.), damit der neue Code
nicht auf fehlende Spalten trifft. Mehr in [`docs/BETRIEB.md`](docs/BETRIEB.md).

---

## Cronjobs

Reboot-fest über Unraid (`/boot/config/plugins/dynamix/*.cron` → `update_cron`):

| Zeit | Job | Zweck |
|---|---|---|
| `30 3 * * *` | `backup-db.sh` | DB-Backup lokal + B2-Offsite, rotierend |
| `15 4 * * *` | `otakupulse-sync.sh` | AniList-Sync → JustWatch → News → Telegram |
| `*/30 * * * *` | `telegram-notify.ts` | neue Artikel in den Channel posten |
| `*/5 * * * *` | `watchdog.sh` | Uptime-Watchdog + Auto-Neustart |

---

## Sicherheit

- `secrets.env`, `.env*`, `rclone.conf`, `bin/`, `db/`, `__pycache__/`, `.next*` sind
  **gitignored** — niemals committen.
- Versehentlich geteilte Keys (`ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, B2-Key)
  in den jeweiligen Dashboards **rotieren**.
- Härtung: Payload-Field-Access (interne Felder API-seitig versteckt), Drafts nicht
  öffentlich, **CSP** (`'self'`), **CORS/CSRF** auf die eigene Domain begrenzt,
  Login-Rate-Limit, On-Demand-Import mit Flut-Schutz.
- **HTTP-Header** (`next.config.mjs`, öffentliche Routen): HSTS, X-Content-Type-Options,
  X-Frame-Options, Referrer-/Permissions-Policy, **COOP** (same-origin),
  **CORP** (cross-origin), **COEP** (credentialless), `poweredByHeader: false`.
  CSP-Freigaben für GA und `news.google.com` (Subscribe with Google).
- **`public/.well-known/security.txt`** (RFC 9116). Offen: **DNSSEC** (Cloudflare).
- Admin nur unter `/legal/admin` erreichbar.
- Rechtsseiten: `/impressum`, `/datenschutz`, `/nutzungsbedingungen` (ToS).

---

## Lizenz

Privates Projekt — **all rights reserved**. Keine Nutzung/Weitergabe ohne Erlaubnis.
