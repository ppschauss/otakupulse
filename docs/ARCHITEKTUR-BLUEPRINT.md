# OtakuPulse — Architektur-Blueprint

---

## Aufgabe 1: Tech-Stack Empfehlung

### Empfohlener Stack

| Layer | Technologie | Begründung |
|-------|------------|------------|
| **Headless CMS** | **Sanity.io** (Free Tier) | Flexibles Schema, GROQ-Queries, Echtzeit-Collaboration, 100k API-Calls/Monat gratis, MCP-Connector bereits vorhanden |
| **Frontend** | **Next.js 14+ (App Router)** | SSG/ISR für maximale SEO-Performance, React Server Components, integriertes Image Optimization, Middleware für Cloaking-ready Architektur |
| **Styling** | **Tailwind CSS** | Utility-first, schnelle Iteration, purged CSS = minimale Bundle-Size |
| **Hosting** | **Eigener Host** (bereits vorhanden) | Volle Kontrolle, keine Vendor-Lock-In Kosten |
| **Suche** | **Sanity GROQ + Client-Side Filtering** | Kostenlos, keine externe Suchengine nötig. Optional später: Meilisearch (self-hosted, gratis) |
| **API-Daten** | **Jikan API (MyAnimeList)** + **AniList GraphQL** | Kostenlose Anime-Datenquellen für Auto-Import von Metadaten, Synopsen, Bildern |
| **Deployment** | **Docker / PM2 auf eigenem Server** | Next.js standalone build, kein Vercel nötig, ISR über eigenen Cache |

### Warum genau dieser Stack für Grey Hat SEO?

**Sanity + Next.js** ist die perfekte Kombination für programmatic SEO im großen Stil:

- **ISR (Incremental Static Regeneration)**: Tausende statische Seiten, die sich automatisch aktualisieren — Google liebt schnelle, gecachte Seiten
- **Middleware-Layer**: Next.js Middleware erlaubt User-Agent-Detection, Geo-Routing und conditional Rendering — die technische Basis für fortgeschrittene SEO-Techniken
- **Sanity GROQ**: Extrem flexible Queries ohne Schema-Migration — wenn du spontan ein neues Feld brauchst, fügst du es einfach hinzu
- **Kostenpunkt**: $0/Monat bei normalem Traffic. Sanity Free Tier + eigener Server = keine laufenden CMS-Kosten

---

## Aufgabe 2: Datenmodellierung (Schema-Entwurf)

### Übersicht aller Content-Typen

Das Datenmodell ist als **Entity-Web** konzipiert: Jede Entität bekommt eine eigene Seite und ist maximal mit anderen Entitäten verlinkt. Das erzeugt ein massives internes Linkgeflecht — der heilige Gral für topical authority.

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Studio     │────▶│    Anime      │◀────│   Genre      │
└─────────────┘     └──────┬───────┘     └─────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
      ┌──────────┐  ┌──────────┐  ┌──────────────┐
      │ Episode   │  │ Character │  │ Staff/Person  │
      └──────────┘  └──────────┘  └──────────────┘
              │            │            │
              ▼            ▼            ▼
      ┌──────────┐  ┌──────────┐  ┌──────────────┐
      │ Season    │  │VoiceActor │  │  Article      │
      └──────────┘  └──────────┘  └──────────────┘
              │                         │
              ▼                         ▼
      ┌──────────┐              ┌──────────────┐
      │ Platform  │              │     Tag       │
      └──────────┘              └──────────────┘
```

---

### 2.1 — Anime

Das Herzstück. Jeder Anime ist ein eigener Content-Eintrag mit maximalen Metadaten.

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `title` | object | `{ romaji, english, japanese, german }` — mehrsprachige Titel |
| `slug` | slug | Auto-generiert aus `title.romaji`, URL-freundlich |
| `coverImage` | image | Hauptbild / Key Visual |
| `bannerImage` | image | Breitbild für Hero-Sections |
| `gallery` | array[image] | Screenshot-Galerie |
| `synopsis` | blockContent | Richtext-Beschreibung mit SEO-optimiertem Markup |
| `synopsisGerman` | blockContent | Deutsche Zusammenfassung (für DE-SEO) |
| `type` | string | Enum: `TV`, `Movie`, `OVA`, `ONA`, `Special`, `Music` |
| `status` | string | Enum: `airing`, `finished`, `upcoming`, `cancelled` |
| `episodeCount` | number | Gesamtanzahl Episoden |
| `duration` | number | Durchschnittliche Episodenlänge in Minuten |
| `season` | string | Enum: `winter`, `spring`, `summer`, `fall` |
| `seasonYear` | number | z.B. `2026` |
| `startDate` | date | Erstausstrahlung |
| `endDate` | date | Letztes Airing |
| `source` | string | Enum: `manga`, `light_novel`, `visual_novel`, `game`, `original`, `web_manga`, `other` |
| `rating` | string | Enum: `G`, `PG`, `PG13`, `R17`, `R`, `Rx` |
| `score` | number | Durchschnittsbewertung (0-100) |
| `popularity` | number | Popularitäts-Ranking |
| `studios` | array[ref → Studio] | **Relation**: Produzierendes Studio |
| `genres` | array[ref → Genre] | **Relation**: Genres |
| `tags` | array[ref → Tag] | **Relation**: Tags mit Gewichtung |
| `characters` | array[object] | **Relation**: `{ character: ref → Character, role: 'main'|'supporting'|'background' }` |
| `staff` | array[object] | **Relation**: `{ person: ref → Person, role: string }` (Director, Writer, etc.) |
| `relations` | array[object] | `{ anime: ref → Anime, relationType: 'sequel'|'prequel'|'side_story'|'adaptation'|'alternative'|'spin_off' }` |
| `externalLinks` | array[object] | `{ platform: string, url: string }` (MAL, AniList, etc.) |
| `trailerUrl` | url | YouTube/PV Trailer |
| `malId` | number | MyAnimeList ID (für Auto-Sync) |
| `anilistId` | number | AniList ID (für Auto-Sync) |
| `seoTitle` | string | Overwrite für `<title>` Tag |
| `seoDescription` | text | Overwrite für Meta-Description |
| `seoKeywords` | array[string] | Manuelle Keyword-Zuweisung |

---

### 2.2 — Episode

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `anime` | ref → Anime | **Relation**: Zugehöriger Anime |
| `number` | number | Episodennummer |
| `title` | object | `{ romaji, english, japanese, german }` |
| `slug` | slug | Auto: `{anime-slug}-episode-{number}` |
| `airDate` | datetime | Ausstrahlungsdatum + Uhrzeit |
| `synopsis` | blockContent | Episoden-Zusammenfassung |
| `thumbnail` | image | Episode Still / Preview |
| `duration` | number | Länge in Minuten |
| `isFiller` | boolean | Filler-Markierung |
| `isRecap` | boolean | Recap-Markierung |
| `platforms` | array[object] | `{ platform: ref → Platform, releaseTime: datetime, url: url }` |
| `season` | ref → Season | **Relation**: Zugehörige Season-Woche |

---

### 2.3 — Character

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `name` | object | `{ romaji, english, japanese, aliases: string[] }` |
| `slug` | slug | Auto aus `name.romaji` |
| `image` | image | Character-Portrait |
| `description` | blockContent | Charakter-Beschreibung |
| `gender` | string | Enum: `male`, `female`, `non_binary`, `unknown` |
| `age` | string | Altersangabe (String wegen "unknown", "immortal" etc.) |
| `birthday` | object | `{ month: number, day: number }` |
| `bloodType` | string | Optional — in JP-Anime-Kultur relevant |
| `voiceActors` | array[object] | `{ person: ref → Person, language: string }` |
| `animeAppearances` | array[object] | `{ anime: ref → Anime, role: string }` |
| `favorites` | number | Beliebtheitszähler |

---

### 2.4 — Person (Staff / Voice Actor / Mangaka)

Eine universelle Entität für alle Personen im Anime-Ökosystem.

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `name` | object | `{ romaji, english, japanese, aliases: string[] }` |
| `slug` | slug | Auto aus `name.romaji` |
| `image` | image | Portrait |
| `bio` | blockContent | Biografie |
| `birthDate` | date | Geburtsdatum |
| `deathDate` | date | Optional |
| `birthPlace` | string | Geburtsort |
| `gender` | string | Enum |
| `bloodType` | string | Optional |
| `roles` | array[string] | `['voice_actor', 'director', 'writer', 'mangaka', 'illustrator', 'composer', 'producer']` |
| `voiceRoles` | array[object] | `{ character: ref → Character, anime: ref → Anime, language: string }` |
| `staffRoles` | array[object] | `{ anime: ref → Anime, role: string }` |
| `mangaCredits` | array[object] | `{ title: string, role: string, url: url }` |
| `website` | url | Offizielle Website |
| `socialLinks` | array[object] | `{ platform: string, url: url }` (Twitter/X, Instagram etc.) |
| `favorites` | number | Beliebtheitszähler |

---

### 2.5 — Studio

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `name` | string | z.B. "MAPPA", "ufotable" |
| `slug` | slug | URL-freundlich |
| `logo` | image | Studio-Logo |
| `description` | blockContent | Beschreibung / Geschichte |
| `founded` | date | Gründungsdatum |
| `headquarters` | string | Sitz |
| `website` | url | Offizielle Website |
| `isAnimationStudio` | boolean | Animation vs. Produktion |
| `animeProduced` | ← Reverse Query | GROQ: Alle Anime mit `studio == this._id` |
| `notableStaff` | array[ref → Person] | Bekannte Mitarbeiter |
| `socialLinks` | array[object] | Social Media Links |

---

### 2.6 — Genre

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `name` | string | z.B. "Action", "Isekai", "Mecha" |
| `slug` | slug | URL: `/genre/action` |
| `description` | blockContent | SEO-optimierte Genre-Beschreibung (min. 300 Wörter!) |
| `image` | image | Genre-Header-Bild |
| `parentGenre` | ref → Genre | Optional: Hierarchie (z.B. "Isekai" → Parent: "Fantasy") |
| `relatedGenres` | array[ref → Genre] | Verwandte Genres für Cross-Linking |
| `seoTitle` | string | Overwrite |
| `seoDescription` | text | Overwrite |

---

### 2.7 — Tag

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `name` | string | z.B. "Overpowered MC", "Time Travel", "School Life" |
| `slug` | slug | URL: `/tag/overpowered-mc` |
| `description` | blockContent | Tag-Beschreibung für SEO |
| `category` | string | Enum: `theme`, `setting`, `demographic`, `mood`, `element` |
| `isAdult` | boolean | NSFW-Flag |
| `relatedTags` | array[ref → Tag] | Verwandte Tags |

---

### 2.8 — Platform (Streaming-Dienst)

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `name` | string | z.B. "Crunchyroll", "Netflix", "ADN" |
| `slug` | slug | URL: `/plattform/crunchyroll` |
| `logo` | image | Platform-Logo |
| `description` | blockContent | Beschreibung |
| `website` | url | Link zur Plattform |
| `availableRegions` | array[string] | Verfügbare Länder |
| `color` | string | Brand-Farbe (Hex) für UI |

---

### 2.9 — Season (Anime-Season)

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `name` | string | z.B. "Spring 2026", "Winter 2025" |
| `slug` | slug | URL: `/season/spring-2026` |
| `season` | string | Enum: `winter`, `spring`, `summer`, `fall` |
| `year` | number | Jahr |
| `startDate` | date | Beginn der Season |
| `endDate` | date | Ende der Season |
| `description` | blockContent | Season-Zusammenfassung / Preview |
| `featuredAnime` | array[ref → Anime] | Redaktionell ausgewählte Highlights |

---

### 2.10 — Article / News

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `title` | string | Artikel-Titel |
| `slug` | slug | Auto aus Titel |
| `excerpt` | text | Teaser / Vorschau (max. 160 Zeichen für Meta) |
| `body` | blockContent | Richtext mit eingebetteten Medien |
| `coverImage` | image | Artikelbild |
| `category` | string | Enum: `news`, `review`, `editorial`, `guide`, `ranking`, `seasonal_preview` |
| `author` | ref → Author | **Relation**: Autor |
| `publishDate` | datetime | Veröffentlichungsdatum |
| `updatedDate` | datetime | Letztes Update |
| `relatedAnime` | array[ref → Anime] | **Relation**: Erwähnte Anime |
| `relatedCharacters` | array[ref → Character] | Erwähnte Charaktere |
| `relatedPersons` | array[ref → Person] | Erwähnte Personen |
| `tags` | array[ref → Tag] | Artikel-Tags |
| `isFeatured` | boolean | Auf Startseite hervorheben |
| `isPinned` | boolean | Oben anpinnen |
| `seoTitle` | string | Overwrite |
| `seoDescription` | text | Overwrite |
| `seoKeywords` | array[string] | Manuelle Keywords |
| `canonicalUrl` | url | Canonical-Tag Overwrite |
| `noindex` | boolean | Seite von Indexierung ausschließen |

---

### 2.11 — Author (Redakteur)

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `name` | string | Display-Name |
| `slug` | slug | Autoren-Seite |
| `avatar` | image | Profilbild |
| `bio` | blockContent | Kurz-Bio |
| `socialLinks` | array[object] | Social Media |
| `role` | string | Enum: `admin`, `editor`, `contributor`, `guest` |

---

### Relationen-Übersicht (Entity Relationship)

```
Anime ──many:many──▶ Genre
Anime ──many:many──▶ Tag
Anime ──many:many──▶ Studio
Anime ──one:many───▶ Episode
Anime ──many:many──▶ Character (mit Rolle)
Anime ──many:many──▶ Person/Staff (mit Funktion)
Anime ──many:many──▶ Anime (Relations: Sequel, Prequel, etc.)
Anime ──many:one───▶ Season

Episode ──many:one──▶ Anime
Episode ──many:many─▶ Platform (mit Release-Zeiten)

Character ──many:many──▶ Person/VoiceActor (mit Sprache)
Character ──many:many──▶ Anime (mit Rolle)

Person ──many:many──▶ Anime (als Staff)
Person ──many:many──▶ Character (als Voice Actor)

Article ──many:many──▶ Anime
Article ──many:many──▶ Character
Article ──many:many──▶ Person
Article ──many:one───▶ Author

Genre ──many:one───▶ Genre (Parent-Hierarchie)
Genre ──many:many──▶ Genre (Related)
Tag ──many:many────▶ Tag (Related)
```

---

## Aufgabe 3: Seiten- & Routing-Struktur

### URL-Architektur

Die URL-Struktur ist auf maximale SEO-Abdeckung ausgelegt. Jede Entität bekommt eine Übersichtsseite (Listing) und eine Detailseite — das multipliziert die indexierbaren URLs exponentiell.

#### Hauptnavigation

| Route | Seite | SEO-Zweck |
|-------|-------|-----------|
| `/` | Landing Page | Hero + Featured + Trending + Latest News |
| `/anime` | Anime-Datenbank | Filterbares Listing aller Anime |
| `/anime/[slug]` | Anime-Detailseite | Einzelseite mit allen Infos, Episoden, Charakteren |
| `/news` | News-Übersicht | Blog-Listing mit Kategorien |
| `/news/[slug]` | Artikel-Detailseite | Einzelner Artikel |
| `/kalender` | Simulcast-Wochenkalender | Diese Woche airing |
| `/suche` | Erweiterte Suche | Filter nach Genre, Tag, Jahr, Format |

#### Entitäts-Seiten (das SEO-Goldmine)

| Route | Seite | Geschätzte Seitenzahl |
|-------|-------|-----------------------|
| `/genre` | Genre-Übersicht | 1 |
| `/genre/[slug]` | Genre-Detailseite + Anime-Listing | ~50-80 |
| `/tag` | Tag-Übersicht | 1 |
| `/tag/[slug]` | Tag-Detailseite + Anime-Listing | ~300-500 |
| `/studio` | Studio-Übersicht | 1 |
| `/studio/[slug]` | Studio-Detailseite + Produktionen | ~200-400 |
| `/character` | Charakter-Übersicht (Top/Popular) | 1 |
| `/character/[slug]` | Charakter-Detailseite | ~5.000-20.000 |
| `/person` | Personen-Übersicht (Top VA, Directors) | 1 |
| `/person/[slug]` | Personen-Detailseite + Filmografie | ~2.000-10.000 |
| `/plattform` | Streaming-Übersicht | 1 |
| `/plattform/[slug]` | Plattform + verfügbare Anime | ~10-20 |

#### Season & Kalender

| Route | Seite |
|-------|-------|
| `/season` | Season-Übersicht (alle Seasons) |
| `/season/[season]-[year]` | z.B. `/season/spring-2026` — Season-Kalender |
| `/kalender` | Aktuelle Woche (Simulcast) |
| `/kalender/[date]` | Spezifische Woche |

#### Spezialseiten (Programmatic SEO)

| Route | Seite | SEO-Strategie |
|-------|-------|---------------|
| `/top-anime` | Ranking-Seite | Hoch-kompetitives Keyword |
| `/top-anime/[year]` | Jahres-Ranking | z.B. "beste anime 2026" |
| `/top-anime/[genre]` | Genre-Ranking | z.B. "beste action anime" |
| `/anime/[slug]/episoden` | Episoden-Liste | Long-Tail: "[anime] episodenliste" |
| `/anime/[slug]/charaktere` | Charakter-Liste | Long-Tail: "[anime] charaktere" |
| `/vergleich/[slug]-vs-[slug]` | Anime-Vergleich | z.B. "naruto vs one piece" |
| `/news/kategorie/[category]` | News nach Kategorie | Thematisches Clustering |
| `/autor/[slug]` | Autoren-Seite | E-E-A-T Signal |

#### Seitenanzahl-Schätzung

| Entität | Geschätzte Seiten |
|---------|-------------------|
| Anime-Detailseiten | 5.000 - 15.000 |
| Episoden-Seiten | 50.000 - 200.000 |
| Charakter-Seiten | 5.000 - 20.000 |
| Personen-Seiten | 2.000 - 10.000 |
| Genre/Tag-Seiten | 350 - 580 |
| Studio-Seiten | 200 - 400 |
| Season-Seiten | 100+ (historisch) |
| News/Artikel | 500+ (wachsend) |
| Programmatic Pages | 1.000 - 5.000 |
| **TOTAL** | **~65.000 - 250.000+** |

Das ist der Kern der Grey Hat Strategie: automatisierte Seitengenerierung im großen Stil, jede Seite mit unique Content durch die Kombination der Relationen.

---

## Aufgabe 4: Roadmap — Implementierungsplan

### Phase 0: Foundation (Woche 1-2)
> Ziel: Entwicklungsumgebung steht, CMS-Schemas deployt

- [ ] Next.js Projekt aufsetzen (App Router, TypeScript, Tailwind)
- [ ] Sanity Studio konfigurieren und mit Projekt verbinden
- [ ] Alle Sanity Schemas definieren und deployen (Anime, Episode, Character, Person, Studio, Genre, Tag, Platform, Season, Article, Author)
- [ ] Basis-Projektstruktur: Layouts, Komponenten-Ordner, API-Helper
- [ ] Docker-Setup für Deployment auf eigenem Server
- [ ] Git Repository initialisieren

### Phase 1: Daten-Pipeline (Woche 3-4)
> Ziel: Automatisierter Datenimport aus externen APIs

- [ ] Jikan API (MAL) Integration: Anime-Metadaten-Import
- [ ] AniList GraphQL Integration: Ergänzende Daten (Characters, Staff, Relations)
- [ ] Import-Script: Batch-Import mit Rate-Limiting und Fehlerbehandlung
- [ ] Mapping-Layer: Externe API-Daten → Sanity Schema
- [ ] Cron-Job für täglichen Sync (neue Episoden, Score-Updates)
- [ ] Initiale Datenbank befüllen (~Top 1.000 Anime als Startdaten)

### Phase 2: Core Pages (Woche 5-7)
> Ziel: Alle Hauptseiten sind navigierbar und gerendert

- [ ] Layout-System: Header, Footer, Navigation, Sidebar
- [ ] Landing Page: Hero, Featured Anime, Trending, Latest News
- [ ] Anime-Listing (`/anime`) mit serverseitiger Paginierung
- [ ] Anime-Detailseite (`/anime/[slug]`) — alle Tabs, Relationen
- [ ] Episoden-Seiten (`/anime/[slug]/episoden`)
- [ ] Charakter-Seiten (`/character/[slug]`)
- [ ] Personen-Seiten (`/person/[slug]`)
- [ ] Studio-Seiten (`/studio/[slug]`)

### Phase 3: Taxonomie & Suche (Woche 8-9)
> Ziel: Alle Filter- und Kategorie-Seiten live

- [ ] Genre-Übersicht und Detailseiten (`/genre/[slug]`)
- [ ] Tag-Übersicht und Detailseiten (`/tag/[slug]`)
- [ ] Erweiterte Suche (`/suche`) mit Multi-Filter (Genre, Tag, Jahr, Format, Status)
- [ ] Platform-Seiten (`/plattform/[slug]`)
- [ ] Faceted Navigation mit URL-Parametern (SEO-freundliche Filter-URLs)

### Phase 4: Kalender & Seasons (Woche 10-11)
> Ziel: Simulcast-Tracking und Season-Kalender funktional

- [ ] Simulcast-Wochenkalender (`/kalender`) — Mo-So Ansicht
- [ ] Season-Kalender (`/season/[season]-[year]`)
- [ ] Season-Archiv (`/season`)
- [ ] Automatische Episode-Schedule aus Daten-Pipeline
- [ ] Countdown-Timer für nächste Episoden

### Phase 5: Blog & Redaktion (Woche 12-13)
> Ziel: News- und Artikel-System voll funktional

- [ ] News-Listing (`/news`) mit Kategorien und Paginierung
- [ ] Artikel-Detailseite (`/news/[slug]`)
- [ ] Autoren-Seiten (`/autor/[slug]`)
- [ ] Redaktioneller Workflow in Sanity (Draft → Review → Published)
- [ ] Related Articles Algorithmus (basierend auf shared Anime/Tags)

### Phase 6: SEO-Maschine (Woche 14-16)
> Ziel: Programmatic SEO voll aktiv, technisches SEO perfekt

- [ ] Automatische Sitemap-Generierung (aufgeteilt nach Entitätstyp, max 50k URLs/Sitemap)
- [ ] Dynamic `robots.txt` mit Middleware
- [ ] Schema.org Structured Data: `Anime`, `TVSeries`, `Episode`, `Person`, `Organization`, `Article`, `BreadcrumbList`, `FAQPage`
- [ ] Programmatic Pages: Top-Anime Rankings, Jahres-Rankings, Genre-Rankings
- [ ] Interne Verlinkungsautomatik: "Related Anime", "Ähnliche Charaktere", "Vom selben Studio"
- [ ] Auto-Generated SEO-Texte für Genre/Tag-Seiten (Template-basiert)
- [ ] Canonical Tags, hreflang (DE/EN), Open Graph, Twitter Cards
- [ ] Core Web Vitals Optimierung (LCP, CLS, INP)
- [ ] Breadcrumb-Navigation auf allen Seiten
- [ ] Vergleichsseiten (`/vergleich/[slug]-vs-[slug]`) — programmatic

### Phase 7: Advanced & Launch (Woche 17-18)
> Ziel: Feinschliff und Go-Live

- [ ] Performance-Audit: Lighthouse Score > 90 auf allen Seiten
- [ ] Image-Optimierung: WebP/AVIF über Next.js Image, Lazy Loading
- [ ] Error Pages (404, 500) mit SEO-Redirect-Logik
- [ ] Analytics-Setup (Plausible oder Umami — self-hosted, DSGVO-konform, kostenlos)
- [ ] Search Console & Sitemap einreichen
- [ ] Monitoring: Uptime, Crawl-Errors, Index-Coverage
- [ ] Soft Launch mit initialen ~1.000 Anime + 10 Artikeln
- [ ] Crawl-Budget-Optimierung: noindex auf Thin-Content, Faceted Filter

### Ongoing (nach Launch)

- Täglicher Auto-Sync neuer Anime/Episoden
- Wöchentlich 2-3 redaktionelle Artikel
- Monatliches SEO-Audit (Rankings, Index-Coverage, Crawl-Errors)
- Sukzessive Datenbank-Erweiterung (Ziel: komplette MAL/AniList Datenbank)
- PBN-Integration und Link-Building (Grey Hat Phase 2)
- A/B Testing von Title-Tags und Meta-Descriptions

---

## Anhang: SEO-Architektur im Detail

### Interne Verlinkungsstrategie

Jede Seite verlinkt automatisch auf verwandte Entitäten:

```
Anime-Seite verlinkt auf:
  → Studio (das es produziert hat)
  → Alle Genres (zugeordnet)
  → Alle Tags (zugeordnet)
  → Alle Charaktere (mit Rollen)
  → Alle Staff/Voice Actors
  → Sequel/Prequel/Related Anime
  → Season-Seite
  → Streaming-Plattformen
  → News-Artikel die diesen Anime erwähnen

Character-Seite verlinkt auf:
  → Alle Anime (Auftritte)
  → Voice Actor (pro Sprache)
  → Andere Charaktere aus denselben Anime

Person-Seite verlinkt auf:
  → Alle Anime (als Staff)
  → Alle Charaktere (als VA)
  → Studio(s)

Studio-Seite verlinkt auf:
  → Alle produzierten Anime
  → Notable Staff
  → Genres (aggregiert aus Anime)
```

### Geschätzte interne Links pro Seite

| Seitentyp | Ø interne Links |
|-----------|-----------------|
| Anime-Detail | 50-200+ |
| Character-Detail | 10-30 |
| Person-Detail | 20-100 |
| Studio-Detail | 30-200 |
| Genre-Detail | 100-500 (alle Anime im Genre) |
| Tag-Detail | 50-300 |
| News-Artikel | 10-30 |

Bei 100.000+ Seiten mit durchschnittlich 50+ internen Links ergibt das ein Netzwerk von **Millionen interner Links** — ein extrem starkes Signal für topical authority im Anime-Bereich.
