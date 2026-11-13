/**
 * Wiederkehrende News-Formate — erzeugt regelmäßig Artikel UNABHÄNGIG davon, ob
 * neue Titel in die DB kommen (anders als generate-anime-news.ts, das nur auf
 * Neuzugänge reagiert). Alle Listen/Fakten werden DETERMINISTISCH aus der DB
 * gebaut; Claude liefert nur Headline, Teaser und Intro-Fließtext.
 *
 * Modi (je Aufruf einer):
 *   --daily            ABGESCHAFFT (erzeugte pro Tag Digest + Einzel-Episoden-Artikel).
 *   --weekly-preview   „Anime-Woche": was startet, was läuft weiter, was endet —
 *                      ein Artikel pro Kalenderwoche. Montags früh (07:55).
 *   --weekly-recap     Wochenrückblick (was lief, Highlights). Sonntags abends.
 *   --genre-spotlight  Rotierendes Genre-Ranking („Die besten X-Anime"). Seit 11/2026 durch:
 *                      alle 19 Live-Genres haben einen Artikel. Läuft erst 2027 wieder an.
 *   --tag-spotlight    Zufälliges Tag-Ranking („Anime mit <Tag>"). Ersetzt das Genre-Spotlight
 *                      im Mittwochs-Lauf; läuft dauerhaft, weil es viel mehr Tags als Genres gibt.
 *                      Ein Tag höchstens einmal pro Jahr. Wöchentlich.
 *   --platform-new     „Neu auf <Anbieter> im <Monat>" — je DE-Anbieter die Titel, die in
 *                      den letzten 30 Tagen neu in den Katalog kamen (streamingOffers.
 *                      first_seen_at, gegengeprüft über ECHT_NEU, siehe dort).
 *                      Wöchentlich; ein Artikel pro Anbieter und Monat.
 *   --platform-leaving „Diese Anime verlassen <Anbieter>" — Titel mit Ablaufdatum in den
 *                      nächsten VERLAESST_TAGE Tagen (streamingOffers.available_to).
 *                      Wöchentlich.
 *
 * Dedup über feste Slugs (simulcast-heute-<datum>, episode-<anime>-<n>, …) —
 * ein zweiter Lauf am selben Tag erstellt nichts doppelt. Hentai ist überall
 * ausgeschlossen. Zeitrechnung in Europe/Berlin.
 *
 * Aufruf (im enrich-Container): npx tsx src/scripts/generate-recurring-news.ts --daily
 * Flags: --dry (nur Vorschau) · --draft · --date YYYY-MM-DD (Testdatum)
 *        --max-highlights N (Default 4) · --tag <slug> (Tag-Spotlight erzwingen)
 */
import { getPayload, type Payload } from 'payload'
import config from '../payload.config'
import Anthropic from '@anthropic-ai/sdk'
import { displayTitle, animeBanner } from '../lib/anime'
import { DE_PROVIDER_SLUGS, providerBySlug } from '../lib/streaming'
import { toLexical, stripMarkers, type Valid } from '../lib/articleBody'

const MODEL = 'claude-sonnet-4-6'

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('✗ ANTHROPIC_API_KEY fehlt.')
  process.exit(1)
}
const anthropic = new Anthropic({ apiKey, maxRetries: 5 })

const SYSTEM =
  'Du bist Redakteur:in beim deutschsprachigen Anime-Magazin OtakuPulse. Zielgruppe: Anime-Fans und ' +
  'Otakus im deutschsprachigen Raum. Schreibstil: energiegeladen, fan-nah, ABER lesbar und ehrlich. ' +
  'Sprich die Leser:innen mit "du" an. Dosierter Community-Slang (Simulcast, Sub/Dub, Cour, Hype …) ' +
  'ist erwünscht, aber nicht überladen.\n\n' +
  'WICHTIG: Erfinde KEINE Fakten — keine Plot-Details, Termine, Studios oder Episodeninhalte, die nicht ' +
  'unten geliefert werden. Wenn ein Fakt fehlt, lass ihn weg statt zu raten.\n\n' +
  'Du bekommst FERTIGE Link-Bausteine wie [[anime:slug|Titel]], [[genre:slug|Name]] oder ' +
  '[[page:slug|Label]]. Baue die im Auftrag genannten Bausteine wörtlich ein. Erfinde NIEMALS eigene Slugs.\n\n' +
  'Formatierung des `body` (reiner Text mit Markern): Absätze durch Leerzeilen trennen; KEINE Listen, ' +
  'KEINE Überschriften (die deterministischen Listen werden separat angehängt), KEIN Markdown-Fett.\n\n' +
  'Antworte als JSON {headline, excerpt, body}. headline: packend & klickstark, ohne Marker. ' +
  'excerpt: 1–2 Sätze Teaser (max. ~160 Zeichen, ohne Marker).'

const SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    excerpt: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['headline', 'excerpt', 'body'],
  additionalProperties: false,
}

async function write(user: string, maxTokens = 1600): Promise<{ headline: string; excerpt: string; body: string }> {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  } as any)
  const block = (res.content as any[]).find((b) => b.type === 'text')
  return JSON.parse(block.text)
}

// ---------------------------------------------------------------------------
// Zeit-Helfer (Europe/Berlin)
// ---------------------------------------------------------------------------
const YMD = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })
const HOUR = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false })
const TIME = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
const DAY_LONG = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const DAY_SHORT = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long' })

const berlinYmd = (d: Date): string => YMD.format(d)

/** UTC-Zeitpunkt von Mitternacht (Europe/Berlin) des gegebenen Kalendertags. */
function berlinMidnight(ymd: string): Date {
  for (const off of ['+02:00', '+01:00']) {
    const d = new Date(`${ymd}T00:00:00${off}`)
    if (YMD.format(d) === ymd && HOUR.format(d) === '00') return d
  }
  return new Date(`${ymd}T00:00:00+01:00`)
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

/** Wochentag (0=Mo … 6=So) eines Kalendertags. */
function weekdayIndex(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
}

/** ISO-Kalenderwoche + zugehöriges Jahr. */
function isoWeek(ymd: string): { week: number; year: number } {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7) + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3)
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 864e5))
  return { week, year: date.getUTCFullYear() }
}

// ---------------------------------------------------------------------------
// Daten-Helfer
// ---------------------------------------------------------------------------
const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

type EpRow = { ep: any; anime: any; time: Date }

/** Episoden im Zeitfenster, Anime aufgelöst, Hentai raus, nach Sendezeit sortiert. */
async function fetchEpisodes(payload: Payload, from: Date, to: Date): Promise<EpRow[]> {
  const res = await payload.find({
    collection: 'episodes',
    where: {
      and: [{ airDate: { greater_than_equal: from.toISOString() } }, { airDate: { less_than: to.toISOString() } }],
    },
    sort: 'airDate',
    limit: 500,
    depth: 1,
  })
  return (res.docs as any[])
    .filter((e) => e.anime && typeof e.anime === 'object' && e.anime.isHentai !== true && e.airDate)
    .map((e) => ({ ep: e, anime: e.anime, time: new Date(e.airDate) }))
}

const platformNames = (a: any): string[] =>
  ((a.streamingProviders || []) as string[]).map((s) => providerBySlug(s)?.name).filter(Boolean) as string[]

/** Pipe-Zeichen aus Zellinhalten halten (würde die Tabellen-Syntax brechen). */
const cell = (s: string): string => s.replace(/\|/g, '∕')

/** Eine Episoden-Zeile als Tabellen-Row: | Zeit | Anime | Episode | Plattform | */
function epRow(r: EpRow): string {
  const t = cell(displayTitle(r.anime))
  const plat = platformNames(r.anime)
  const n = Number(r.ep.number)
  return `| ${TIME.format(r.time)} Uhr | [[anime:${r.anime.slug}|${t}]] | ${Number.isFinite(n) ? n : cell(String(r.ep.number))} | ${
    plat.length ? cell(plat.slice(0, 3).join(', ')) : '—'
  } |`
}

const EP_TABLE_HEAD = '| Zeit | Anime | Episode | Plattform |\n|---|---|---|---|'

/** Slug-Existenz-Check (Dedup). */
async function slugExists(payload: Payload, slug: string): Promise<boolean> {
  const r = await payload.find({ collection: 'articles', where: { slug: { equals: slug } }, limit: 1, depth: 0 })
  return r.docs.length > 0
}

async function ensureAuthor(payload: Payload): Promise<any> {
  const a = await payload.find({ collection: 'authors', where: { slug: { equals: 'otakupulse-redaktion' } }, limit: 1 })
  if (a.docs.length) return a.docs[0].id
  return (
    await payload.create({
      collection: 'authors',
      data: { name: 'OtakuPulse Redaktion', slug: 'otakupulse-redaktion', role: 'editor' } as any,
    })
  ).id
}

type CreateOpts = {
  slug: string
  category: string
  coverImageUrl?: string
  relatedAnime: any[]
  valid: Valid
  prompt: string
  fallbackTitle: string
  /** Deterministischer Teil, wird an den KI-body angehängt. */
  appendix: string
}

const dry = process.argv.includes('--dry')
const draft = process.argv.includes('--draft')

async function createArticle(payload: Payload, authorId: any, o: CreateOpts): Promise<boolean> {
  if (await slugExists(payload, o.slug)) {
    console.log(`[=] existiert: ${o.slug}`)
    return false
  }
  if (dry) {
    console.log(`\n— DRY ${o.slug} —\n${stripMarkers(o.appendix).slice(0, 600)}\n`)
    return true
  }
  const art = await write(o.prompt)
  const headline = stripMarkers(art.headline) || o.fallbackTitle
  const excerpt = stripMarkers(art.excerpt).slice(0, 200)
  const { root } = toLexical(`${art.body}\n\n${o.appendix}`, o.valid)
  await payload.create({
    collection: 'articles',
    draft,
    data: {
      title: headline,
      slug: o.slug,
      excerpt,
      category: o.category,
      coverImageUrl: o.coverImageUrl || undefined,
      body: { root },
      author: authorId,
      relatedAnime: o.relatedAnime.slice(0, 12),
      publishDate: new Date().toISOString(),
      _status: draft ? 'draft' : 'published',
    } as any,
  })
  console.log(`[✓] ${headline}  → /news/${o.slug}${draft ? ' (Entwurf)' : ''}`)
  return true
}

/** Seiten-Link-Whitelist für [[page:…]]-Marker. */
const PAGES = new Map<string, string>([
  ['kalender', '/kalender'],
  ['anime', '/anime'],
  ['top-anime', '/top-anime'],
  ['plattform', '/plattform'],
  ['season', '/season'],
  ['news', '/news'],
])

const validFor = (rows: EpRow[], extra?: Partial<Valid>): Valid => ({
  anime: new Set(rows.map((r) => r.anime.slug)),
  genre: extra?.genre ?? new Set(),
  studio: new Set(),
  tag: new Set(),
  page: PAGES,
})

/** Bester Banner-Kandidat (höchster Score mit Banner). */
const bestBanner = (rows: EpRow[]): string | undefined => {
  const sorted = [...rows].sort((a, b) => (b.anime.averageScore || 0) - (a.anime.averageScore || 0))
  for (const r of sorted) {
    const b = animeBanner(r.anime)
    if (b) return b
  }
  return undefined
}

const score = (a: any): number => a.averageScore || 0
const pop = (a: any): number => a.popularity || 0

// ---------------------------------------------------------------------------
// Modus: --weekly-preview  (Montags: die komplette Woche)
// ---------------------------------------------------------------------------
async function runWeeklyPreview(payload: Payload, authorId: any, ymd: string): Promise<void> {
  const monday = addDays(ymd, -weekdayIndex(ymd))
  const from = berlinMidnight(monday)
  const to = berlinMidnight(addDays(monday, 7))
  const rows = await fetchEpisodes(payload, from, to)
  const { week, year } = isoWeek(monday)
  console.log(`→ ${rows.length} Episoden in KW ${week}/${year}`)
  if (!rows.length) return

  // --- Einordnung je Titel: Start, Finale oder laufend ---------------------
  type Entry = { row: EpRow; n: number; total: number | null }
  const first = new Map<any, Entry>() // pro Anime die früheste Episode der Woche
  for (const r of rows) {
    const n = Number(r.ep.number)
    const prev = first.get(r.anime.id)
    if (!prev || n < prev.n) {
      first.set(r.anime.id, { row: r, n, total: typeof r.anime.episodes === 'number' ? r.anime.episodes : null })
    }
  }
  const entries = [...first.values()]
  const starters = entries.filter((e) => e.n === 1)
  // Finale: die letzte Episode der Staffel läuft diese Woche.
  const finales = rows
    .map((r) => ({ row: r, n: Number(r.ep.number), total: typeof r.anime.episodes === 'number' ? r.anime.episodes : null }))
    .filter((e) => e.total && e.n === e.total)
  const finaleIds = new Set(finales.map((e) => e.row.anime.id))
  const ongoing = entries.filter((e) => e.n > 1 && !finaleIds.has(e.row.anime.id))

  // Hat ein Titel eine bekannte Fortsetzung? (relations SEQUEL) → „geht weiter"
  const hasSequel = (a: any): boolean =>
    ((a?.relations || []) as any[]).some((rel) => rel?.relationType === 'SEQUEL')

  const t = (r: EpRow) => displayTitle(r.anime)
  const line = (e: Entry | { row: EpRow; n: number }) =>
    `| [[anime:${e.row.anime.slug}|${cell(t(e.row))}]] | ${e.n} | ${DAY_SHORT.format(e.row.time)}, ${TIME.format(e.row.time)} Uhr | ${
      platformNames(e.row.anime).length ? cell(platformNames(e.row.anime).join(', ')) : '—'
    } |`
  const HEAD = '| Anime | Episode | Ausstrahlung | Wo läuft es |\n|---|---|---|---|'

  const appendix: string[] = []
  if (starters.length) {
    appendix.push('## Diese Woche starten', '', HEAD, ...starters.map(line), '')
  }
  if (ongoing.length) {
    appendix.push('## Es geht weiter', '', HEAD, ...ongoing.sort((a, b) => +a.row.time - +b.row.time).map(line), '')
  }
  if (finales.length) {
    appendix.push(
      '## Finale der Woche',
      '',
      '| Anime | Letzte Episode | Ausstrahlung | Wie es weitergeht |',
      '|---|---|---|---|',
      ...finales.map(
        (e) =>
          `| [[anime:${e.row.anime.slug}|${cell(t(e.row))}]] | ${e.n} von ${e.total} | ${DAY_SHORT.format(e.row.time)}, ${TIME.format(
            e.row.time,
          )} Uhr | ${hasSequel(e.row.anime) ? 'Fortsetzung angekündigt' : 'Fortsetzung offen'} |`,
      ),
      '',
    )
  }
  appendix.push(`Alle Sendetermine mit Countdown findest du im [[page:kalender|Simulcast-Kalender]].`)

  const topTitles = [...rows].sort((a, b) => score(b.anime) - score(a.anime) || pop(b.anime) - pop(a.anime)).slice(0, 4)
  const sequelNote = finales.filter((e) => hasSequel(e.row.anime)).map((e) => t(e.row))

  await createArticle(payload, authorId, {
    slug: `anime-woche-kw${week}-${year}`,
    category: 'simulcast',
    coverImageUrl: bestBanner(rows),
    relatedAnime: [...new Set([...starters, ...finales, ...topTitles.map((r) => ({ row: r }) as any)].map((e: any) => e.row.anime.id))].slice(0, 12),
    valid: validFor(rows),
    fallbackTitle: `Anime-Woche KW ${week}: ${starters.length} Starts, ${rows.length} neue Folgen`,
    prompt: [
      `Schreibe das Intro (3–4 Absätze, 180–260 Wörter) für unseren Wochenüberblick „Anime-Woche" (KW ${week}, ${year}).`,
      `Zahlen der Woche: ${rows.length} neue Episoden, ${starters.length} Serienstarts, ${finales.length} Staffelfinale.`,
      starters.length
        ? `Neu dabei (Bausteine wörtlich einbauen): ${starters.slice(0, 4).map((e) => `[[anime:${e.row.anime.slug}|${t(e.row)}]]`).join(', ')}`
        : `Diese Woche startet keine neue Serie — der Schwerpunkt liegt auf den laufenden Titeln.`,
      topTitles.length
        ? `Weiter geht es u. a. mit: ${topTitles.slice(0, 3).map((r) => `[[anime:${r.anime.slug}|${displayTitle(r.anime)}]]`).join(', ')}`
        : '',
      finales.length
        ? `Zum Finale kommen: ${finales.slice(0, 4).map((e) => `[[anime:${e.row.anime.slug}|${t(e.row)}]]`).join(', ')}.` +
          (sequelNote.length ? ` Davon haben eine Fortsetzung angekündigt: ${sequelNote.slice(0, 3).join(', ')}.` : '')
        : '',
      `Gliedere das Intro grob in: was neu startet · was weiterläuft · was zu Ende geht.`,
      `Verweise auf den [[page:kalender|Simulcast-Kalender]].`,
      `headline: Muss "Woche" enthalten und Lust auf die Woche machen (z. B. "Anime-Woche KW ${week}: …").`,
    ]
      .filter(Boolean)
      .join('\n'),
    appendix: appendix.join('\n'),
  })
}

// ---------------------------------------------------------------------------
// Modus: --weekly-recap  (Sonntags: Rückblick auf die Woche)
// ---------------------------------------------------------------------------
async function runWeeklyRecap(payload: Payload, authorId: any, ymd: string): Promise<void> {
  const monday = addDays(ymd, -weekdayIndex(ymd))
  const from = berlinMidnight(monday)
  const to = berlinMidnight(addDays(monday, 7))
  const rows = await fetchEpisodes(payload, from, to)
  const { week, year } = isoWeek(monday)
  console.log(`→ ${rows.length} Episoden in KW ${week}/${year} (Recap)`)
  if (!rows.length) return

  // Top-Serien der Woche nach Score (eine Zeile pro Serie, nicht pro Episode).
  const bySeries = new Map<string, EpRow[]>()
  for (const r of rows) {
    if (!bySeries.has(r.anime.slug)) bySeries.set(r.anime.slug, [])
    bySeries.get(r.anime.slug)!.push(r)
  }
  const series = [...bySeries.values()].sort((a, b) => score(b[0].anime) - score(a[0].anime) || pop(b[0].anime) - pop(a[0].anime))
  const top = series.slice(0, 8)

  const lines = top.map((list) => {
    const a = list[0].anime
    const eps = list.map((r) => Number(r.ep.number)).sort((x, y) => x - y)
    const epStr = eps.length > 1 ? `${eps[0]}–${eps[eps.length - 1]}` : `${eps[0]}`
    const plat = platformNames(a)
    return `| [[anime:${a.slug}|${cell(displayTitle(a))}]] | ${epStr} | ${score(a) ? `${score(a)}/100` : '—'} | ${
      plat.length ? cell(plat[0]) : '—'
    } |`
  })

  await createArticle(payload, authorId, {
    slug: `simulcast-rueckblick-kw${week}-${year}`,
    category: 'simulcast',
    coverImageUrl: bestBanner(rows),
    relatedAnime: top.map((l) => l[0].anime.id),
    valid: validFor(rows),
    fallbackTitle: `Simulcast-Rückblick KW ${week}: Das lief diese Woche`,
    prompt: [
      `Schreibe das Intro (2–3 Absätze, 120–180 Wörter) für unseren wöchentlichen Simulcast-Rückblick (Kalenderwoche ${week}, ${year}).`,
      `Diese Woche liefen ${rows.length} neue Episoden von ${bySeries.size} Serien.`,
      `Die Top-Serien der Woche (2–3 Bausteine wörtlich einbauen):`,
      ...top.slice(0, 4).map((l) => `- [[anime:${l[0].anime.slug}|${displayTitle(l[0].anime)}]] (Score ${score(l[0].anime) || '–'})`),
      `Verweise auf den [[page:kalender|Simulcast-Kalender]] für die kommende Woche.`,
      `headline: Rückblick-Charakter, Bezug auf "KW ${week}" oder "diese Woche".`,
    ].join('\n'),
    appendix: [`## Die Highlights der Woche`, '', '| Anime | Episoden | Score | Plattform |', '|---|---|---|---|', ...lines].join('\n'),
  })
}

// ---------------------------------------------------------------------------
// Modus: --genre-spotlight  (rotierendes Genre-Ranking)
// ---------------------------------------------------------------------------
async function runGenreSpotlight(payload: Payload, authorId: any, ymd: string): Promise<void> {
  const genresRes = await payload.find({ collection: 'genres', limit: 100, sort: 'name', depth: 0 })
  const genres = (genresRes.docs as any[]).filter((g) => g.slug && g.slug !== 'hentai')
  if (!genres.length) return

  const { week, year } = isoWeek(ymd)
  // Rotation: pro KW das nächste Genre; Dedup pro Genre+Jahr.
  const g = genres[(week - 1) % genres.length]
  const slug = `spotlight-${g.slug}-${year}`
  console.log(`→ Genre-Spotlight KW ${week}: ${g.name}`)

  const res = await payload.find({
    collection: 'anime',
    where: {
      and: [{ genres: { in: [g.id] } }, { isHentai: { not_equals: true } }, { averageScore: { greater_than_equal: 60 } }],
    },
    sort: '-averageScore',
    limit: 10,
    depth: 0,
  })
  const top = res.docs as any[]
  if (top.length < 5) {
    console.log(`[=] zu wenig Titel für ${g.name} (${top.length}) — übersprungen`)
    return
  }

  const lines = top.map(
    (a, i) =>
      `| ${i + 1} | [[anime:${a.slug}|${cell(displayTitle(a))}]] | ${a.seasonYear || '—'} | ${
        a.averageScore ? `${a.averageScore}/100` : '—'
      } |`,
  )

  await createArticle(payload, authorId, {
    slug,
    category: 'ranking',
    coverImageUrl: animeBanner(top[0]) || undefined,
    relatedAnime: top.map((a) => a.id),
    valid: {
      anime: new Set(top.map((a) => a.slug)),
      genre: new Set([g.slug]),
      studio: new Set(),
      tag: new Set(),
      page: PAGES,
    },
    fallbackTitle: `Die besten ${g.name}-Anime: unsere Top 10`,
    prompt: [
      `Schreibe das Intro (2–3 Absätze, 120–180 Wörter) für unser Genre-Ranking „Die besten ${g.name}-Anime".`,
      `Genre-Baustein (wörtlich einbauen): [[genre:${g.slug}|${g.name}]]`,
      `Die Top 3 (Bausteine wörtlich einbauen):`,
      ...top.slice(0, 3).map((a, i) => `- Platz ${i + 1}: [[anime:${a.slug}|${displayTitle(a)}]] (Score ${a.averageScore}/100)`),
      `Erkläre kurz, was das Genre ausmacht, und verweise auf [[page:top-anime|alle Top-Anime]].`,
      `headline: Muss "${g.name}" und einen Ranking-Bezug ("Die besten …", "Top 10") enthalten.`,
    ].join('\n'),
    appendix: [`## Die Top 10 ${g.name}-Anime nach Community-Score`, '', '| Platz | Anime | Jahr | Score |', '|---|---|---|---|', ...lines].join('\n'),
  })
}

// ---------------------------------------------------------------------------
// Modus: --tag-spotlight  (zufälliges Tag-Ranking, läuft dauerhaft)
// ---------------------------------------------------------------------------
// Das Genre-Spotlight ist nach 19 Wochen durch (19 Live-Genres, Stand 11/2026
// alle veröffentlicht). Tags gibt es ein Vielfaches davon, deshalb läuft dieses
// Format in Schleife: gewählt wird per Zufall unter allen Tags, die genug gute
// Titel haben. Es muss nicht jeder Tag drankommen.
// Der Slug enthält das Jahr — ein Tag kommt also höchstens einmal pro Jahr dran,
// sonst stünde zweimal fast dieselbe Liste im Index (Duplicate Content).
//
// `rank` ist der AniList-Rang: Anteil der Stimmen, die bestätigen, dass der Tag
// auf den Titel zutrifft. Ist er niedrig, ist der Tag eine Randnotiz und der Titel
// gehört nicht in eine Liste, die genau damit überschrieben ist. 60 war messbar zu
// locker: die Liste zu „Teacher" begann mit drei Titeln bei 60–62 %, GTO mit 96 %
// stand erst auf Platz 4. Bei 65 kostet es fast nichts — 277 statt 296 Tags bleiben
// Kandidaten (13.11.2026) —, die Listen treffen aber ihr eigenes Thema.
const TAG_RANG_MIN = 65
const TAG_SCORE_MIN = 65
const TAG_MIN_TITEL = 8
// Nur vollwertige Werke. SPECIAL/TV_SHORT/MUSIC haben oft hohe Scores von wenigen
// treuen Stimmen und vertreten dann eine ganze Reihe: „ONE PIECE FAN LETTER"
// (SPECIAL, 90/100) stand fuer One Piece, ein AoT-Special fuer Attack on Titan.
// OVA bleibt drin — Hellsing Ultimate ist eine.
const TAG_FORMATE = ['TV', 'MOVIE', 'ONA', 'OVA']

// Tags, die keine Empfehlungsliste tragen. Alle Slugs am 13.11.2026 gegen die
// Kandidatenliste geprüft — ein Tippfehler hier fällt sonst nie auf, der Tag wird
// irgendwann einfach gezogen.
//   Besetzungs-Metadaten: sagen nichts über den Inhalt. „Male Protagonist" trifft
//   2.043 Titel, „Ensemble Cast" 988 — daraus wird keine Liste, die etwas behauptet.
//   Heikle Themen: nicht wegen der Titel, sondern wegen der Verpackung. „Die besten
//   Anime mit Suizid" ist eine Schlagzeile, die wir nicht setzen, und AdSense stuft
//   solche Seiten als heikel ein (schlechtere Anzeigen bis gar keine). Die
//   sexuellen Tags (rape, incest, prostitution …) sind bereits über `is_adult`
//   draußen — 68 Tags sind so markiert; diese acht sind es nicht.
// Krieg, Terrorismus, Mobbing, Mafia und Klassenkampf bleiben drin: sie benennen
// einen Konflikt, keine Tat, die eine Bestenliste zu feiern scheint.
const TAG_SPERRE = new Set<string>([
  'ensemble-cast', 'male-protagonist', 'female-protagonist', 'primarily-adult-cast',
  'primarily-child-cast', 'primarily-female-cast', 'primarily-male-cast', 'primarily-teen-cast',
  'heterosexual',
  'suicide', 'gore', 'torture', 'cannibalism', 'nudity', 'psychosexual', 'drugs', 'slavery',
])

type TagKand = { id: number; slug: string; name: string; beschreibung: string | null; n: number }
type TagRow = { id: number; slug: string; t: string; score: number | null; jahr: number | null; banner: string | null; rang: number | null }

// Franchise-Zusammenfassung: pro Reihe nur der stärkste Titel. Ohne das bestand
// die „Top 10" zu Vampire aus sechs Monogatari-Teilen, die zu Isekai aus drei
// Re:Zero- und zwei Mushoku-Tensei-Staffeln (gemessen am 13.11.2026) — eine
// Liste, die zehnmal dasselbe empfiehlt, ist keine Empfehlung.
// Verbunden wird über die AniList-Relationen; OTHER und ADAPTATION bleiben
// draußen, weil sie auch Manga-Vorlagen und lose Bezüge verknüpfen.
const REIHEN_BANDE = ['SEQUEL', 'PREQUEL', 'PARENT', 'SIDE_STORY', 'ALTERNATIVE', 'SPIN_OFF']

async function einProReihe(pool: any, rows: TagRow[], max: number): Promise<TagRow[]> {
  const ids = rows.map((r) => r.id)
  const kanten = (
    await pool.query(
      `SELECT _parent_id AS a, anime_id AS b FROM anime_relations
        WHERE relation_type::text = ANY($2::text[])
          AND (_parent_id = ANY($1::int[]) OR anime_id = ANY($1::int[]))`,
      [ids, REIHEN_BANDE],
    )
  ).rows as { a: number; b: number }[]

  // Auch Kanten mit nur EINER Seite im Kandidatensatz, sonst reisst die Kette an
  // Teilen, die den Tag selbst nicht tragen: „Attack on Titan Final Season" und
  // „… THE FINAL CHAPTERS Special" haengen nur ueber „Part 2" zusammen, und Part 2
  // hat den Tag „Time Skip" nicht — beide standen dadurch in der Liste.
  const wurzel = new Map<number, number>()
  const hole = (x: number): number => {
    if (!wurzel.has(x)) wurzel.set(x, x)
    return x
  }
  for (const i of ids) hole(i)
  const finde = (x: number): number => {
    let r = hole(x)
    while (wurzel.get(r) !== r) r = wurzel.get(r)!
    return r
  }
  for (const k of kanten) {
    const [ra, rb] = [finde(k.a), finde(k.b)]
    if (ra !== rb) wurzel.set(rb, ra)
  }

  const gesehen = new Set<number>()
  const out: TagRow[] = []
  for (const r of rows) {
    // rows kommen nach Score sortiert — der erste Treffer einer Reihe ist ihr bester.
    const w = finde(r.id)
    if (gesehen.has(w)) continue
    gesehen.add(w)
    out.push(r)
    if (out.length >= max) break
  }
  return out
}

/** Fisher-Yates — `sort(() => Math.random() - 0.5)` ist nachweislich schief. */
function mischen<T>(xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function runTagSpotlight(payload: Payload, authorId: any, ymd: string): Promise<void> {
  const jahr = Number(ymd.slice(0, 4))
  const pool = (payload.db as any).pool

  const kand: TagKand[] = (
    await pool.query(
      `SELECT t.id, t.slug, t.name, t.description_de AS beschreibung, count(*)::int AS n
         FROM anime_tags ta
         JOIN tags t ON t.id = ta.tag_id
         JOIN anime a ON a.id = ta._parent_id
        WHERE ta."rank" >= $1 AND t.is_adult IS NOT TRUE
          AND a.is_hentai IS NOT TRUE AND a.average_score >= $2
          AND a.format::text = ANY($4::text[])
        GROUP BY t.id, t.slug, t.name, t.description_de
       HAVING count(*) >= $3`,
      [TAG_RANG_MIN, TAG_SCORE_MIN, TAG_MIN_TITEL, TAG_FORMATE],
    )
  ).rows.filter((k: TagKand) => k.slug && !TAG_SPERRE.has(k.slug))

  // Schon dagewesen? Ein Artikel im laufenden Jahr sperrt den Tag.
  const gehabt = new Set<string>(
    (await pool.query(`SELECT slug FROM articles WHERE slug LIKE 'tag-spotlight-%'`)).rows.map((r: any) => r.slug),
  )
  const frei = kand.filter((k) => !gehabt.has(`tag-spotlight-${k.slug}-${jahr}`))

  const erzwungen = arg('tag')
  if (erzwungen && !kand.some((k) => k.slug === erzwungen)) {
    console.log(`[=] Tag "${erzwungen}" ist kein Kandidat (unbekannt, gesperrt oder zu wenig Titel)`)
    return
  }
  // Zufall statt Rotation: bei 280+ Kandidaten wäre eine feste Reihenfolge nur
  // Buchhaltung, und es muss nicht jeder Tag drankommen. Bis zu VERSUCHE Anläufe,
  // damit der Mittwochs-Lauf nicht leer ausgeht, wenn ein Tag nach der
  // Reihen-Zusammenfassung zu dünn wird.
  const reihe = erzwungen ? kand.filter((k) => k.slug === erzwungen) : mischen(frei)
  if (!reihe.length) {
    console.log(`[=] alle ${kand.length} Tag-Kandidaten hatten wir ${jahr} schon — übersprungen`)
    return
  }
  console.log(`→ Tag-Spotlight: ${frei.length} von ${kand.length} Tags noch frei in ${jahr}`)

  const VERSUCHE = 5
  for (const t of reihe.slice(0, erzwungen ? 1 : VERSUCHE)) {
    const roh: TagRow[] = (
      await pool.query(
        `SELECT a.id, a.slug, COALESCE(NULLIF(a.title_german,''), NULLIF(a.title_english,''), a.title_romaji) AS t,
                a.average_score AS score, a.season_year AS jahr, a.banner_image_local AS banner, ta."rank" AS rang
           FROM anime_tags ta JOIN anime a ON a.id = ta._parent_id
          WHERE ta.tag_id = $1 AND ta."rank" >= $2 AND a.is_hentai IS NOT TRUE AND a.average_score >= $3
            AND a.format::text = ANY($4::text[])
          ORDER BY a.average_score DESC NULLS LAST, a.popularity DESC NULLS LAST
          LIMIT 150`,
        [t.id, TAG_RANG_MIN, TAG_SCORE_MIN, TAG_FORMATE],
      )
    ).rows
    const rows = await einProReihe(pool, roh, 10)
    if (rows.length < TAG_MIN_TITEL) {
      console.log(`[=] ${t.name}: nur ${rows.length} eigenständige Reihen (von ${roh.length} Titeln) — nächster Tag`)
      continue
    }
    console.log(`→ ${t.name}: ${rows.length} Reihen aus ${t.n} Titeln über der Schwelle`)

    const seiten = new Map(PAGES)
    seiten.set('tag', '/tag')

    const lines = rows.map(
      (r, i) =>
        `| ${i + 1} | [[anime:${r.slug}|${cell(r.t)}]] | ${r.jahr || '—'} | ${r.score ? `${r.score}/100` : '—'} | ${
          r.rang != null ? `${r.rang} %` : '—'
        } |`,
    )

    await createArticle(payload, authorId, {
      slug: `tag-spotlight-${t.slug}-${jahr}`,
      category: 'ranking',
      coverImageUrl: rows[0].banner || undefined,
      relatedAnime: rows.map((r) => r.id),
      valid: { anime: new Set(rows.map((r) => r.slug)), genre: new Set(), studio: new Set(), tag: new Set([t.slug]), page: seiten },
      fallbackTitle: `Anime mit ${t.name}: unsere Top ${rows.length}`,
      prompt: [
        `Schreibe das Intro (2–3 Absätze, 120–180 Wörter) für unsere Liste der besten Anime zum Thema „${t.name}".`,
        `Tag-Baustein (wörtlich einbauen): [[tag:${t.slug}|${t.name}]]`,
        t.beschreibung
          ? `So beschreiben wir dieses Thema (halte dich daran, formuliere es um): ${t.beschreibung}`
          : `Es gibt keine Beschreibung des Themas. Erkläre in EINEM vorsichtigen Satz, was „${t.name}" bedeutet — nur das, was der Begriff selbst hergibt. Erfinde keine Definition.`,
        `In unserer Datenbank treffen ${t.n} Titel dieses Thema deutlich: mindestens ${TAG_RANG_MIN} % der Community-Stimmen bestätigen den Tag.`,
        `Die Liste nennt pro Reihe nur den besten Teil — erwähne das, wenn es sich anbietet.`,
        `Die Top 3 (Bausteine wörtlich einbauen):`,
        ...rows.slice(0, 3).map((r, i) => `- Platz ${i + 1}: [[anime:${r.slug}|${r.t}]] (Score ${r.score}/100${r.jahr ? `, ${r.jahr}` : ''})`),
        `Verweise darauf, dass die vollständige Liste unten steht, und auf [[page:tag|alle Themen-Tags]].`,
        `headline: Muss „${t.name}" und einen Ranking-Bezug enthalten ("Die besten …", "Top ${rows.length}"). Formuliere natürliches Deutsch um den englischen Tag-Namen herum, z. B. „Anime mit ${t.name}: die ${rows.length} besten".`,
      ].join('\n'),
      appendix: [
        `## Die Top ${rows.length}: Anime mit ${t.name}`,
        '',
        '| Platz | Anime | Jahr | Score | Tag-Treffer |',
        '|---|---|---|---|---|',
        ...lines,
        '',
        `Sortiert nach Community-Score, pro Reihe nur der beste Teil. „Tag-Treffer" ist der Anteil der Community-Stimmen, die bestätigen, dass „${t.name}" auf den Titel zutrifft — wir listen nur Titel ab ${TAG_RANG_MIN} %.`,
      ].join('\n'),
    })
    return
  }
  console.log(`[=] ${VERSUCHE} Tags in Folge zu dünn — diesmal kein Artikel`)
}

// ---------------------------------------------------------------------------
// Modus: --platform-new / --platform-leaving  (aus den Streaming-Offers)
// ---------------------------------------------------------------------------
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const LANG = (audio: string, subs: string) => {
  const a = (audio || '').split(','), su = (subs || '').split(',')
  if (a.includes('de')) return 'Deutscher Dub'
  if (su.includes('de')) return 'Deutscher Sub'
  return 'Japanisch (OmU)'
}
const COST: Record<string, string> = { flatrate: 'Abo', ads: 'kostenlos (Werbung)', free: 'kostenlos' }

type OfferRow = { id: number; slug: string; t: string; score: number | null; banner: string | null; cover: string | null; audio: string; subs: string; monet: string; at: string | null }

async function offerRows(payload: Payload, providerSlug: string, cond: string): Promise<OfferRow[]> {
  const res = await (payload.db as any).pool.query(
    `SELECT a.id, a.slug, COALESCE(NULLIF(a.title_german,''), NULLIF(a.title_english,''), a.title_romaji) AS t,
            a.average_score AS score, a.banner_image_local AS banner, a.cover_image_local AS cover,
            o.audio, o.subs, o.monetization AS monet, ${cond.includes('available_to') ? 'o.available_to' : 'o.first_seen_at'} AS at
     FROM anime_streaming_offers o JOIN anime a ON a.id = o._parent_id
     WHERE o.provider = $1 AND o.monetization IN ('flatrate','ads','free') AND a.is_hentai IS NOT TRUE AND ${cond}
     ORDER BY a.popularity DESC NULLS LAST LIMIT 40`,
    [providerSlug],
  )
  // je Anime nur ein Angebot (bestes = erstes)
  const seen = new Set<number>()
  return (res.rows as OfferRow[]).filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
}

const platformPages = (): Map<string, string> => {
  const m = new Map(PAGES)
  for (const s of DE_PROVIDER_SLUGS) m.set(`plattform-${s}`, `/plattform/${s}`)
  return m
}

// „Neu auf <Anbieter>" ist nicht dasselbe wie „von uns neu gefunden". Die
// rollierende JustWatch-Auffrischung stempelt `first_seen_at` auch dann, wenn der
// Matcher einen Katalogtitel zum ersten Mal überhaupt zuordnet — bei einem Lauf
// über 11k Titel sind das viele. Ungefiltert käme für Crunchyroll heraus:
// „300 Neuzugänge in 30 Tagen", darunter 24 Titel aus 2017. Das wäre schlicht
// falsch. Als echter Neuzugang gilt deshalb nur eine von zwei Lagen:
//   a) Der Titel stand bereits mit einem anderen Angebot im Index (dessen
//      `first_seen_at` ist NULL, also „seit Beginn bekannt") und hat diesen
//      Anbieter dazubekommen.
//   b) Der Titel läuft gerade (RELEASING) — dann ist es eine frische
//      Simulcast-Lizenz und das Datum stimmt.
// Alles andere ist ein Matcher-Fund und sagt nichts über den Katalog aus.
// Wirkung: Crunchyroll 300 → 48, und die Zahl im Artikel hält einer Prüfung stand.
// Kaltstart-Sperre. `first_seen_at` gibt es erst seit dem 26.10.2026, und die
// rollierende Auffrischung braucht für einen vollen Durchlauf über den Katalog
// rund zwölf Tage (900 Titel/Tag bei 11.061 Titeln). Beim ERSTEN Durchlauf nach
// der Feldeinführung wird deshalb jedes Angebot gestempelt, das vorher nicht
// erfasst war — also praktisch alle. Messung vom 07.11.2026: von 578 gestempelten
// Angeboten war genau EINES durch eine zweite Prüfung bestätigt; „Neu auf Prime
// Video" hätte Attack on Titan und Demon Slayer gelistet. Erst ab dem zweiten
// Durchlauf ist ein Stempel ein echter Unterschied zu einem bekannten Stand.
// Der erste Durchlauf war am 08.11.2026 durch (96,3 % am 07.11.).
// Ab Mitte Dezember ist diese Grenze wirkungslos, weil das 30-Tage-Fenster
// ohnehin dahinter liegt — dann kann die Zeile raus.
const NEU_AB = '2026-11-09'

const ECHT_NEU =
  "(EXISTS (SELECT 1 FROM anime_streaming_offers x WHERE x._parent_id = o._parent_id AND x.first_seen_at IS NULL)" +
  " OR a.status = 'RELEASING')"

// JustWatch meldet Lizenzenden Wochen im Voraus, aber fast nie innerhalb von 30
// Tagen: In diesem Fenster lagen über ALLE Anbieter zusammen 9 Angebote, pro
// Anbieter also keines über der Mindestgröße — das Format hat seit seiner Einführung
// keinen einzigen Artikel erzeugt. Bei 60 Tagen sind es Aniverse 25 und Prime Video
// 10. Der Zeitraum war vorher 30 Tage (16e05bd); 60 ist der kleinste Wert, mit dem
// das Format überhaupt etwas zu sagen hat.
const VERLAESST_TAGE = 60

async function runPlatformNew(payload: Payload, authorId: any, ymd: string): Promise<void> {
  const [y, m] = ymd.split('-').map(Number)
  for (const ps of DE_PROVIDER_SLUGS) {
    const p = providerBySlug(ps)!
    const rows = await offerRows(payload, ps, `o.first_seen_at >= greatest(now() - interval '30 days', '${NEU_AB}'::timestamptz) AND ${ECHT_NEU}`)
    if (rows.length < 5) continue
    const slug = `neu-auf-${ps}-${y}-${String(m).padStart(2, '0')}`
    const lines = rows.map((r) => `| [[anime:${r.slug}|${cell(r.t)}]] | ${LANG(r.audio, r.subs)} | ${COST[r.monet] || r.monet} | ${r.score ? `${r.score}/100` : '—'} |`)
    await createArticle(payload, authorId, {
      slug,
      category: 'guide',
      coverImageUrl: rows[0].banner || undefined,
      relatedAnime: rows.map((r) => r.id),
      valid: { anime: new Set(rows.map((r) => r.slug)), genre: new Set(), studio: new Set(), tag: new Set(), page: platformPages() },
      fallbackTitle: `Neu auf ${p.name} im ${MONTHS[m - 1]} ${y}: ${rows.length} Anime`,
      prompt: [
        `Schreibe das Intro (2–3 Absätze, 120–180 Wörter) für unsere Liste „Neu auf ${p.name} im ${MONTHS[m - 1]} ${y}".`,
        `${rows.length} Anime sind in den letzten 30 Tagen neu in den ${p.name}-Katalog (Deutschland) gekommen.`,
        `Anbieter-Baustein (wörtlich einbauen): [[page:plattform-${ps}|${p.name}]]`,
        `Die drei beliebtesten Neuzugänge (Bausteine wörtlich einbauen):`,
        ...rows.slice(0, 3).map((r) => `- [[anime:${r.slug}|${r.t}]] (${LANG(r.audio, r.subs)}, ${COST[r.monet] || r.monet})`),
        `Verweise darauf, dass die komplette Liste unten steht und wir die Verfügbarkeit laufend prüfen.`,
        `headline: Muss "${p.name}" und "neu" enthalten, z. B. "Neu auf ${p.name}: …".`,
      ].join('\n'),
      appendix: [`## Alle Neuzugänge auf ${p.name} (letzte 30 Tage)`, '', '| Anime | Sprachfassung | Kosten | Score |', '|---|---|---|---|', ...lines].join('\n'),
    })
  }
}

async function runPlatformLeaving(payload: Payload, authorId: any, ymd: string): Promise<void> {
  const [y, m] = ymd.split('-').map(Number)
  for (const ps of DE_PROVIDER_SLUGS) {
    const p = providerBySlug(ps)!
    const rows = await offerRows(payload, ps, `o.available_to IS NOT NULL AND o.available_to BETWEEN now() AND now() + interval '${VERLAESST_TAGE} days'`)
    if (rows.length < 3) continue
    const slug = `verlaesst-${ps}-${y}-${String(m).padStart(2, '0')}`
    const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }) : '—')
    const lines = rows.map((r) => `| [[anime:${r.slug}|${cell(r.t)}]] | ${fmt(r.at)} | ${LANG(r.audio, r.subs)} | ${r.score ? `${r.score}/100` : '—'} |`)
    await createArticle(payload, authorId, {
      slug,
      category: 'guide',
      coverImageUrl: rows[0].banner || undefined,
      relatedAnime: rows.map((r) => r.id),
      valid: { anime: new Set(rows.map((r) => r.slug)), genre: new Set(), studio: new Set(), tag: new Set(), page: platformPages() },
      fallbackTitle: `Diese ${rows.length} Anime verlassen ${p.name} bald`,
      prompt: [
        `Schreibe das Intro (2–3 Absätze, 120–180 Wörter) für unsere Liste „Diese Anime verlassen ${p.name} bald" (Stand ${MONTHS[m - 1]} ${y}).`,
        `Bei ${rows.length} Anime läuft die Lizenz bei ${p.name} (Deutschland) in den nächsten ${VERLAESST_TAGE} Tagen aus — wer sie noch sehen will, sollte sich beeilen.`,
        `Anbieter-Baustein (wörtlich einbauen): [[page:plattform-${ps}|${p.name}]]`,
        `Die drei beliebtesten Titel mit Datum (Bausteine wörtlich einbauen):`,
        ...rows.slice(0, 3).map((r) => `- [[anime:${r.slug}|${r.t}]] (bis ${fmt(r.at)})`),
        `Verweise auf die vollständige Liste unten. Erfinde keine Gründe für den Lizenzablauf.`,
        `headline: Muss "${p.name}" und "verlassen" oder "verschwinden" enthalten.`,
      ].join('\n'),
      appendix: [`## Alle Titel, die ${p.name} in den nächsten ${VERLAESST_TAGE} Tagen verlassen`, '', '| Anime | verfügbar bis | Sprachfassung | Score |', '|---|---|---|---|', ...lines].join('\n'),
    })
  }
}

// ---------------------------------------------------------------------------
async function main() {
  const payload = await getPayload({ config })
  const authorId = await ensureAuthor(payload)
  const ymd = arg('date') || berlinYmd(new Date())

  if (process.argv.includes('--daily')) {
    // Abgeschafft: Tages-Digest und Einzel-Episoden-Meldungen erzeugten ~5 Artikel
    // pro Tag nach Schablone („Low value content" / Scaled Content). Ersetzt durch
    // den Wochenüberblick --weekly-preview (montags).
    console.log('→ --daily ist abgeschafft. Nutze --weekly-preview (montags) für den Wochenüberblick.')
  } else if (process.argv.includes('--weekly-preview')) await runWeeklyPreview(payload, authorId, ymd)
  else if (process.argv.includes('--weekly-recap')) await runWeeklyRecap(payload, authorId, ymd)
  else if (process.argv.includes('--genre-spotlight')) await runGenreSpotlight(payload, authorId, ymd)
  else if (process.argv.includes('--tag-spotlight')) await runTagSpotlight(payload, authorId, ymd)
  else if (process.argv.includes('--platform-new')) await runPlatformNew(payload, authorId, ymd)
  else if (process.argv.includes('--platform-leaving')) await runPlatformLeaving(payload, authorId, ymd)
  else {
    console.error(
      '✗ Modus fehlt: --weekly-preview | --weekly-recap | --genre-spotlight | --tag-spotlight | --platform-new | --platform-leaving',
    )
    process.exit(1)
  }

  console.log('✓ Fertig.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
