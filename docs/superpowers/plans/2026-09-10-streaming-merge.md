# Streaming-Merge & Listen-Seiten — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine URL pro Anime mit belastbarem, anbieter-genauem Streaming-Block; `/streamen/` und `/aehnlich/` per Redirect eingefaltet; Plattform-Listen-Seiten als indexierbare Intent-Seiten; Indexregeln nach Inhaltsqualität.

**Architecture:** Neues Payload-Array-Feld `streamingOffers` am Anime wird vom (umgebauten) JustWatch-Host-Skript per SQL befüllt; `streamingProviders`/`availableLanguages` bleiben als abgeleitete Filter-Indizes. Frontend liest Offers über `lib/streaming.ts`, rendert `StreamingBox` auf der Anime-Seite und generiert Listen-Seiten `/plattform/[slug]/[filter]` per SQL über die Offers-Tabelle. Redirects in `next.config.mjs`, Sitemap-/IndexNow-Typen bereinigt, Indexregel zentral in `lib/anime.ts`.

**Tech Stack:** Next.js 16 (App Router, ISR), Payload CMS 3.85 (Postgres, Push-Modus via `db-push.ts`), Vitest, Python 3 + `curl_cffi` (Host-Skript).

**Spec:** `docs/superpowers/specs/2026-09-10-streaming-merge-spec.md`

## Global Constraints

- Repo: `frontend/` ist die Next-App. Arbeitskopie: `/mnt/cache/appdata/scratch/otakupulse-seo/otakupulse` (Branch `seo/streaming-merge`). Live-Code: `/mnt/cache/appdata/otakupulse` (Bind-Mount in `otakupulse-app`/`otakupulse-enrich`). Nichts direkt im Live-Ordner editieren.
- `node_modules` in der Arbeitskopie ist ein Symlink auf den Live-Ordner (`frontend/node_modules -> /mnt/cache/appdata/otakupulse/frontend/node_modules`); `npx vitest run` und `npx tsc --noEmit` laufen auf dem Host.
- Tests: `cd frontend && npx vitest run` (Vitest, `src/**/*.test.ts`). Typecheck: `cd frontend && npx tsc --noEmit`.
- Schema-Änderungen sind additiv und laufen über `docker exec --env-file secrets.env -e NODE_ENV=development otakupulse-enrich sh -lc 'cd /app && npx tsx src/scripts/db-push.ts'` — **erst beim Rollout (Task 10)** gegen die Live-DB, nachdem der Code nach `/mnt/cache/appdata/otakupulse` gepullt wurde.
- DB-Zugriff aus Host-Skripten: `docker exec -i otakupulse-db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'` (Muster in `justwatch-streaming.py`). Lesende Ad-hoc-Abfragen: `docker exec otakupulse-db psql -U otaku -d otakupulse -c "..."`.
- Payload-Array-Tabellen: Spalten `_order integer, _parent_id integer, id varchar (PK)`, Feldspalten snake_case. Hasmany-Select-Tabellen (`anime_streaming_providers`, `anime_available_languages`): `"order", parent_id, value enum, id serial`.
- Code-Kommentare und UI-Texte auf Deutsch, im Stil der bestehenden Dateien (erklärende Kommentare mit Begründung).
- Commits auf dem Feature-Branch, Commit-Messages Deutsch, jeweils mit den Attributions-Zeilen aus der Session.
- Keine neuen Dependencies.

---

### Task 0: Branch & Arbeitsumgebung

**Files:** keine Code-Änderung.

- [ ] **Step 1: Branch anlegen**

```bash
cd /mnt/cache/appdata/scratch/otakupulse-seo/otakupulse
git checkout -b seo/streaming-merge
git status --short   # erwartet: nur docs/superpowers/ (Spec + Plan) untracked
```

- [ ] **Step 2: Baseline prüfen**

```bash
cd frontend && npx vitest run 2>&1 | tail -4 && npx tsc --noEmit 2>&1 | tail -3
```
Erwartet: `Tests 53 passed`, tsc ohne Fehler (falls `payload-types.ts` fehlt: `npx payload generate:types` mit `--env-file ../secrets.env` im enrich-Container — siehe README).

- [ ] **Step 3: Spec + Plan committen**

```bash
cd /mnt/cache/appdata/scratch/otakupulse-seo/otakupulse
git add docs/superpowers
git commit -m "docs: Spec + Plan für Streaming-Merge und Listen-Seiten"
```

---

### Task 1: Anbieter-Register erweitern (Aniverse, ADN, Toggo, Region)

**Files:**
- Modify: `frontend/src/lib/streaming.ts` (Typ `StreamingProvider`, Register, neue Exporte)
- Modify: `frontend/src/collections/Anime.ts:96-122` (Select-Optionen aus dem Register)
- Test: `frontend/src/lib/streaming.test.ts`

**Interfaces:**
- Produces: `StreamingProvider.region?: 'DE' | 'INTL'`, `DE_PROVIDER_SLUGS: string[]`, `providerBySlug('aniverse'|'adn'|'toggo')`.

- [ ] **Step 1: Failing Test schreiben** — an `streaming.test.ts` anhängen:

```ts
import { DE_PROVIDER_SLUGS } from './streaming'

describe('Register: DE-Anbieter', () => {
  it('kennt Aniverse, ADN und Toggo mit Homepage', () => {
    for (const s of ['aniverse', 'adn', 'toggo']) {
      const p = providerBySlug(s)
      expect(p?.homepage).toMatch(/^https:\/\//)
      expect(p?.region).toBe('DE')
    }
  })
  it('DE_PROVIDER_SLUGS enthält nur DE-Anbieter und keine US/Asien-Dienste', () => {
    expect(DE_PROVIDER_SLUGS).toContain('crunchyroll')
    expect(DE_PROVIDER_SLUGS).toContain('joyn')
    expect(DE_PROVIDER_SLUGS).not.toContain('hulu')
    expect(DE_PROVIDER_SLUGS).not.toContain('bilibili')
  })
  it('matcht JustWatch-Amazon-Channels auf die Marke', () => {
    expect(providerByName('Aniverse Amazon Channel')?.slug).toBe('aniverse')
    expect(providerByName('Anime Digital Network Amazon Channel')?.slug).toBe('adn')
    expect(providerByName('RTL+ Max Amazon Channel')?.slug).toBe('rtl-plus')
  })
})
```

- [ ] **Step 2: Test laufen lassen** — `cd frontend && npx vitest run src/lib/streaming.test.ts` → FAIL (`DE_PROVIDER_SLUGS` nicht exportiert).

- [ ] **Step 3: Register erweitern** in `streaming.ts`:

Typ ergänzen:
```ts
  /** DE = in Deutschland nutzbarer Dienst (Listen-Seiten, Sitemap). INTL = nur informativ (Hulu, Bilibili …). */
  region?: 'DE' | 'INTL'
```

Bei allen bestehenden Einträgen `region` setzen: `'DE'` für crunchyroll, netflix, amazon-prime-video, disney-plus, wow, joyn, rtl-plus, anime-on-demand, paramount-plus, apple-tv, magenta-tv; `'INTL'` für hidive, hulu, bilibili, iqiyi, wetv, adult-swim, tencent. Alias `'RTL+ Max Amazon Channel'` bei rtl-plus ergänzen.

Neue Einträge (nach `rtl-plus` einfügen):
```ts
  {
    slug: 'aniverse',
    name: 'Aniverse',
    aliases: ['Aniverse', 'Aniverse Amazon Channel'],
    region: 'DE',
    color: '#ff2d55',
    homepage: 'https://www.amazon.de/channels/aniverse',
    blurb: 'Anime-Channel bei Amazon Prime Video — viele Klassiker mit deutscher Synchro.',
    about:
      'Aniverse ist ein zubuchbarer Anime-Channel innerhalb von Amazon Prime Video, hinter dem die deutschen Publisher KSM Anime, peppermint anime und Nipponart stehen. Der Katalog besteht überwiegend aus lizenzierten Serien und Filmen mit deutscher Synchronfassung — darunter viele Titel, die bei den großen Diensten fehlen.',
  },
  {
    slug: 'adn',
    name: 'ADN',
    aliases: ['ADN', 'Animation Digital Network', 'Anime Digital Network', 'Anime Digital Network Amazon Channel'],
    region: 'DE',
    color: '#00c2ff',
    homepage: 'https://animationdigitalnetwork.com/de',
    blurb: 'Animation Digital Network — europäischer Anime-Dienst, seit 2024 auch in Deutschland.',
    about:
      'ADN (Animation Digital Network) ist ein auf Anime spezialisierter Streamingdienst aus Frankreich, der seit 2024 auch in Deutschland verfügbar ist — direkt und als Channel bei Amazon Prime Video. Der Fokus liegt auf Simulcasts und einem Katalog, der sich teilweise deutlich von Crunchyroll unterscheidet.',
  },
  {
    slug: 'toggo',
    name: 'Toggo',
    aliases: ['Toggo', 'TOGGO'],
    region: 'DE',
    color: '#ffcc00',
    homepage: 'https://www.toggo.de',
    blurb: 'Kostenlose Mediathek von SUPER RTL — Kinder- und Familien-Anime mit deutscher Synchro.',
  },
```

Exporte ergänzen (unter `PROVIDER_OPTIONS`):
```ts
/** Slugs der in Deutschland nutzbaren Anbieter — Basis für Listen-Seiten und Sitemap. */
export const DE_PROVIDER_SLUGS = STREAMING_PROVIDERS.filter((p) => p.region === 'DE').map((p) => p.slug)
```

- [ ] **Step 4: `Anime.ts` Select aus dem Register speisen** — Import `import { PROVIDER_OPTIONS } from '../lib/streaming'` und die hartkodierte `options`-Liste des Feldes `streamingProviders` durch `options: PROVIDER_OPTIONS` ersetzen. (Enum-Name in Postgres bleibt `enum_anime_streaming_providers`; db-push fügt nur Werte hinzu.)

- [ ] **Step 5: Tests + Typecheck** — `npx vitest run src/lib/streaming.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/streaming.ts frontend/src/lib/streaming.test.ts frontend/src/collections/Anime.ts
git commit -m "Streaming: Aniverse, ADN, Toggo im Register; Region-Flag; Select-Optionen aus dem Register"
```

---

### Task 2: Datenmodell `streamingOffers` + Lese-Helfer

**Files:**
- Modify: `frontend/src/collections/Anime.ts` (neues Array-Feld nach `streamingProviders`)
- Modify: `frontend/src/lib/streaming.ts` (Typen + `streamingOffersOf`, `groupOffersByProvider`, `streamingSummary`, `MONETIZATION_LABELS`, `splitCsv`)
- Test: `frontend/src/lib/streaming.test.ts`

**Interfaces:**
- Produces:
```ts
export type Monetization = 'flatrate' | 'ads' | 'free'
export type StreamingOffer = {
  provider: string; url: string; monetization: Monetization | null
  audio: string[]; subs: string[]
  seasons?: number | null; episodes?: number | null
  availableTo?: string | null; firstSeenAt?: string | null; lastSeenAt?: string | null
  /** true = aus Legacy-Flags abgeleitet (kein Deep-Link-Nachweis, keine Sprachen). */
  legacy?: boolean
}
export type OfferView = { provider: StreamingProvider; offer: StreamingOffer }
export function streamingOffersOf(anime: any): OfferView[]
export function groupOffersByProvider(views: OfferView[]): { provider: StreamingProvider; offers: StreamingOffer[] }[]
export type StreamingSummary = {
  hasStream: boolean; providerNames: string[]; hasDeDub: boolean; hasDeSub: boolean
  hasFree: boolean; isNew: boolean; checkedAt: string | null; legacy: boolean
}
export function streamingSummary(anime: any, now?: Date): StreamingSummary
export const MONETIZATION_LABELS: Record<Monetization, string>
```

- [ ] **Step 1: Failing Tests** — an `streaming.test.ts` anhängen:

```ts
import { streamingOffersOf, groupOffersByProvider, streamingSummary } from './streaming'

const offersAnime = {
  streamingProviders: ['crunchyroll', 'joyn'],
  externalLinks: [{ platform: 'Crunchyroll', url: 'https://www.crunchyroll.com/naruto' }],
  availableLanguages: ['ja'],
  streamingCheckedAt: '2026-09-10T00:00:00.000Z',
  streamingOffers: [
    { id: 'a', provider: 'joyn', url: 'https://www.joyn.de/serien/naruto', monetization: 'ads', audio: 'de', subs: '', seasons: 5, episodes: 220, firstSeenAt: '2026-09-05T00:00:00.000Z' },
    { id: 'b', provider: 'crunchyroll', url: 'https://www.crunchyroll.com/watch/GYK5PJV7R', monetization: 'flatrate', audio: 'en,ja', subs: 'de,en', seasons: 5, episodes: 172, firstSeenAt: '2026-01-01T00:00:00.000Z' },
    { id: 'c', provider: 'gibtsnicht', url: 'https://x', monetization: 'flatrate', audio: '', subs: '' },
  ],
}

describe('streamingOffersOf', () => {
  it('liefert Offers in Register-Reihenfolge, parst CSV-Sprachen, ignoriert unbekannte Anbieter', () => {
    const v = streamingOffersOf(offersAnime)
    expect(v.map((x) => x.provider.slug)).toEqual(['crunchyroll', 'joyn'])
    expect(v[0].offer.subs).toEqual(['de', 'en'])
    expect(v[1].offer.audio).toEqual(['de'])
    expect(v[0].offer.legacy).toBeUndefined()
  })
  it('fällt ohne Offers auf die Legacy-Flags zurück (markiert als legacy)', () => {
    const v = streamingOffersOf({ ...offersAnime, streamingOffers: [] })
    expect(v.map((x) => x.provider.slug)).toEqual(['crunchyroll', 'joyn'])
    expect(v[0].offer.url).toBe('https://www.crunchyroll.com/naruto')
    expect(v[0].offer.legacy).toBe(true)
    expect(v[1].offer.url).toBe('https://www.joyn.de')
  })
})

describe('groupOffersByProvider', () => {
  it('bündelt mehrere Monetarisierungen desselben Anbieters', () => {
    const v = streamingOffersOf({
      streamingOffers: [
        { provider: 'crunchyroll', url: 'https://a', monetization: 'flatrate', audio: '', subs: '' },
        { provider: 'crunchyroll', url: 'https://b', monetization: 'free', audio: '', subs: '' },
      ],
    })
    const g = groupOffersByProvider(v)
    expect(g).toHaveLength(1)
    expect(g[0].offers.map((o) => o.monetization)).toEqual(['flatrate', 'free'])
  })
})

describe('streamingSummary', () => {
  it('leitet Dub/Sub, Kostenlos und Neu aus den Offers ab', () => {
    const s = streamingSummary(offersAnime, new Date('2026-09-10T12:00:00Z'))
    expect(s.hasStream).toBe(true)
    expect(s.providerNames).toEqual(['Crunchyroll', 'Joyn'])
    expect(s.hasDeDub).toBe(true)   // Joyn audio=de
    expect(s.hasDeSub).toBe(true)   // Crunchyroll subs=de
    expect(s.hasFree).toBe(true)    // Joyn ads
    expect(s.isNew).toBe(true)      // Joyn firstSeenAt 5 Tage alt
    expect(s.checkedAt).toBe('2026-09-10T00:00:00.000Z')
    expect(s.legacy).toBe(false)
  })
  it('nutzt im Legacy-Fall availableLanguages für Dub/Sub', () => {
    const s = streamingSummary({ streamingProviders: ['netflix'], availableLanguages: ['de-dub'] })
    expect(s.hasStream).toBe(true)
    expect(s.hasDeDub).toBe(true)
    expect(s.hasDeSub).toBe(false)
    expect(s.legacy).toBe(true)
  })
  it('ohne Anbieter: hasStream=false', () => {
    expect(streamingSummary({}).hasStream).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen** → FAIL (Exporte fehlen).

- [ ] **Step 3: Feld in `Anime.ts`** direkt nach dem Feld `streamingCheckedAt` einfügen:

```ts
    {
      // Anbieter-genaue Streaming-Angebote (Quelle: JustWatch DE, Skript
      // src/scripts/justwatch-streaming.py). Im Gegensatz zu `streamingProviders`
      // (nur Flags) steht hier PRO Anbieter: Deep-Link, Abo/Werbung/Free, Audio-
      // und Untertitelsprachen, Staffel-/Episodenzahl beim Anbieter, Ablaufdatum
      // und seit wann wir das Angebot kennen (Basis für „Neu auf …“-Listen).
      // `streamingProviders` wird aus diesen Zeilen abgeleitet und bleibt der
      // Filter-Index für Suche/Plattform-Seiten.
      name: 'streamingOffers',
      type: 'array',
      labels: { singular: 'Streaming-Angebot', plural: 'Streaming-Angebote' },
      admin: { description: 'Anbieter-genaue Angebote (JustWatch DE). Wird vom Sync gepflegt.' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'provider', type: 'text', required: true, index: true, admin: { description: 'Slug aus lib/streaming.ts' } },
            { name: 'monetization', type: 'select', options: ['flatrate', 'ads', 'free'], index: true },
          ],
        },
        { name: 'url', type: 'text', required: true, admin: { description: 'Deep-Link zum Titel beim Anbieter.' } },
        {
          type: 'row',
          fields: [
            { name: 'audio', type: 'text', admin: { description: 'Audiosprachen, kommagetrennt (de,ja).' } },
            { name: 'subs', type: 'text', admin: { description: 'Untertitelsprachen, kommagetrennt.' } },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'seasons', type: 'number', admin: { description: 'Staffeln beim Anbieter.' } },
            { name: 'episodes', type: 'number', admin: { description: 'Episoden beim Anbieter (Summe).' } },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'availableTo', type: 'date', admin: { description: 'Lizenz läuft aus am (falls bekannt).' } },
            { name: 'firstSeenAt', type: 'date', index: true, admin: { description: 'Erstmals gesehen (→ „Neu“).' } },
            { name: 'lastSeenAt', type: 'date' },
          ],
        },
      ],
    },
```

- [ ] **Step 4: Helfer in `streaming.ts`** (unter `streamingProvidersOf` anhängen):

```ts
// --- Anbieter-genaue Angebote (streamingOffers) -------------------------------

export type Monetization = 'flatrate' | 'ads' | 'free'

export const MONETIZATION_LABELS: Record<Monetization, string> = {
  flatrate: 'Im Abo',
  ads: 'Kostenlos (mit Werbung)',
  free: 'Kostenlos',
}

export type StreamingOffer = {
  provider: string
  url: string
  monetization: Monetization | null
  audio: string[]
  subs: string[]
  seasons?: number | null
  episodes?: number | null
  availableTo?: string | null
  firstSeenAt?: string | null
  lastSeenAt?: string | null
  /** true = aus den Legacy-Flags abgeleitet: kein Deep-Link-Nachweis, keine Sprachen. */
  legacy?: boolean
}

export type OfferView = { provider: StreamingProvider; offer: StreamingOffer }

/** "de,ja" → ['de','ja'] (leer/null → []). */
export const splitCsv = (s?: string | null): string[] =>
  (s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

const providerRank = (slug: string) => PROVIDER_SLUGS.indexOf(slug)

/**
 * Alle Angebote eines Anime, sortiert wie das Register (wichtigste Anbieter zuerst).
 * Solange ein Titel noch keine `streamingOffers` hat (Backfill läuft rollierend),
 * fällt die Funktion auf die alten Flags + AniList-Link zurück — markiert als
 * `legacy`, damit die UI keine Sprach-/Episodenangaben vortäuscht.
 */
export function streamingOffersOf(anime: any): OfferView[] {
  const raw: any[] = Array.isArray(anime?.streamingOffers) ? anime.streamingOffers : []
  const views: OfferView[] = []
  for (const o of raw) {
    const provider = providerBySlug(o?.provider)
    if (!provider || !o?.url) continue
    views.push({
      provider,
      offer: {
        provider: provider.slug,
        url: o.url,
        monetization: (['flatrate', 'ads', 'free'] as const).includes(o.monetization) ? o.monetization : null,
        audio: splitCsv(o.audio),
        subs: splitCsv(o.subs),
        seasons: o.seasons ?? null,
        episodes: o.episodes ?? null,
        availableTo: o.availableTo ?? null,
        firstSeenAt: o.firstSeenAt ?? null,
        lastSeenAt: o.lastSeenAt ?? null,
      },
    })
  }
  if (views.length) {
    return views.sort((a, b) => providerRank(a.provider.slug) - providerRank(b.provider.slug))
  }
  return streamingProvidersOf(anime).map(({ provider, url }) => ({
    provider,
    offer: { provider: provider.slug, url, monetization: null, audio: [], subs: [], legacy: true },
  }))
}

/** Angebote nach Anbieter bündeln (z. B. Crunchyroll Abo + Crunchyroll Free). */
export function groupOffersByProvider(views: OfferView[]): { provider: StreamingProvider; offers: StreamingOffer[] }[] {
  const out: { provider: StreamingProvider; offers: StreamingOffer[] }[] = []
  for (const v of views) {
    const g = out.find((x) => x.provider.slug === v.provider.slug)
    if (g) g.offers.push(v.offer)
    else out.push({ provider: v.provider, offers: [v.offer] })
  }
  return out
}

export type StreamingSummary = {
  hasStream: boolean
  providerNames: string[]
  hasDeDub: boolean
  hasDeSub: boolean
  hasFree: boolean
  /** Mindestens ein Angebot ist jünger als 30 Tage. */
  isNew: boolean
  checkedAt: string | null
  legacy: boolean
}

const NEW_WINDOW_MS = 30 * 86400_000

/** Kompakte Kennzahlen für Title/Description/Intro-Satz der Anime-Seite. */
export function streamingSummary(anime: any, now: Date = new Date()): StreamingSummary {
  const views = streamingOffersOf(anime)
  const legacy = views.length > 0 && views.every((v) => v.offer.legacy)
  const langs: string[] = Array.isArray(anime?.availableLanguages) ? anime.availableLanguages : []
  const hasDeDub = legacy ? langs.includes('de-dub') : views.some((v) => v.offer.audio.includes('de'))
  const hasDeSub = legacy ? langs.includes('de-sub') : views.some((v) => v.offer.subs.includes('de'))
  const isNew = views.some((v) => {
    const t = v.offer.firstSeenAt ? Date.parse(v.offer.firstSeenAt) : NaN
    return Number.isFinite(t) && now.getTime() - t <= NEW_WINDOW_MS
  })
  return {
    hasStream: views.length > 0,
    providerNames: groupOffersByProvider(views).map((g) => g.provider.name),
    hasDeDub,
    hasDeSub,
    hasFree: views.some((v) => v.offer.monetization === 'ads' || v.offer.monetization === 'free'),
    isNew,
    checkedAt: anime?.streamingCheckedAt || null,
    legacy,
  }
}
```

- [ ] **Step 5: Tests + Typecheck** → PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/collections/Anime.ts frontend/src/lib/streaming.ts frontend/src/lib/streaming.test.ts
git commit -m "Anime: Feld streamingOffers (anbieter-genaue Angebote) + Lese-Helfer mit Legacy-Fallback"
```

---

### Task 3: JustWatch-Skript schreibt Offers

**Files:**
- Modify: `frontend/src/scripts/justwatch-streaming.py` (kompletter Umbau, Aufrufsemantik bleibt)
- Test: manueller Lauf mit `--slugs naruto,clannad,frieren` gegen die Live-DB (erst **nach** db-push in Task 10 möglich — bis dahin `--dry-run`).

**Interfaces:**
- Consumes: Tabelle `anime_streaming_offers` (Task 2, nach db-push), Provider-Slugs aus Task 1.
- Produces: gefüllte Zeilen in `anime_streaming_offers`; `anime_streaming_providers` abgeleitet; `anime_available_languages` additiv; `anime.streaming_checked_at`, bei Änderung `content_updated_at`/`updated_at`.

- [ ] **Step 1: Skript neu schreiben** — `justwatch-streaming.py` vollständig ersetzen:

```python
#!/usr/bin/env python3
"""
JustWatch-Streaming-Sync ("Wer streamt es?" — anbieter-genaue Angebote, DE).

Schreibt pro Anime die Tabelle `anime_streaming_offers` (Payload-Array-Feld
`streamingOffers`): PRO Anbieter Deep-Link, Monetarisierung (flatrate/ads/free),
Audio-/Untertitelsprachen, Staffel-/Episodenzahl beim Anbieter, Ablaufdatum und
first/last_seen. Daraus werden abgeleitet:
  - `anime_streaming_providers` (Filter-Index, Slugs)         — autoritativ auf gematchten Titeln
  - `anime_available_languages` (de-dub/de-sub/en-dub/en-sub/ja) — NUR ADDITIV
    (Crunchyroll-/Wikipedia-Skripte bleiben Quelle für ihre Sprachen)
Nur Streaming-Angebote (FLATRATE/FREE/ADS), kein Kauf/Verleih. Anbieter ohne
Mapping (Bibliotheken wie filmfriend, Shops) werden ignoriert.

Aufruf (HOST, `pip install curl_cffi` + docker):
  python3 src/scripts/justwatch-streaming.py                    # alle Anime
  python3 src/scripts/justwatch-streaming.py --recent 3         # Titel der letzten 3 Tage (täglich)
  python3 src/scripts/justwatch-streaming.py --only-missing     # nur Titel ohne Offers
  python3 src/scripts/justwatch-streaming.py --stale 150        # rollierend: die 150 am längsten nicht geprüften
  python3 src/scripts/justwatch-streaming.py --slugs naruto,clannad [--dry-run]

Match-Regel: Titel-Ähnlichkeit >= 0.90 gegen die JustWatch-Suche (DE). Ohne
sicheren Match wird der Bestand NIE angetastet. Bei Match sind die Offers
IMMER autoritativ (Angebote sind der neue Wahrheitsbestand); first_seen_at
bleibt über Läufe hinweg erhalten.

Rate-Limit: 4 Worker + 0.25 s Pause pro Request (~8–10 req/s). Der frühere
Massen-Backfill mit ~85 req/s endete in 403.
"""
import json
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher

try:
    from curl_cffi import requests
except ImportError:
    sys.exit("Fehlt: pip install curl_cffi")

DB_CONTAINER = "otakupulse-db"
GQL = "https://apis.justwatch.com/graphql"
IMPERSONATE = "chrome124"
MAX_WORKERS = 4
REQUEST_PAUSE = 0.25
MONETIZATION = {"FLATRATE": "flatrate", "ADS": "ads", "FREE": "free"}

# JustWatch-`clearName` (lower) -> Provider-Slug (muss zu lib/streaming.ts passen).
CLEARNAME_TO_SLUG = {
    "crunchyroll": "crunchyroll",
    "crunchyroll amazon channel": "crunchyroll",
    "wakanim": "crunchyroll",
    "netflix": "netflix",
    "netflix basic with ads": "netflix",
    "netflix standard with ads": "netflix",
    "amazon prime video": "amazon-prime-video",
    "amazon prime video with ads": "amazon-prime-video",
    "disney plus": "disney-plus",
    "wow": "wow",
    "sky go": "wow",
    "joyn": "joyn",
    "joyn plus": "joyn",
    "rtl+": "rtl-plus",
    "rtl+ max amazon channel": "rtl-plus",
    "aniverse amazon channel": "aniverse",
    "animation digital network": "adn",
    "anime digital network amazon channel": "adn",
    "toggo": "toggo",
    "anime on demand": "anime-on-demand",
    "paramount plus": "paramount-plus",
    "paramount+": "paramount-plus",
    "apple tv plus": "apple-tv",
    "apple tv+": "apple-tv",
    "magenta tv": "magenta-tv",
    "magentatv": "magenta-tv",
    "hidive": "hidive",
}

# Sprachcodes aus Offers -> availableLanguages-Enum (additiv).
AUDIO_TO_LANG = {"de": "de-dub", "en": "en-dub", "ja": "ja"}
SUB_TO_LANG = {"de": "de-sub", "en": "en-sub"}

SEARCH_Q = """
query($c:Country!,$l:Language!,$q:String!){
  popularTitles(country:$c,first:5,filter:{searchQuery:$q}){
    edges{node{
      objectType
      content(country:$c,language:$l){ title originalTitle }
      offers(country:$c,platform:WEB){
        monetizationType standardWebURL elementCount audioLanguages subtitleLanguages availableTo
        package{clearName}
      }
      ... on Show { seasons {
        offers(country:$c,platform:WEB){ monetizationType elementCount audioLanguages subtitleLanguages package{clearName} }
      } }
    }}
  }
}"""


def psql(sql: str, read: bool = True) -> str:
    inner = 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
    if read:
        inner += " -t -A"
    res = subprocess.run(["docker", "exec", "-i", DB_CONTAINER, "sh", "-c", inner],
                         input=sql, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"psql-Fehler: {res.stderr.strip()}")
    return res.stdout


def q(s):
    """SQL-String-Literal (NULL bei None)."""
    return "NULL" if s is None else "'" + str(s).replace("'", "''") + "'"


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower()) if s else ""


def _arg(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        return sys.argv[i + 1] if i + 1 < len(sys.argv) else default
    return default


def load_anime(recent_days=None, stale_limit=None, slugs=None):
    where, tail = "", ""
    if recent_days:
        where = f" WHERE a.created_at > now() - interval '{int(recent_days)} days'"
    if slugs:
        where = " WHERE a.slug IN (" + ",".join(q(s) for s in slugs) + ")"
    if stale_limit:
        tail = f" ORDER BY a.streaming_checked_at ASC NULLS FIRST LIMIT {int(stale_limit)}"
    rows = json.loads(psql(
        "SELECT COALESCE(json_agg(json_build_object('id',s.id,'slug',s.slug,'en',s.en,'ro',s.ro,'na',s.na)),'[]') "
        "FROM (SELECT a.id, a.slug, a.title_english en, a.title_romaji ro, a.title_native na "
        f"FROM anime a{where}{tail}) s;"
    ).strip() or "[]")
    anime = {r["id"]: {"id": r["id"], "slug": r["slug"],
                       "titles": [r.get("en") or "", r.get("ro") or "", r.get("na") or ""],
                       "have": set(), "offers": {}}
             for r in rows}
    if not anime:
        return []
    ids = ",".join(str(i) for i in anime)
    for p in json.loads(psql(
        "SELECT COALESCE(json_agg(json_build_object('pid',parent_id,'v',value)),'[]') "
        f"FROM anime_streaming_providers WHERE parent_id IN ({ids});").strip() or "[]"):
        anime[p["pid"]]["have"].add(p["v"])
    # bestehende Offers: first_seen_at je (provider, monetization) erhalten
    for o in json.loads(psql(
        "SELECT COALESCE(json_agg(json_build_object('pid',_parent_id,'p',provider,'m',monetization,'f',first_seen_at)),'[]') "
        f"FROM anime_streaming_offers WHERE _parent_id IN ({ids});").strip() or "[]"):
        anime[o["pid"]]["offers"][(o["p"], o["m"])] = o["f"]
    return list(anime.values())


def api_post(session, payload):
    for attempt in range(4):
        r = session.post(GQL, json=payload, headers={"Content-Type": "application/json"},
                         impersonate=IMPERSONATE, timeout=30)
        time.sleep(REQUEST_PAUSE)
        if r.status_code in (429, 403):
            time.sleep(2 ** attempt)
            continue
        return r
    return r


def best_match(data, our_titles):
    our = [norm(t) for t in our_titles if t.strip()]
    best, best_score = None, 0.0
    for edge in data.get("edges", []):
        node = edge.get("node") or {}
        c = node.get("content") or {}
        cand = [norm(c.get("title")), norm(c.get("originalTitle"))]
        score = 0.0
        for t in our:
            for cn in cand:
                if not cn:
                    continue
                ratio = SequenceMatcher(None, t, cn).ratio()
                if len(t) >= 8 and (t in cn or cn in t):
                    ratio = max(ratio, 0.95)
                score = max(score, ratio)
        if score > best_score:
            best, best_score = node, score
    return best if best and best_score >= 0.90 else None


def aggregate_offers(node):
    """JustWatch-Node -> Liste von Offer-Dicts (SD/HD dedupliziert, Sprachen vereinigt).

    Show-Ebene: elementCount = Staffeln beim Anbieter. Season-Ebene: elementCount =
    Episoden der Staffel → aufsummiert. Filme haben keine seasons.
    """
    is_show = node.get("objectType") == "SHOW"
    offers = {}
    for o in node.get("offers") or []:
        m = MONETIZATION.get(o.get("monetizationType"))
        slug = CLEARNAME_TO_SLUG.get(((o.get("package") or {}).get("clearName") or "").lower())
        if not m or not slug:
            continue
        e = offers.setdefault((slug, m), {
            "provider": slug, "monetization": m, "url": None, "audio": set(), "subs": set(),
            "seasons": None, "episodes": 0, "available_to": None,
        })
        url = o.get("standardWebURL")
        if url and not e["url"]:
            e["url"] = url
        e["audio"] |= set(o.get("audioLanguages") or [])
        e["subs"] |= set(o.get("subtitleLanguages") or [])
        if is_show and o.get("elementCount"):
            e["seasons"] = max(e["seasons"] or 0, int(o["elementCount"]))
        if o.get("availableTo") and (not e["available_to"] or o["availableTo"] < e["available_to"]):
            e["available_to"] = o["availableTo"]
    for season in node.get("seasons") or []:
        per = {}
        for o in season.get("offers") or []:
            m = MONETIZATION.get(o.get("monetizationType"))
            slug = CLEARNAME_TO_SLUG.get(((o.get("package") or {}).get("clearName") or "").lower())
            if not m or not slug or (slug, m) not in offers:
                continue
            per[(slug, m)] = max(per.get((slug, m), 0), int(o.get("elementCount") or 0))
            offers[(slug, m)]["audio"] |= set(o.get("audioLanguages") or [])
            offers[(slug, m)]["subs"] |= set(o.get("subtitleLanguages") or [])
        for k, n in per.items():
            offers[k]["episodes"] += n
    out = []
    for e in offers.values():
        if not e["url"]:
            continue  # ohne Deep-Link zeigen wir keinen Anbieter
        e["audio"] = ",".join(sorted(e["audio"]))
        e["subs"] = ",".join(sorted(e["subs"]))
        if not is_show:
            e["seasons"], e["episodes"] = None, None
        elif not e["episodes"]:
            e["episodes"] = None
        out.append(e)
    return out


def fetch_offers(session, a):
    """None = API-Fehler, False = kein sicherer Match, sonst Offer-Liste."""
    query = next((t for t in a["titles"] if t.strip()), "")
    if not query:
        return False
    r = api_post(session, {"query": SEARCH_Q, "variables": {"c": "DE", "l": "de", "q": query}})
    if r.status_code != 200:
        return None
    data = (r.json().get("data") or {}).get("popularTitles") or {}
    node = best_match(data, a["titles"])
    if node is None:
        return False
    return aggregate_offers(node)


def build_sql(a, offers, now_iso):
    aid = a["id"]
    stmts = [f"DELETE FROM anime_streaming_offers WHERE _parent_id = {aid};"]
    slugs = set()
    langs = set()
    for i, e in enumerate(offers, 1):
        first = a["offers"].get((e["provider"], e["monetization"])) or now_iso
        slugs.add(e["provider"])
        for code in e["audio"].split(","):
            if code in AUDIO_TO_LANG:
                langs.add(AUDIO_TO_LANG[code])
        for code in e["subs"].split(","):
            if code in SUB_TO_LANG:
                langs.add(SUB_TO_LANG[code])
        stmts.append(
            "INSERT INTO anime_streaming_offers "
            "(_order,_parent_id,id,provider,monetization,url,audio,subs,seasons,episodes,available_to,first_seen_at,last_seen_at) VALUES ("
            f"{i}, {aid}, substr(md5(random()::text || clock_timestamp()::text), 1, 24), "
            f"{q(e['provider'])}, {q(e['monetization'])}::enum_anime_streaming_offers_monetization, {q(e['url'])}, "
            f"{q(e['audio'] or None)}, {q(e['subs'] or None)}, "
            f"{e['seasons'] if e['seasons'] is not None else 'NULL'}, {e['episodes'] if e['episodes'] is not None else 'NULL'}, "
            f"{q(e['available_to'])}, {q(first)}, {q(now_iso)});"
        )
    stmts.append(f"DELETE FROM anime_streaming_providers WHERE parent_id = {aid};")
    if slugs:
        vals = ",".join(f"({i+1}, {aid}, {q(s)}::enum_anime_streaming_providers)" for i, s in enumerate(sorted(slugs)))
        stmts.append(f'INSERT INTO anime_streaming_providers ("order", parent_id, value) VALUES {vals};')
    for lang in sorted(langs):
        stmts.append(
            'INSERT INTO anime_available_languages ("order", parent_id, value) '
            f"SELECT COALESCE((SELECT max(\"order\") FROM anime_available_languages WHERE parent_id = {aid}), 0) + 1, {aid}, "
            f"{q(lang)}::enum_anime_available_languages "
            f"WHERE NOT EXISTS (SELECT 1 FROM anime_available_languages WHERE parent_id = {aid} AND value = {q(lang)});"
        )
    changed = slugs != a["have"] or set((e["provider"], e["monetization"]) for e in offers) != set(a["offers"])
    return stmts, changed


def main():
    recent, stale, slugs = _arg("--recent"), _arg("--stale"), _arg("--slugs")
    dry = "--dry-run" in sys.argv
    print("→ Lade Anime + vorhandene Anbieter/Offers …")
    anime = load_anime(recent_days=recent, stale_limit=stale, slugs=slugs.split(",") if slugs else None)
    if "--only-missing" in sys.argv:
        anime = [a for a in anime if not a["offers"]]
    print(f"  {len(anime)} Anime.")
    if not anime:
        return

    now_iso = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
    sql, changed_ids, checked_ids = [], [], []
    errors = nomatch = done = 0

    def worker(a):
        s = requests.Session(impersonate=IMPERSONATE)
        return a, fetch_offers(s, a)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        for f in as_completed([ex.submit(worker, a) for a in anime]):
            a, offers = f.result()
            done += 1
            if offers is None:
                errors += 1
                continue
            checked_ids.append(a["id"])
            if offers is False:
                nomatch += 1
                continue
            stmts, changed = build_sql(a, offers, now_iso)
            if dry:
                print(f"  {a['slug']}: " + ", ".join(f"{o['provider']}/{o['monetization']} a={o['audio']} s={o['subs']} S{o['seasons']} E{o['episodes']}" for o in offers))
                continue
            sql.extend(stmts)
            if changed:
                changed_ids.append(a["id"])
            if done % 200 == 0:
                print(f"  {done}/{len(anime)} … (geändert: {len(changed_ids)})")

    print(f"  Fertig: {len(checked_ids)} geprüft, {len(changed_ids)} geändert, {nomatch} ohne Match, {errors} Fehler.")
    if dry:
        return
    if sql:
        # Änderungen zählen als Inhaltsänderung (Sitemap-lastmod, IndexNow).
        if changed_ids:
            ids = ",".join(str(i) for i in changed_ids)
            sql.append(f"UPDATE anime SET content_updated_at = now(), updated_at = now() WHERE id IN ({ids});")
        psql("BEGIN;\n" + "\n".join(sql) + "\nCOMMIT;", read=False)
        print(f"✓ Offers geschrieben.")
    if checked_ids:
        ids = ",".join(str(i) for i in checked_ids)
        psql(f"UPDATE anime SET streaming_checked_at = now() WHERE id IN ({ids});", read=False)
        print(f"✓ {len(checked_ids)} Titel als geprüft markiert.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Dry-Run gegen die API (ohne DB-Schreiben)** — funktioniert schon vor dem db-push? Nein: `load_anime` liest `anime_streaming_offers`. Deshalb jetzt nur Syntax + Aggregation prüfen:

```bash
cd frontend && python3 -c "
import importlib.util,sys; spec=importlib.util.spec_from_file_location('jw','src/scripts/justwatch-streaming.py'); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
node={'objectType':'SHOW','offers':[
 {'monetizationType':'FLATRATE','standardWebURL':'https://www.crunchyroll.com/x','elementCount':2,'audioLanguages':['ja'],'subtitleLanguages':[],'availableTo':None,'package':{'clearName':'Crunchyroll'}},
 {'monetizationType':'FLATRATE','standardWebURL':'https://www.crunchyroll.com/x','elementCount':2,'audioLanguages':['de'],'subtitleLanguages':['de'],'availableTo':None,'package':{'clearName':'Crunchyroll'}},
 {'monetizationType':'BUY','standardWebURL':'https://amazon.de','elementCount':1,'audioLanguages':[],'subtitleLanguages':[],'availableTo':None,'package':{'clearName':'Amazon Video'}}],
 'seasons':[{'offers':[{'monetizationType':'FLATRATE','elementCount':12,'audioLanguages':[],'subtitleLanguages':[],'package':{'clearName':'Crunchyroll'}},{'monetizationType':'FLATRATE','elementCount':12,'audioLanguages':[],'subtitleLanguages':[],'package':{'clearName':'Crunchyroll'}}]},
            {'offers':[{'monetizationType':'FLATRATE','elementCount':13,'audioLanguages':[],'subtitleLanguages':[],'package':{'clearName':'Crunchyroll'}}]}]}
print(m.aggregate_offers(node))"
```
Erwartet: genau ein Offer `crunchyroll/flatrate`, `audio='de,ja'`, `subs='de'`, `seasons=2`, `episodes=25`, Kauf-Angebot ignoriert.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/scripts/justwatch-streaming.py
git commit -m "JustWatch-Sync: anbieter-genaue Offers (Deep-Link, Sprachen, Staffeln, Ablauf) statt Flags; Rate-Limit"
```

*(Der Live-Test mit `--slugs naruto,clannad,frieren` folgt in Task 10 nach dem db-push.)*

---

### Task 4: `StreamingBox`-Komponente + WatchAction-JSON-LD

**Files:**
- Create: `frontend/src/components/StreamingBox.tsx`
- Modify: `frontend/src/lib/seo.ts` (`animeLd` bekommt `potentialAction`, neue Funktion `watchActionsLd`)
- Modify: `frontend/src/lib/anime.ts` (Hilfen `formatDateDe`, `joinNames`)
- Test: `frontend/src/lib/seo.test.ts`, `frontend/src/lib/anime.test.ts`

**Interfaces:**
- Consumes: `streamingOffersOf`, `groupOffersByProvider`, `streamingSummary`, `MONETIZATION_LABELS` (Task 2).
- Produces: `<StreamingBox anime={anime} title={title} />` (Server Component, rendert `<section id="stream">`), `watchActionsLd(views: OfferView[])`, `joinNames(names: (string|null|undefined)[]): string`, `formatDateDe(iso?: string|null): string`.

- [ ] **Step 1: Failing Tests**

`anime.test.ts` anhängen:
```ts
import { joinNames, formatDateDe } from './anime'

describe('joinNames', () => {
  it('zählt natürlich auf', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(['A'])).toBe('A')
    expect(joinNames(['A', 'B'])).toBe('A und B')
    expect(joinNames(['A', null, 'B', 'C'])).toBe('A, B und C')
  })
})
describe('formatDateDe', () => {
  it('formatiert ISO als dd.mm.yyyy, leer bei ungültig', () => {
    expect(formatDateDe('2026-09-10T00:00:00.000Z')).toBe('10.09.2026')
    expect(formatDateDe(null)).toBe('')
    expect(formatDateDe('kaputt')).toBe('')
  })
})
```

`seo.test.ts` anhängen:
```ts
import { watchActionsLd, animeLd } from './seo'
import { streamingOffersOf } from './streaming'

describe('watchActionsLd', () => {
  it('erzeugt pro Angebot eine WatchAction mit Region DE und Offer-Kategorie', () => {
    const views = streamingOffersOf({
      streamingOffers: [
        { provider: 'joyn', url: 'https://www.joyn.de/serien/x', monetization: 'ads', audio: 'de', subs: '' },
        { provider: 'netflix', url: 'https://www.netflix.com/title/1', monetization: 'flatrate', audio: '', subs: '' },
      ],
    })
    const actions = watchActionsLd(views)
    expect(actions).toHaveLength(2)
    expect(actions[0]['@type']).toBe('WatchAction')
    expect(actions[0].target.urlTemplate).toBe('https://www.netflix.com/title/1')
    expect(actions[0].expectsAcceptanceOf.category).toBe('subscription')
    expect(actions[1].expectsAcceptanceOf.category).toBe('free')
    expect(actions[1].expectsAcceptanceOf.eligibleRegion.name).toBe('DE')
  })
  it('animeLd hängt potentialAction nur mit Angeboten an', () => {
    expect(animeLd({ slug: 'x', titleRomaji: 'X' }).potentialAction).toBeUndefined()
    const withOffers = animeLd({ slug: 'x', titleRomaji: 'X', streamingOffers: [{ provider: 'netflix', url: 'https://n', monetization: 'flatrate' }] })
    expect(withOffers.potentialAction).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Tests laufen lassen** → FAIL.

- [ ] **Step 3: Hilfen in `anime.ts`** (ans Ende):

```ts
// Natürliche Aufzählung: [a,b,c] → „a, b und c".
export function joinNames(names: (string | null | undefined)[]): string {
  const a = names.filter((n): n is string => !!n)
  if (a.length === 0) return ''
  if (a.length === 1) return a[0]
  if (a.length === 2) return `${a[0]} und ${a[1]}`
  return `${a.slice(0, -1).join(', ')} und ${a[a.length - 1]}`
}

// ISO-Datum → „10.09.2026" (leer bei fehlend/ungültig; für „Stand:"/„bis"-Angaben).
export function formatDateDe(iso?: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
}
```
Die bisherige lokale `joinNames` in `streamen/[slug]/page.tsx` wird in Task 6 mit der Route gelöscht.

- [ ] **Step 4: `seo.ts`** — Import ergänzen `import { streamingOffersOf, type OfferView } from './streaming'`, dann:

```ts
/**
 * WatchAction pro Streaming-Angebot (Schema.org). Google nutzt das für die
 * „Ansehen"-Box; für uns ist es der maschinenlesbare Beleg, dass die Seite
 * echte, regionale Verfügbarkeit trägt — nicht nur Text.
 */
export function watchActionsLd(views: OfferView[]) {
  return views.map(({ offer }) => ({
    '@type': 'WatchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: offer.url,
      actionPlatform: ['http://schema.org/DesktopWebPlatform', 'http://schema.org/MobileWebPlatform'],
      inLanguage: 'de',
    },
    expectsAcceptanceOf: {
      '@type': 'Offer',
      category: offer.monetization === 'flatrate' ? 'subscription' : 'free',
      eligibleRegion: { '@type': 'Country', name: 'DE' },
    },
  }))
}
```
In `animeLd(anime)` vor dem `return`:
```ts
  const offers = streamingOffersOf(anime).filter((v) => !v.offer.legacy)
```
und im Objekt:
```ts
    potentialAction: offers.length ? watchActionsLd(offers) : undefined,
```

- [ ] **Step 5: `StreamingBox.tsx`** anlegen:

```tsx
import Link from 'next/link'
import { formatDateDe, joinNames } from '@/lib/anime'
import {
  MONETIZATION_LABELS,
  groupOffersByProvider,
  streamingOffersOf,
  streamingSummary,
  type StreamingOffer,
} from '@/lib/streaming'

/**
 * „Wo streamen?"-Block der Anime-Seite — ersetzt die frühere /streamen/-Seite.
 * Zeigt PRO Anbieter das, was Googles „Ansehen"-Box und JustWatch nicht liefern:
 * Sprachfassung je Anbieter, Abo/Kostenlos, Staffel-/Episodenstand beim
 * Anbieter, Ablaufdatum, „Neu"-Marker und den Prüfzeitpunkt. Bei Titeln, die
 * noch keine Offers haben (Backfill rollierend), fällt die Box auf die alten
 * Flags zurück und verzichtet dann bewusst auf Sprach-/Episodenangaben.
 */
export function StreamingBox({ anime, title }: { anime: any; title: string }) {
  const views = streamingOffersOf(anime)
  const groups = groupOffersByProvider(views)
  const s = streamingSummary(anime)
  const stand = formatDateDe(s.checkedAt)

  return (
    <section id="stream" className="mt-8 scroll-mt-24">
      <h2 className="mb-1 text-lg font-bold text-white">Wo kann man {title} streamen?</h2>
      {groups.length ? (
        <>
          <p className="mb-4 text-sm text-zinc-400">
            {title} läuft in Deutschland bei {joinNames(groups.map((g) => g.provider.name))}
            {s.legacy ? '' : s.hasDeDub ? ' — mit deutscher Synchro' : s.hasDeSub ? ' — im Original mit deutschen Untertiteln' : ''}
            {s.hasFree ? ', teilweise kostenlos' : ''}.
            {stand ? ` Stand: ${stand}.` : ''}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map(({ provider, offers }) => (
              <a
                key={provider.slug}
                href={offers[0].url}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="group rounded-xl border border-white/10 bg-zinc-900/50 p-4 transition hover:border-accent/50 hover:bg-zinc-900"
                style={provider.color ? { borderColor: `${provider.color}55` } : undefined}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: provider.color || '#7c3aed' }} aria-hidden />
                    <span className="font-bold text-white group-hover:text-accent">{provider.name}</span>
                    {isNew(offers) ? <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">Neu</span> : null}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-accent">Zum Stream →</span>
                </div>
                {offers[0].legacy ? (
                  <p className="mt-2 text-xs text-zinc-500">Details zur Sprachfassung folgen — bitte beim Anbieter prüfen.</p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {langBadges(offers)}
                    {offers.map((o) =>
                      o.monetization ? (
                        <li key={o.monetization} className={`rounded-md px-2 py-0.5 ${o.monetization === 'flatrate' ? 'bg-white/5 text-zinc-300 ring-1 ring-white/10' : 'bg-emerald-500/15 text-emerald-300'}`}>
                          {MONETIZATION_LABELS[o.monetization]}
                        </li>
                      ) : null,
                    )}
                    {scope(offers[0]) ? <li className="text-zinc-500">{scope(offers[0])}</li> : null}
                    {offers[0].availableTo ? <li className="text-amber-400/80">bis {formatDateDe(offers[0].availableTo)}</li> : null}
                  </ul>
                )}
              </a>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-zinc-400">
          Aktuell ist {title} bei keinem Anbieter in Deutschland im Abo- oder Gratis-Stream gelistet
          {stand ? ` (Stand: ${stand})` : ''}. Sobald ein Dienst den Titel aufnimmt, erscheint er hier.{' '}
          <Link href="/plattform" className="text-zinc-300 underline-offset-2 hover:text-accent hover:underline">
            Alle Streaming-Anbieter
          </Link>
        </p>
      )}
    </section>
  )
}

const NEW_MS = 30 * 86400_000
function isNew(offers: StreamingOffer[]): boolean {
  return offers.some((o) => o.firstSeenAt && Date.now() - Date.parse(o.firstSeenAt) <= NEW_MS)
}

// „3 Staffeln · 120 Folgen" (nur, wenn der Anbieter Zahlen liefert).
function scope(o: StreamingOffer): string {
  const parts: string[] = []
  if (o.seasons) parts.push(`${o.seasons} ${o.seasons === 1 ? 'Staffel' : 'Staffeln'}`)
  if (o.episodes) parts.push(`${o.episodes} Folgen`)
  return parts.join(' · ')
}

// Sprach-Badges über alle Angebote des Anbieters vereinigt; Dub hervorgehoben.
function langBadges(offers: StreamingOffer[]) {
  const audio = new Set(offers.flatMap((o) => o.audio))
  const subs = new Set(offers.flatMap((o) => o.subs))
  const items: { key: string; label: string; dub: boolean }[] = []
  if (audio.has('de')) items.push({ key: 'de-dub', label: 'Deutscher Dub', dub: true })
  if (subs.has('de')) items.push({ key: 'de-sub', label: 'Deutscher Sub', dub: false })
  if (audio.has('en')) items.push({ key: 'en-dub', label: 'Englischer Dub', dub: true })
  if (subs.has('en') && !subs.has('de')) items.push({ key: 'en-sub', label: 'Englischer Sub', dub: false })
  if (!items.length && audio.has('ja')) items.push({ key: 'ja', label: 'Japanisch (OmU)', dub: false })
  return items.map((it) => (
    <li key={it.key} className={`rounded-md px-2 py-0.5 font-medium ${it.dub ? 'bg-accent/20 text-white ring-1 ring-accent/40' : 'border border-white/10 bg-white/5 text-zinc-300'}`}>
      {it.label}
    </li>
  ))
}
```

- [ ] **Step 6: Tests + Typecheck** → PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/StreamingBox.tsx frontend/src/lib/seo.ts frontend/src/lib/seo.test.ts frontend/src/lib/anime.ts frontend/src/lib/anime.test.ts
git commit -m "StreamingBox: anbieter-genaue Angebote auf der Anime-Seite + WatchAction-JSON-LD"
```

---

### Task 5: Anime-Seite umbauen (Streaming oben, Ähnliche integriert, Title-Templates)

**Files:**
- Create: `frontend/src/lib/similar.ts` (aus `aehnlich/[slug]/page.tsx` extrahiert)
- Modify: `frontend/src/app/(frontend)/anime/[slug]/page.tsx`

**Interfaces:**
- Consumes: `StreamingBox`, `streamingSummary`, `joinNames` (Task 2/4).
- Produces: `similarAnime(payload, anime, limit = 24): Promise<any[]>`.

- [ ] **Step 1: `lib/similar.ts`** anlegen (Logik 1:1 aus `getSimilar`, ohne `cache`/Slug-Lookup):

```ts
// Ähnliche Titel: Empfehlungen → Relationen → Genre-Fallback, dedupliziert, ohne sich selbst.
// Früher eigene Seite /aehnlich/<slug>; seit dem Merge Sektion der Anime-Seite.
export async function similarAnime(payload: any, anime: any, limit = 24): Promise<any[]> {
  const seen = new Set<any>([anime.id])
  const out: any[] = []
  const push = (a: any) => {
    if (a && typeof a === 'object' && a.slug && !seen.has(a.id)) {
      seen.add(a.id)
      out.push(a)
    }
  }
  for (const r of Array.isArray(anime.recommendations) ? anime.recommendations : []) push(r)
  for (const r of Array.isArray(anime.relations) ? anime.relations : []) push(r?.anime)

  if (out.length < limit) {
    const genreIds = (Array.isArray(anime.genres) ? anime.genres : [])
      .map((g: any) => (g && typeof g === 'object' ? g.id : g))
      .filter(Boolean)
    if (genreIds.length) {
      const more = await payload.find({
        collection: 'anime',
        where: { and: [{ genres: { in: genreIds } }, { id: { not_equals: anime.id } }, { isHentai: { not_equals: true } }] },
        sort: '-popularity',
        limit: 40,
        depth: 0,
      })
      for (const a of more.docs as any[]) {
        if (out.length >= limit) break
        push(a)
      }
    }
  }
  return out.slice(0, limit)
}
```

- [ ] **Step 2: `anime/[slug]/page.tsx` umbauen**

Imports ergänzen/ändern:
```ts
import { StreamingBox } from '@/components/StreamingBox'
import { streamingSummary } from '@/lib/streaming'
import { similarAnime } from '@/lib/similar'
// aus '@/lib/anime' zusätzlich: joinNames
```
`streamingProvidersOf`-Import entfernen.

`generateMetadata` ersetzen:
```ts
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const anime = await findBySlug(slug)
  if (!anime) return {}
  const title = displayTitle(anime)
  const vars = animeVars(anime)
  const s = streamingSummary(anime)
  // Title/Description datenabhängig: Mit Stream steht die Verfügbarkeit vorn
  // (Suchintention „wo streamen"), ohne Stream die Datenbank-Infos. Ein
  // redaktionelles seoTitle/seoDescription gewinnt weiterhin.
  const langTag = s.legacy ? '' : s.hasDeDub ? ' (Deutscher Dub)' : s.hasDeSub ? ' (Ger Sub)' : ''
  const autoTitle = s.hasStream
    ? `${title} im Stream: ${joinNames(s.providerNames.slice(0, 3))}${langTag} | OtakuPulse`
    : `${title} — Anime: Infos, Charaktere & Stream | OtakuPulse`
  const plot = plainText(anime.descriptionDe || anime.descriptionSource).slice(0, 110)
  const autoDesc = s.hasStream
    ? `${title} läuft bei ${joinNames(s.providerNames)}${s.hasDeDub && !s.legacy ? ' mit deutscher Synchro' : s.hasDeSub && !s.legacy ? ' mit deutschen Untertiteln' : ''}${s.hasFree ? ', teils kostenlos' : ''}. ${plot ? plot + '…' : 'Handlung, Charaktere, Studio und Episoden.'}`
    : plot
      ? `${plot}… Handlung, Charaktere, Studio, Episoden und Streaming-Status zu ${title}.`
      : `Alle Infos zu ${title}: Charaktere, Studio, Episoden und Streaming-Status.`
  return pageMeta({
    title: applyVarsMeta(anime.seoTitle, vars) || autoTitle,
    description: applyVarsMeta(anime.seoDescription, vars) || autoDesc.slice(0, 160),
    path: `/anime/${anime.slug}`,
    image: anime.coverImageUrl,
    noindex: anime.noindex || undefined,
    canonical: anime.canonicalUrl || undefined,
  })
}
```
*(Die inhaltliche noindex-Regel kommt in Task 7.)*

Im Body:
- Zeile `const streaming = streamingProvidersOf(anime)` entfernen.
- Nach `const episodes = await payload.find(...)`: `const similar = await similarAnime(payload, anime)`.
- Den bisherigen Block `{/* Wo streamen? */} … </section>) : null}` komplett durch `<StreamingBox anime={anime} title={title} />` ersetzen (Position bleibt: nach Genres, vor Handlung).
- Den bisherigen Block `{/* Empfehlungen */} …` (beide Zweige) ersetzen durch:
```tsx
        {/* Ähnliche Anime — früher /aehnlich/<slug>, seit dem Merge Teil dieser Seite */}
        {similar.length ? (
          <section id="aehnlich" className="mt-10 scroll-mt-24 pb-4">
            <MediaRow title={`Anime ähnlich wie ${title}`} items={similar} />
          </section>
        ) : null}
```
- `recommendations`-Konstante entfernen (nicht mehr genutzt).

- [ ] **Step 3: Typecheck** → PASS (`recommendations`/`streaming` nirgends mehr referenziert).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/similar.ts "frontend/src/app/(frontend)/anime/[slug]/page.tsx"
git commit -m "Anime-Seite: StreamingBox oben, Ähnliche Anime integriert, datenabhängige Title/Description"
```

---

### Task 6: Redirects, Routen löschen, Sitemap/IndexNow bereinigen

**Files:**
- Modify: `frontend/next.config.mjs` (`redirects()`)
- Delete: `frontend/src/app/(frontend)/streamen/` und `frontend/src/app/(frontend)/aehnlich/` (ganze Ordner)
- Modify: `frontend/src/lib/sitemap.ts:53-56` (Typen `streamen`/`aehnlich` entfernen)
- Modify: `frontend/src/app/sitemaps/[chunk]/route.ts` (unbekannter Chunk → 404)
- Modify: `frontend/src/scripts/indexnow.ts:87` (Kommentar)

- [ ] **Step 1: Redirects** in `next.config.mjs` innerhalb `nextConfig` (vor `headers()`):

```js
  // Merge 2026-09: /streamen/<slug> und /aehnlich/<slug> sind in die Anime-Seite
  // eingefaltet (Streaming-Block bzw. Sektion „Ähnliche Anime"). Permanent →
  // Next antwortet mit 308; Google behandelt das wie 301 und überträgt Signale.
  // Die Sitemap-Dateien streamen-N.xml / aehnlich-N.xml antworten seitdem 404
  // (siehe sitemaps/[chunk]/route.ts), damit die GSC sie als entfernt erkennt.
  async redirects() {
    return [
      { source: '/streamen/:slug', destination: '/anime/:slug', permanent: true },
      { source: '/aehnlich/:slug', destination: '/anime/:slug', permanent: true },
      { source: '/streamen', destination: '/plattform', permanent: true },
      { source: '/aehnlich', destination: '/anime', permanent: true },
    ]
  },
```

- [ ] **Step 2: Routen löschen**

```bash
cd frontend && git rm -r "src/app/(frontend)/streamen" "src/app/(frontend)/aehnlich"
```

- [ ] **Step 3: `sitemap.ts`** — die beiden Einträge `{ key: 'streamen', … }` und `{ key: 'aehnlich', … }` samt Kommentar „Intent-Seiten …" entfernen.

- [ ] **Step 4: `sitemaps/[chunk]/route.ts`** — am Ende des Typ-Zweigs statt `if (!type || !Number.isFinite(page)) return render([])`:

```ts
  // Unbekannter Typ (z. B. die entfernten streamen-/aehnlich-Sitemaps) → 404,
  // damit die Search Console die Datei als verschwunden führt statt als leer.
  if (!type || !Number.isFinite(page)) return new Response('Not found', { status: 404 })
```

- [ ] **Step 5: `indexnow.ts`** Kommentar Zeile 87 → `// Anime: /anime/<slug> (streamen/aehnlich sind seit dem Merge Teil der Anime-Seite)`.

- [ ] **Step 6: Restsuche** — `grep -rn "streamen/\|aehnlich/" frontend/src` darf nur noch Kommentare/Redirects treffen.

- [ ] **Step 7: Typecheck + Tests** → PASS.

- [ ] **Step 8: Commit**

```bash
git add -A frontend/next.config.mjs "frontend/src/app/(frontend)" frontend/src/lib/sitemap.ts "frontend/src/app/sitemaps/[chunk]/route.ts" frontend/src/scripts/indexnow.ts
git commit -m "Merge: /streamen und /aehnlich → 308 auf /anime; Routen + Sitemap-Typen entfernt"
```

---

### Task 7: Indexregel für Anime, Charaktere, Personen

**Files:**
- Modify: `frontend/src/lib/anime.ts` (`animeIndexable`)
- Modify: `frontend/src/lib/sitemap.ts` (anime-Typ mit `select`+`keep`; characters/persons nur deutscher Text)
- Modify: `frontend/src/app/(frontend)/anime/[slug]/page.tsx` (noindex)
- Modify: `frontend/src/app/(frontend)/character/[slug]/page.tsx:61`, `frontend/src/app/(frontend)/person/[slug]/page.tsx:62`
- Test: `frontend/src/lib/anime.test.ts`

**Interfaces:**
- Produces: `animeIndexable(a: any): boolean`.

- [ ] **Step 1: Failing Test** (`anime.test.ts`):

```ts
import { animeIndexable } from './anime'

describe('animeIndexable', () => {
  const de = 'x'.repeat(120)
  it('indexiert mit Streaming immer (auch ohne Text)', () => {
    expect(animeIndexable({ streamingOffers: [{ provider: 'netflix', url: 'https://n' }] })).toBe(true)
    expect(animeIndexable({ streamingProviders: ['netflix'] })).toBe(true)
  })
  it('indexiert ohne Streaming nur mit deutschem Text ≥ 100 Zeichen', () => {
    expect(animeIndexable({ descriptionDe: de })).toBe(true)
    expect(animeIndexable({ descriptionSource: de })).toBe(false) // englischer Quelltext zählt nicht
    expect(animeIndexable({ descriptionDe: 'kurz' })).toBe(false)
  })
  it('Musikvideos ohne Streaming nie; redaktionelles noindex gewinnt', () => {
    expect(animeIndexable({ format: 'MUSIC', descriptionDe: de })).toBe(false)
    expect(animeIndexable({ noindex: true, streamingProviders: ['netflix'] })).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen** → FAIL.

- [ ] **Step 3: `anime.ts`** (unter `textTooThin`):

```ts
/**
 * Indexregel für Anime-Seiten — EINE Quelle für Seiten-noindex und Sitemap-keep.
 * Indexiert, wenn der Titel Streaming-Daten hat (das ist der Mehrwert gegenüber
 * AniList/aniSearch) ODER einen eigenen deutschen Text ≥ INDEX_MIN_CHARS. Nur
 * Quelltext (englisch) reicht nicht; Musikvideos ohne Stream sind immer dünn.
 */
export function animeIndexable(a: any): boolean {
  if (a?.noindex) return false
  const hasStream =
    (Array.isArray(a?.streamingOffers) && a.streamingOffers.length > 0) ||
    (Array.isArray(a?.streamingProviders) && a.streamingProviders.length > 0)
  if (hasStream) return true
  if (a?.format === 'MUSIC') return false
  return !textTooThin(a?.descriptionDe)
}
```

- [ ] **Step 4: Anime-Seite** — in `generateMetadata`: `noindex: !animeIndexable(anime) || undefined,` (Import `animeIndexable` aus `@/lib/anime`).

- [ ] **Step 5: `sitemap.ts`** — Import `animeIndexable`; anime-Typ ersetzen:

```ts
  {
    key: 'anime',
    collection: 'anime',
    path: (s) => `/anime/${s}`,
    select: { descriptionDe: true, format: true, noindex: true, streamingProviders: true, streamingOffers: true },
    keep: animeIndexable,
  },
```
Charaktere/Personen: `keep: (d) => !d.noindex && !textTooThin(d.descriptionDe)` bzw. `!textTooThin(d.bioDe)`; `select` entsprechend ohne `descriptionSource`/`bioSource`. Kommentar anpassen: „nur mit **deutschem** Text — englischer AniList-Quelltext gilt nicht als Inhalt".

Außerdem `animeChunk()` in `sitemaps/[chunk]/route.ts` (Genre-/Tag-Sitemaps) auf dieselbe Regel bringen: `select` um `descriptionDe, format, noindex, streamingProviders, streamingOffers` erweitern und `.filter((d) => d.slug && animeIndexable(d))`.

- [ ] **Step 6: Character/Person-Seiten** — `noindex: c.noindex || textTooThin(c.descriptionDe) || undefined` bzw. `p.noindex || textTooThin(p.bioDe) || undefined`. Kommentar: „Nur deutscher Text zählt (identisch zum Sitemap-keep)".

- [ ] **Step 7: Tests + Typecheck** → PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/anime.ts frontend/src/lib/anime.test.ts frontend/src/lib/sitemap.ts "frontend/src/app/sitemaps/[chunk]/route.ts" "frontend/src/app/(frontend)/anime/[slug]/page.tsx" "frontend/src/app/(frontend)/character/[slug]/page.tsx" "frontend/src/app/(frontend)/person/[slug]/page.tsx"
git commit -m "Indexregel: Anime mit Stream oder deutschem Text; Charaktere/Personen nur mit deutschem Text"
```

---

### Task 8: Plattform-Listen — Bibliothek

**Files:**
- Create: `frontend/src/lib/platformLists.ts`
- Test: `frontend/src/lib/platformLists.test.ts`

**Interfaces:**
- Produces:
```ts
export const MIN_LIST_SIZE = 10
export type ListFilter = { key: string; kind: 'static' | 'genre'; label: string; title: (p: string) => string; intro: (p: string, n: number) => string; genreSlug?: string; genreName?: string }
export function staticFilter(key: string): ListFilter | undefined
export function filterCondition(f: ListFilter): { sql: string; params: any[] }   // SQL-Fragment über Alias a (anime) und o (offers); Platzhalter ab $2
export async function resolveListFilter(payload: any, key: string): Promise<ListFilter | null>
export async function platformListCounts(payload: any): Promise<Map<string, number>>  // key `${provider}/${filter}`
export async function platformListPage(payload: any, providerSlug: string, f: ListFilter, page: number, perPage: number): Promise<{ docs: any[]; total: number }>
export async function platformListPaths(payload: any): Promise<string[]>            // alle Kombis ≥ MIN_LIST_SIZE, DE-Anbieter
```

- [ ] **Step 1: Failing Test**

```ts
import { describe, it, expect } from 'vitest'
import { staticFilter, filterCondition } from './platformLists'

describe('platformLists', () => {
  it('kennt die statischen Filter mit deutschem Title', () => {
    expect(staticFilter('deutscher-dub')?.title('Netflix')).toBe('Anime mit deutschem Dub auf Netflix')
    expect(staticFilter('kostenlos')?.title('Joyn')).toBe('Kostenlose Anime auf Joyn')
    expect(staticFilter('neu')?.title('Crunchyroll')).toBe('Neu auf Crunchyroll: Anime der letzten 30 Tage')
    expect(staticFilter('filme')?.title('Netflix')).toBe('Anime-Filme auf Netflix')
    expect(staticFilter('gibtsnicht')).toBeUndefined()
  })
  it('baut SQL-Bedingungen mit Platzhaltern ab $2', () => {
    expect(filterCondition(staticFilter('deutscher-dub')!).sql).toContain("%,de,%")
    expect(filterCondition(staticFilter('kostenlos')!).sql).toContain("('ads','free')")
    const g = filterCondition({ key: 'isekai', kind: 'genre', label: 'Isekai', genreSlug: 'isekai', genreName: 'Isekai', title: () => '', intro: () => '' })
    expect(g.sql).toContain('$2')
    expect(g.params).toEqual(['isekai'])
  })
})
```

- [ ] **Step 2: Test laufen lassen** → FAIL.

- [ ] **Step 3: `platformLists.ts`** anlegen:

```ts
/**
 * Plattform-Listen: /plattform/<anbieter>/<filter>
 *
 * Der eigentliche Streaming-USP in Suchintention: „anime mit deutschem dub auf
 * netflix", „kostenlose anime joyn", „isekai crunchyroll". Jede Kombination ist
 * eine eigene URL — aber nur, wenn sie ≥ MIN_LIST_SIZE Titel hat; darunter
 * noindex und nicht in der Sitemap (sonst züchten wir wieder Doorway-Pages).
 * Datenbasis ist ausschließlich `anime_streaming_offers` (anbieter-genau).
 */
import { DE_PROVIDER_SLUGS, providerBySlug } from './streaming'

export const MIN_LIST_SIZE = 10
const NEW_DAYS = 30

export type ListFilter = {
  key: string
  kind: 'static' | 'genre'
  label: string
  title: (providerName: string) => string
  intro: (providerName: string, n: number) => string
  genreSlug?: string
  genreName?: string
}

const STATIC: ListFilter[] = [
  {
    key: 'deutscher-dub', kind: 'static', label: 'Deutscher Dub',
    title: (p) => `Anime mit deutschem Dub auf ${p}`,
    intro: (p, n) => `${n} Anime laufen auf ${p} mit deutscher Synchronfassung. Die Angaben stammen aus dem aktuellen Katalog des Anbieters und werden regelmäßig abgeglichen.`,
  },
  {
    key: 'deutscher-sub', kind: 'static', label: 'Deutscher Sub',
    title: (p) => `Anime mit deutschen Untertiteln auf ${p}`,
    intro: (p, n) => `${n} Anime laufen auf ${p} im Originalton mit deutschen Untertiteln.`,
  },
  {
    key: 'kostenlos', kind: 'static', label: 'Kostenlos',
    title: (p) => `Kostenlose Anime auf ${p}`,
    intro: (p, n) => `${n} Anime sind auf ${p} ohne Abo abrufbar — gratis oder werbefinanziert, legal und in Deutschland verfügbar.`,
  },
  {
    key: 'neu', kind: 'static', label: 'Neu',
    title: (p) => `Neu auf ${p}: Anime der letzten 30 Tage`,
    intro: (p, n) => `${n} Anime sind in den letzten 30 Tagen neu in den ${p}-Katalog gekommen.`,
  },
  {
    key: 'filme', kind: 'static', label: 'Filme',
    title: (p) => `Anime-Filme auf ${p}`,
    intro: (p, n) => `${n} Anime-Filme laufen aktuell auf ${p}.`,
  },
]

export const staticFilter = (key: string) => STATIC.find((f) => f.key === key)
export const STATIC_FILTER_KEYS = STATIC.map((f) => f.key)

const genreFilter = (g: { slug: string; name: string }): ListFilter => ({
  key: g.slug, kind: 'genre', label: g.name, genreSlug: g.slug, genreName: g.name,
  title: (p) => `${g.name}-Anime auf ${p}`,
  intro: (p, n) => `${n} ${g.name}-Anime laufen aktuell auf ${p} — sortiert nach Beliebtheit.`,
})

/** SQL-Fragment über Aliase `a` (anime) und `o` (anime_streaming_offers); $1 ist der Provider. */
export function filterCondition(f: ListFilter): { sql: string; params: any[] } {
  switch (f.kind === 'genre' ? 'genre' : f.key) {
    case 'deutscher-dub': return { sql: "(',' || COALESCE(o.audio,'') || ',') LIKE '%,de,%'", params: [] }
    case 'deutscher-sub': return { sql: "(',' || COALESCE(o.subs,'') || ',') LIKE '%,de,%'", params: [] }
    case 'kostenlos':     return { sql: "o.monetization IN ('ads','free')", params: [] }
    case 'neu':           return { sql: `o.first_seen_at >= now() - interval '${NEW_DAYS} days'`, params: [] }
    case 'filme':         return { sql: "a.format = 'MOVIE'", params: [] }
    case 'genre':
      return {
        sql: 'EXISTS (SELECT 1 FROM anime_rels ar JOIN genres g ON g.id = ar.genres_id WHERE ar.parent_id = a.id AND g.slug = $2)',
        params: [f.genreSlug],
      }
    default: return { sql: 'false', params: [] }
  }
}

export async function resolveListFilter(payload: any, key: string): Promise<ListFilter | null> {
  const s = staticFilter(key)
  if (s) return s
  const { docs } = await payload.find({ collection: 'genres', where: { slug: { equals: key } }, limit: 1, depth: 0 })
  return docs.length ? genreFilter(docs[0] as any) : null
}

const pool = (payload: any) => (payload.db as any).pool

/** Titelzahl je `${provider}/${filter}` für DE-Anbieter — 6 gruppierte Abfragen statt Anbieter×Filter. */
export async function platformListCounts(payload: any): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const p = pool(payload)
  for (const f of STATIC) {
    const c = filterCondition(f)
    const res = await p.query(
      `SELECT o.provider, count(DISTINCT a.id)::int AS n
       FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
       WHERE ${c.sql} AND a.is_hentai IS NOT TRUE GROUP BY o.provider`,
    )
    for (const r of res.rows) out.set(`${r.provider}/${f.key}`, r.n)
  }
  const g = await p.query(
    `SELECT o.provider, g.slug, count(DISTINCT a.id)::int AS n
     FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
     JOIN anime_rels ar ON ar.parent_id = a.id AND ar.genres_id IS NOT NULL
     JOIN genres g ON g.id = ar.genres_id
     WHERE a.is_hentai IS NOT TRUE GROUP BY o.provider, g.slug`,
  )
  for (const r of g.rows) out.set(`${r.provider}/${r.slug}`, r.n)
  return out
}

/** Eine Seite der Liste, nach Popularität. Hentai bleibt draußen (wie in ähnlichen Listen). */
export async function platformListPage(payload: any, providerSlug: string, f: ListFilter, page: number, perPage: number) {
  const c = filterCondition(f)
  const p = pool(payload)
  const base = `FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
                WHERE o.provider = $1 AND ${c.sql} AND a.is_hentai IS NOT TRUE`
  const [cnt, ids] = await Promise.all([
    p.query(`SELECT count(DISTINCT a.id)::int AS n ${base}`, [providerSlug, ...c.params]),
    p.query(
      `SELECT a.id ${base} GROUP BY a.id ORDER BY max(a.popularity) DESC NULLS LAST, a.id
       LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`,
      [providerSlug, ...c.params],
    ),
  ])
  const order: number[] = ids.rows.map((r: any) => r.id)
  if (!order.length) return { docs: [], total: cnt.rows[0]?.n ?? 0 }
  const res = await payload.find({ collection: 'anime', where: { id: { in: order } }, limit: order.length, depth: 0 })
  const byId = new Map((res.docs as any[]).map((d) => [d.id, d]))
  return { docs: order.map((id) => byId.get(id)).filter(Boolean), total: cnt.rows[0]?.n ?? 0 }
}

/** Alle indexwürdigen Listen-URLs (Sitemap + Hub-Chips). */
export async function platformListPaths(payload: any): Promise<string[]> {
  const counts = await platformListCounts(payload)
  const out: string[] = []
  for (const [key, n] of counts) {
    const [provider, filter] = key.split('/')
    if (n >= MIN_LIST_SIZE && DE_PROVIDER_SLUGS.includes(provider) && providerBySlug(provider)) out.push(`/plattform/${provider}/${filter}`)
  }
  return out.sort()
}
```

- [ ] **Step 4: Tests + Typecheck** → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/platformLists.ts frontend/src/lib/platformLists.test.ts
git commit -m "Plattform-Listen: Filter-Definitionen, SQL über streamingOffers, Zählung für Sitemap/Hub"
```

---

### Task 9: Plattform-Listen — Seite, Hub-Chips, Sitemap

**Files:**
- Create: `frontend/src/app/(frontend)/plattform/[slug]/[filter]/page.tsx`
- Modify: `frontend/src/app/(frontend)/plattform/[slug]/page.tsx` (Chips „Listen" auf Seite 1)
- Modify: `frontend/src/app/sitemaps/[chunk]/route.ts` (`static`-Chunk um Listen ergänzen)

**Interfaces:**
- Consumes: alles aus Task 8; `AnimeCard`, `Pagination`, `Breadcrumbs`, `pageMeta`, `providerBySlug`, `DE_PROVIDER_SLUGS`.

- [ ] **Step 1: Listen-Seite** anlegen:

```tsx
import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { AnimeCard } from '@/components/AnimeCard'
import { Pagination } from '@/components/Pagination'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { pageMeta } from '@/lib/seo'
import { DE_PROVIDER_SLUGS, providerBySlug } from '@/lib/streaming'
import { MIN_LIST_SIZE, platformListPage, resolveListFilter, STATIC_FILTER_KEYS, staticFilter } from '@/lib/platformLists'
import { formatDateDe } from '@/lib/anime'

// Wie /plattform/[slug]: Pagination/Sortierung über searchParams → dynamisch.
export const dynamic = 'force-dynamic'
const PER_PAGE = 36

async function load(slug: string, filter: string) {
  const provider = providerBySlug(slug)
  if (!provider || !DE_PROVIDER_SLUGS.includes(slug)) return null
  const payload = await getPayload({ config })
  const f = await resolveListFilter(payload, filter)
  if (!f) return null
  return { payload, provider, f }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; filter: string }> }): Promise<Metadata> {
  const { slug, filter } = await params
  const ctx = await load(slug, filter)
  if (!ctx) return {}
  const { payload, provider, f } = ctx
  const { total } = await platformListPage(payload, provider.slug, f, 1, 1)
  const month = new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })
  return pageMeta({
    title: `${f.title(provider.name)} — ${total} Titel (${month}) | OtakuPulse`,
    description: f.intro(provider.name, total).slice(0, 160),
    path: `/plattform/${provider.slug}/${f.key}`,
    image: provider.logo,
    // Unter MIN_LIST_SIZE ist die Liste dünn → noindex (und nicht in der Sitemap).
    noindex: total < MIN_LIST_SIZE,
  })
}

export default async function PlatformListPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; filter: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { slug, filter } = await params
  const sp = await searchParams
  const ctx = await load(slug, filter)
  if (!ctx) notFound()
  const { payload, provider, f } = ctx
  const page = Math.max(1, Number(sp.page) || 1)
  const { docs, total } = await platformListPage(payload, provider.slug, f, page, PER_PAGE)
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const siblings = STATIC_FILTER_KEYS.filter((k) => k !== f.key)

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Streaming-Anbieter', path: '/plattform' },
          { name: provider.name, path: `/plattform/${provider.slug}` },
          { name: f.label, path: `/plattform/${provider.slug}/${f.key}` },
        ]}
      />
      <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: provider.color || undefined }}>
        {provider.name}
      </p>
      <h1 className="mt-1 text-3xl font-extrabold text-white">{f.title(provider.name)}</h1>
      <p className="mt-3 max-w-3xl leading-relaxed text-zinc-300">
        {f.intro(provider.name, total)} Stand: {formatDateDe(new Date().toISOString())}.
      </p>

      <div className="mt-5 flex flex-wrap gap-2 text-sm">
        <Link href={`/plattform/${provider.slug}`} className="rounded-lg border border-white/10 px-3 py-1.5 text-zinc-400 transition hover:border-accent/40 hover:text-white">
          Alle auf {provider.name}
        </Link>
        {siblings.map((k) => (
          <Link key={k} href={`/plattform/${provider.slug}/${k}`} className="rounded-lg border border-white/10 px-3 py-1.5 text-zinc-400 transition hover:border-accent/40 hover:text-white">
            {staticFilter(k)!.label}
          </Link>
        ))}
      </div>

      {docs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Aktuell keine passenden Titel auf {provider.name}.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {docs.map((a: any) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </div>
      )}

      <Pagination basePath={`/plattform/${provider.slug}/${f.key}`} page={page} totalPages={totalPages} />

      <section className="mt-10 rounded-xl border border-white/10 bg-zinc-900/40 p-4 text-sm leading-relaxed text-zinc-400">
        <strong className="text-zinc-300">So entsteht diese Liste:</strong> Wir gleichen den Katalog von {provider.name}{' '}
        regelmäßig ab und übernehmen nur Titel mit direktem Link zum Stream. Sprachfassung, Staffel-Stand und
        Ablaufdatum stehen auf der jeweiligen Anime-Seite. Kataloge ändern sich laufend — maßgeblich ist immer das
        aktuelle Angebot bei {provider.name}.
      </section>
    </main>
  )
}
```

- [ ] **Step 2: Hub-Chips auf `/plattform/[slug]`** — Import `import { platformListCounts, MIN_LIST_SIZE, staticFilter } from '@/lib/platformLists'`. Neben `deDub`/`topGenres` deklarieren: `let lists: { key: string; label: string; n: number }[] = []`. Innerhalb `if (isFirst)` zusätzlich (nach den bestehenden Queries):

```ts
    // Listen-Chips: nur Kombinationen, die indexwürdig sind (≥ MIN_LIST_SIZE).
    const [counts, allGenres] = await Promise.all([
      platformListCounts(payload),
      payload.find({ collection: 'genres', limit: 100, depth: 0, select: { slug: true, name: true } as any }),
    ])
    const genreName = new Map((allGenres.docs as any[]).map((g) => [g.slug, g.name]))
    lists = [...counts.entries()]
      .filter(([k, n]) => k.startsWith(`${provider.slug}/`) && n >= MIN_LIST_SIZE)
      .map(([k, n]) => {
        const key = k.split('/')[1]
        return { key, label: staticFilter(key)?.label ?? genreName.get(key) ?? key, n }
      })
      .sort((a, b) => b.n - a.n)
```
Direkt vor dem Block `{/* Sortierung */}` rendern:

```tsx
      {isFirst && lists.length ? (
        <section className="mt-6">
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-400">Listen für {provider.name}</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {lists.map(({ key, label, n }) => (
              <Link key={key} href={`/plattform/${provider.slug}/${key}`} className="rounded-full border border-white/10 bg-zinc-900/40 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-accent/40 hover:text-white">
                {label} <span className="text-zinc-500">{n}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
```

- [ ] **Step 3: Sitemap** — in `sitemaps/[chunk]/route.ts` beim `static`-Chunk:

```ts
  if (id === 'static') {
    const payload = await getPayload({ config })
    const lists = await platformListPaths(payload)
    return render([...STATIC_PATHS, ...lists].map((p) => ({ loc: url(p) })))
  }
```
(Import `platformListPaths` aus `@/lib/platformLists`.)

- [ ] **Step 4: Typecheck + Tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/(frontend)/plattform" "frontend/src/app/sitemaps/[chunk]/route.ts"
git commit -m "Plattform-Listen: /plattform/<anbieter>/<filter> (Dub, Sub, Kostenlos, Neu, Filme, Genre) + Hub + Sitemap"
```

---

### Task 10: Rollout (Live-Host)

**Files:**
- Modify: `README.md` (Abschnitt „Streaming & Sprachen", Feature-Liste), `docs/BETRIEB.md` (JustWatch-Abschnitt), `docs/PROJEKT.md` (Pfade)
- Modify: `backfill-streaming.sh` (JustWatch-Schritt ohne `--only-missing`, mit Hinweis auf Laufzeit)

- [ ] **Step 1: Doku**
  - README „Streaming & Sprachen": beschreiben, dass `streamingOffers` anbieter-genau ist (Deep-Link, Sprachen je Anbieter, Staffeln/Episoden, Ablauf, Neu), dass `/streamen` und `/aehnlich` in die Anime-Seite eingefaltet sind (308) und dass es Listen-Seiten `/plattform/<anbieter>/<filter>` gibt.
  - BETRIEB.md JustWatch-Abschnitt: neue Aufrufe (`--slugs`, `--dry-run`), Rate-Limit, „Offers sind autoritativ, Sprachen additiv".
  - PROJEKT.md: Routen `streamen/`, `aehnlich/` entfernen, `plattform/[slug]/[filter]/` und `lib/platformLists.ts`, `lib/similar.ts`, `components/StreamingBox.tsx` ergänzen.
  - `backfill-streaming.sh`: Schritt 1 auf `python3 -u src/scripts/justwatch-streaming.py` (voll; ~11k Titel, ~25–35 min bei 8–10 req/s) ändern; Kommentar entsprechend.
  - Commit: `git commit -am "Doku: Streaming-Merge, Offers-Datenmodell, Listen-Seiten"`.

- [ ] **Step 2: Branch pushen, PR** — `git push -u origin seo/streaming-merge`, PR gegen `main` mit Zusammenfassung (Spec verlinken).

- [ ] **Step 3: Live-Code auf den Branch bringen** (nach Review/Merge in `main`):

```bash
cd /mnt/cache/appdata/otakupulse && git pull --ff-only
```

- [ ] **Step 4: Schema-Push (additiv: Tabelle `anime_streaming_offers`, Enum-Werte aniverse/adn/toggo)**

```bash
cd /mnt/cache/appdata/otakupulse/frontend
docker exec --env-file secrets.env -e NODE_ENV=development otakupulse-enrich sh -lc 'cd /app && npx tsx src/scripts/db-push.ts'
docker exec otakupulse-db psql -U otaku -d otakupulse -c "\d anime_streaming_offers"
docker exec otakupulse-db psql -U otaku -d otakupulse -c "SELECT unnest(enum_range(NULL::enum_anime_streaming_providers));" | grep -E "aniverse|adn|toggo"
docker exec otakupulse-db psql -U otaku -d otakupulse -c "\dT+ enum_anime_streaming_offers_monetization"
```
Erwartet: Spalten `_order,_parent_id,id,provider,monetization,url,audio,subs,seasons,episodes,available_to,first_seen_at,last_seen_at`; die drei Enum-Werte vorhanden. **Falls Spaltennamen abweichen: `build_sql()` im Python-Skript anpassen, bevor weitergemacht wird.**

- [ ] **Step 5: JustWatch-Skript live testen**

```bash
python3 -u src/scripts/justwatch-streaming.py --slugs naruto,clannad,frieren --dry-run
python3 -u src/scripts/justwatch-streaming.py --slugs naruto,clannad,frieren
docker exec otakupulse-db psql -U otaku -d otakupulse -c "SELECT a.slug,o.provider,o.monetization,o.audio,o.subs,o.seasons,o.episodes,o.available_to FROM anime_streaming_offers o JOIN anime a ON a.id=o._parent_id WHERE a.slug IN ('naruto','clannad','frieren') ORDER BY 1,2;"
docker exec otakupulse-db psql -U otaku -d otakupulse -c "SELECT a.slug, string_agg(l.value::text, ',') FROM anime a JOIN anime_available_languages l ON l.parent_id=a.id WHERE a.slug IN ('naruto','clannad','frieren') GROUP BY 1;"
```
Erwartet: Naruto mit crunchyroll/netflix/joyn/amazon-prime-video/disney-plus/rtl-plus/aniverse/toggo (Deep-Links), Clannad mit aniverse + adn, Frieren mit crunchyroll/netflix/joyn; `de-dub`/`de-sub` bei Naruto ergänzt.

- [ ] **Step 6: Voll-Backfill (läuft ~30 min, App bleibt online)**

```bash
nohup python3 -u src/scripts/justwatch-streaming.py > /tmp/otaku-offers-backfill.log 2>&1 &
tail -f /tmp/otaku-offers-backfill.log   # bis „✓ … als geprüft markiert"
docker exec otakupulse-db psql -U otaku -d otakupulse -c "SELECT provider, count(DISTINCT _parent_id) FROM anime_streaming_offers GROUP BY 1 ORDER BY 2 DESC;"
```

- [ ] **Step 7: Build + Deploy** — `sh /mnt/cache/appdata/otakupulse/deploy-features.sh` (Pre-Build im enrich-Container, dann Container-Neustart). Danach prüfen:

```bash
curl -sI https://www.otakupulse.de/streamen/naruto | grep -iE "^(HTTP|location)"      # 308 → /anime/naruto
curl -sI https://www.otakupulse.de/aehnlich/naruto | grep -iE "^(HTTP|location)"
curl -sI https://www.otakupulse.de/sitemaps/streamen-0.xml | head -1                  # 404
curl -s https://www.otakupulse.de/anime/naruto | grep -o '<title>[^<]*'                # „Naruto im Stream: …"
curl -s https://www.otakupulse.de/anime/naruto | grep -c 'WatchAction'
curl -s https://www.otakupulse.de/plattform/netflix/deutscher-dub | grep -o '<title>[^<]*\|name="robots" content="[^"]*"'
curl -s https://www.otakupulse.de/sitemaps/static.xml | grep -c '/plattform/.*/'      # Listen in der Sitemap
```

- [ ] **Step 8: Suchmaschinen anstoßen**

```bash
docker exec --env-file secrets.env otakupulse-enrich sh -lc 'cd /app && npx tsx src/scripts/indexnow.ts --recent 1'
```
Search Console: Sitemap `https://www.otakupulse.de/sitemap.xml` erneut einreichen; alte Einträge `sitemaps/streamen-0.xml`, `aehnlich-0.xml`, `aehnlich-1.xml` dort entfernen. URL-Prüfung für `/anime/naruto` und `/plattform/netflix/deutscher-dub` → „Indexierung beantragen".

- [ ] **Step 9: Nachlauf-Kontrolle (1–2 Wochen)** — GSC „Seiten": Rückgang „Gecrawlt – nicht indexiert"; „Leistung" mit Filter `/plattform/` und Query enthält „dub|netflix|crunchyroll|joyn"; Cron `refresh-streaming.sh` läuft weiter alle 4 h mit `--stale 150` und hält `first_seen_at`/„Neu"-Listen aktuell.
