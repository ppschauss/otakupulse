# OtakuPulse

Deutschsprachige Anime-Datenbank — Titel, Studios, Genres, Streaming-Verfügbarkeit,
Dub-/Sub-Sprachen, Simulcast-Kalender und automatisch generierte News.

Daten stammen aus **AniList** (Stammdaten), angereichert um echte **Dub-/Sub-Sprachen**
und **Streaming-Anbieter** aus mehreren Quellen (siehe unten).

## Stack

- **Next.js 16** (App Router, React 19) — Frontend & Server Components
- **Payload CMS 3.85** — Collections, Local API, Admin unter `/legal/admin`
- **PostgreSQL** — via `@payloadcms/db-postgres` (Dev-Push-Modus, keine Migrationen)
- **Docker** — `otakupulse-app` (Port 3001 → intern 3000) + `otakupulse-db`
- Host-Skripte (Grau-Zonen-Scraper) in **Python** mit `curl_cffi` (TLS-Impersonation)

## Projektstruktur

```
otakupulse/
├── frontend/              # Next.js + Payload App
│   ├── src/
│   │   ├── app/(frontend) # öffentliche Seiten (suche, news, studio, plattform …)
│   │   ├── collections/   # Payload-Collections (Anime, Studios, News …)
│   │   ├── components/    # React-Komponenten
│   │   ├── lib/           # Hilfen (streaming.ts, import.ts, anime.ts, seo.ts …)
│   │   └── scripts/       # Import-/Sync-/Scraper-Skripte (.ts + .py)
│   └── package.json
├── docs/BETRIEB.md        # Betrieb, Deployment, Cron, Sicherheit
└── README.md
```

## Setup (lokal / Docker)

Voraussetzung: laufender Postgres + `frontend/secrets.env` (siehe unten).

```sh
cd frontend
npm install
npm run dev            # Dev-Server auf 0.0.0.0:3000 (im Container → Host-Port 3001)
```

Admin-Oberfläche: `http://localhost:3001/legal/admin`
Admin-User anlegen: `npm run payload -- ...` bzw. `tsx src/scripts/create-admin.ts`

### secrets.env (NIE committen — steht in `.gitignore`)

```
DATABASE_URI=postgres://USER:PASS@otakupulse-db:5432/otakupulse
PAYLOAD_SECRET=<langer-zufallsstring>
ANTHROPIC_API_KEY=<key>                      # für News-Generierung/Übersetzung
# optional Analytics / Search Console — siehe docs/BETRIEB.md
```

## Daten-Pipeline

### Im Container (`npm run …`)

| Script | Zweck |
|---|---|
| `import:anime` | Einzelnen Anime von AniList importieren |
| `import:batch` | Massenimport (`-- --pages N [--episodes]`) |
| `import:tags` | Tag-Stammdaten importieren |
| `sync` | Täglicher Sync: laufende Anime + aktuelle Season inkl. Episoden |
| `mirror` | Cover/Bilder lokal spiegeln |
| `translate` | Beschreibungen ins Deutsche übersetzen (Anthropic) |
| `news` | News-Beiträge generieren |
| `backfill:languages` | `availableLanguages` aus vorhandenen Daten ableiten |

### Auf dem HOST (Python, `pip install curl_cffi`)

Brauchen TLS-Impersonation (Cloudflare) bzw. eine **DE-IP**. Wöchentlich genügt.

| Script | Zweck |
|---|---|
| `crunchyroll-dub.py` | Echte Ger-/Eng-Dub & -Sub aus der Crunchyroll-Content-API (`audio_locales`) |
| `justwatch-streaming.py` | Anbieter-Verfügbarkeit (alle DE-Plattformen) → `streamingProviders` |
| `wikipedia-dub.py` | Legale Ger-Dub-Ergänzung (Klassiker/Filme) via Wikidata + de.wikipedia |
| `studio-logos.py` | Studio-Logos (Wikimedia Commons) + Websites aus Wikidata |

> **Hinweis Datenquellen:** AniList liefert keine Sprach-Info. Dub-/Sub-Daten kommen
> aus Crunchyroll (echte `audio_locales`) + Wikipedia. aniSearch scheidet bewusst aus
> (ToS verbietet Weiterverbreitung). Details & Cron-Beispiele in [`docs/BETRIEB.md`](docs/BETRIEB.md).

## Produktion

`next dev` ist langsam. Für den Launch auf `npm run build` + `npm run start` umstellen
(Container-Command anpassen). ISR ist auf Startseite/Kalender aktiv. Siehe
[`docs/BETRIEB.md`](docs/BETRIEB.md).

## Sicherheit

- `secrets.env`, `.env*`, `__pycache__/` sind in `.gitignore` — **niemals committen**.
- Bei versehentlich geteiltem `ANTHROPIC_API_KEY`: im Anthropic-Dashboard rotieren.
- Admin nur unter `/legal/admin` erreichbar.

## Lizenz

Privates Projekt — **all rights reserved**. Keine Nutzung/Weitergabe ohne Erlaubnis.
