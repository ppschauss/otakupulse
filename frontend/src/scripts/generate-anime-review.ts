/**
 * Anime-Reviews (Kategorie `review`) zu Titeln der laufenden Season — mit
 * recherchierten Community-Meinungen (Foren/Reddit/MAL) als Grundlage, damit
 * die Wertung nicht aus der Luft gegriffen ist. Fakten (Steckbrief) kommen
 * deterministisch aus der DB; Claude schreibt Einordnung, Pro/Contra und Fazit.
 *
 * Geplante Veröffentlichung: `publishAt` liegt in der Zukunft → Artikel wird
 * mit zukünftigem publishDate als `published` angelegt und erscheint erst zum
 * Termin (öffentliche Queries filtern auf publishDate ≤ jetzt; Telegram-Cron
 * postet ebenfalls erst dann).
 *
 * Aufruf (im enrich-Container):
 *   npx tsx src/scripts/generate-anime-review.ts --plan reviews.json [--dry] [--draft] [--force]
 *
 * Plan-Datei (JSON-Array), publishAt in Europe/Berlin:
 *   [{ "anime": "<slug>", "publishAt": "2026-06-11T17:00", "notes": "STIMMUNG: …" }]
 */
import { readFileSync } from 'fs'
import { getPayload, type Payload } from 'payload'
import config from '../payload.config'
import Anthropic from '@anthropic-ai/sdk'
import { displayTitle, animeBanner } from '../lib/anime'
import { providerBySlug } from '../lib/streaming'
import { toLexical, stripMarkers, stripHtml, type Valid } from '../lib/articleBody'

const MODEL = 'claude-sonnet-4-6'

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('✗ ANTHROPIC_API_KEY fehlt.')
  process.exit(1)
}
const anthropic = new Anthropic({ apiKey, maxRetries: 5 })

const dry = process.argv.includes('--dry')
const draft = process.argv.includes('--draft')
const force = process.argv.includes('--force')

const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const SYSTEM =
  'Du bist Redakteur:in beim deutschsprachigen Anime-Magazin OtakuPulse und schreibst eine REVIEW (Zwischenfazit ' +
  'zur laufenden Season). Zielgruppe: Anime-Fans im deutschsprachigen Raum. Schreibstil: meinungsstark, fan-nah, ' +
  'ehrlich — Lob UND Kritik. Sprich die Leser:innen mit "du" an.\n\n' +
  'WICHTIG: Erfinde KEINE Fakten — keine Plot-Details, Episodeninhalte oder Termine, die nicht unten geliefert ' +
  'werden. Deine Einschätzung stützt sich auf die mitgelieferten RECHERCHE-NOTIZEN (Community-Stimmen aus Foren) ' +
  'und die Werksbeschreibung. Gib Community-Meinungen als solche wieder („in der Community", „viele Fans") und ' +
  'nicht als eigene Episoden-Erlebnisse.\n\n' +
  'Du bekommst FERTIGE Link-Bausteine wie [[anime:slug|Titel]], [[genre:slug|Name]], [[studio:slug|Name]] oder ' +
  '[[page:slug|Label]]. Baue die genannten Bausteine wörtlich ein. Erfinde NIEMALS eigene Slugs.\n\n' +
  'Formatierung des `body` (reiner Text mit Markern): 600–850 Wörter. Gliederung mit `## `-Zwischenüberschriften ' +
  '(z. B. „## Worum geht es?", „## Das sagt die Community", „## Für wen lohnt es sich?", „## Zwischenfazit"). ' +
  'Absätze durch Leerzeilen trennen. KEINE Tabellen, KEIN Markdown-Fett, keine Spoiler zu den letzten Episoden.\n\n' +
  'Antworte als JSON {headline, excerpt, body, pros, cons, rating}. headline: packend, enthält den Anime-Titel und ' +
  'Review-Bezug, ohne Marker. excerpt: 1–2 Sätze Teaser (max. ~160 Zeichen, ohne Marker). pros/cons: je 3–4 knappe ' +
  'Stichpunkte (ohne Marker), gestützt auf die Recherche. rating: Zahl 1–10 (eine Nachkommastelle erlaubt) — am ' +
  'Community-Gesamtbild orientieren, nicht davon abkoppeln.'

const SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    excerpt: { type: 'string' },
    body: { type: 'string' },
    pros: { type: 'array', items: { type: 'string' } },
    cons: { type: 'array', items: { type: 'string' } },
    rating: { type: 'number' },
  },
  required: ['headline', 'excerpt', 'body', 'pros', 'cons', 'rating'],
  additionalProperties: false,
}

type ReviewOut = { headline: string; excerpt: string; body: string; pros: string[]; cons: string[]; rating: number }

async function write(user: string): Promise<ReviewOut> {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  } as any)
  const block = (res.content as any[]).find((b) => b.type === 'text')
  return JSON.parse(block.text)
}

// --- Zeit: publishAt (Europe/Berlin, "YYYY-MM-DDTHH:mm") → UTC-Date ----------
const BERLIN = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
function berlinTime(local: string): Date {
  const want = local.replace('T', ', ').slice(0, 17) // "YYYY-MM-DD, HH:mm"
  for (const off of ['+02:00', '+01:00']) {
    const d = new Date(`${local}:00${off}`)
    if (BERLIN.format(d).replace(' ', ' ') === want) return d
  }
  return new Date(`${local}:00+01:00`)
}

const SEASON_DE: Record<string, string> = { WINTER: 'Winter', SPRING: 'Frühling', SUMMER: 'Sommer', FALL: 'Herbst' }
const cell = (s: string): string => s.replace(/\|/g, '∕')

const PAGES = new Map<string, string>([
  ['kalender', '/kalender'],
  ['anime', '/anime'],
  ['top-anime', '/top-anime'],
  ['plattform', '/plattform'],
  ['season', '/season'],
  ['news', '/news'],
])

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

type PlanItem = { anime: string; publishAt: string; notes: string }

async function reviewOne(payload: Payload, authorId: any, item: PlanItem): Promise<void> {
  const slug = `review-${item.anime}`
  const existing = await payload.find({ collection: 'articles', where: { slug: { equals: slug } }, limit: 1, depth: 0 })
  if (existing.docs.length && !force) {
    console.log(`[=] existiert: ${slug}`)
    return
  }

  const res = await payload.find({ collection: 'anime', where: { slug: { equals: item.anime } }, limit: 1, depth: 1 })
  const a = res.docs[0] as any
  if (!a) {
    console.warn(`[✗] Anime nicht gefunden: ${item.anime}`)
    return
  }
  if (a.isHentai === true) {
    console.warn(`[✗] übersprungen (Hentai): ${item.anime}`)
    return
  }

  const t = displayTitle(a)
  const genres = ((a.genres || []) as any[]).filter((g) => g && typeof g === 'object' && g.slug)
  // Nur echte Animationsstudios — keine Sender/Publisher (TOKYO MX, Aniplex, …).
  const studios = ((a.studios || []) as any[]).filter((s) => s && typeof s === 'object' && s.slug && s.isAnimationStudio !== false).slice(0, 2)
  const plat = ((a.streamingProviders || []) as string[]).map((s) => providerBySlug(s)?.name).filter(Boolean) as string[]
  const seasonLabel = a.season && a.seasonYear ? `${SEASON_DE[a.season] || a.season} ${a.seasonYear}` : ''
  const desc = stripHtml(a.descriptionDe || a.descriptionSource).slice(0, 1200)
  const publishDate = berlinTime(item.publishAt)

  const valid: Valid = {
    anime: new Set([a.slug]),
    genre: new Set(genres.map((g: any) => g.slug)),
    studio: new Set(studios.map((s: any) => s.slug)),
    tag: new Set(),
    page: PAGES,
  }

  const prompt = [
    `Schreibe eine Season-Review (Zwischenfazit zur laufenden Ausstrahlung) zu „${t}".`,
    `Anime-Baustein (wörtlich einbauen, mind. 2×): [[anime:${a.slug}|${t}]]`,
    genres.length ? `Genre-Bausteine (1–2 einbauen): ${genres.map((g: any) => `[[genre:${g.slug}|${g.name}]]`).join(', ')}` : '',
    studios.length ? `Studio-Baustein (einbauen): ${studios.map((s: any) => `[[studio:${s.slug}|${s.name}]]`).join(', ')}` : '',
    `Verweise am Ende auf den [[page:kalender|Simulcast-Kalender]] für die Sendetermine.`,
    '',
    `FAKTEN (nur diese verwenden):`,
    `- Titel: ${t}${a.titleRomaji && a.titleRomaji !== t ? ` (Originaltitel: ${a.titleRomaji})` : ''}`,
    seasonLabel ? `- Läuft seit der Season ${seasonLabel}` : '',
    a.episodes ? `- Geplante Episoden: ${a.episodes}` : '',
    studios.length ? `- Studio: ${studios.map((s: any) => s.name).join(', ')}` : '',
    plat.length ? `- Streaming: ${plat.join(', ')}` : '',
    a.averageScore ? `- Community-Score (AniList): ${a.averageScore}/100` : '',
    a.source ? `- Vorlage: ${a.source}` : '',
    '',
    `WORUM ES GEHT (neu formulieren, NICHT kopieren): ${desc || '(keine Beschreibung vorhanden)'}`,
    '',
    `RECHERCHE-NOTIZEN (Community-Stimmen aus Foren — deine Hauptquelle für Lob/Kritik):`,
    item.notes,
  ]
    .filter(Boolean)
    .join('\n')

  if (dry) {
    console.log(`\n— DRY ${slug} (publish ${publishDate.toISOString()}) —\n${prompt.slice(0, 800)}\n`)
    return
  }

  const r = await write(prompt)
  const headline = stripMarkers(r.headline) || `${t} im Review: Lohnt sich der Anime?`
  const excerpt = stripMarkers(r.excerpt).slice(0, 200)
  // Robust gegen Skalen-Ausreißer: 0–1 → ×10, 0–100 → ÷10, dann auf 1–10 klemmen.
  let raw = Number(r.rating)
  if (!Number.isFinite(raw)) raw = a.averageScore ? a.averageScore / 10 : 7
  if (raw > 0 && raw <= 1) raw *= 10
  else if (raw > 10) raw /= 10
  const rating = Math.min(10, Math.max(1, Math.round(raw * 10) / 10))

  // Deterministischer Anhang: Pro/Contra + Steckbrief + Wertung.
  const proConRows = Math.max(r.pros.length, r.cons.length)
  const proCon = [
    '## Pro & Contra',
    '',
    '| Pro | Contra |',
    '|---|---|',
    ...Array.from({ length: proConRows }, (_, i) => `| ${cell(stripMarkers(r.pros[i] || ''))} | ${cell(stripMarkers(r.cons[i] || ''))} |`),
  ].join('\n')

  const steckbrief = [
    '## Auf einen Blick',
    '',
    `| **Titel** | [[anime:${a.slug}|${cell(t)}]] |`,
    studios.length ? `| **Studio** | ${studios.map((s: any) => `[[studio:${s.slug}|${cell(s.name)}]]`).join(', ')} |` : '',
    genres.length ? `| **Genres** | ${genres.map((g: any) => `[[genre:${g.slug}|${cell(g.name)}]]`).join(', ')} |` : '',
    seasonLabel ? `| **Season** | ${seasonLabel} |` : '',
    a.episodes ? `| **Episoden** | ${a.episodes} |` : '',
    plat.length ? `| **Streaming** | ${cell(plat.join(', '))} |` : '',
    a.averageScore ? `| **Community-Score** | ${a.averageScore}/100 |` : '',
    `| **OtakuPulse-Wertung** | ${rating}/10 |`,
  ]
    .filter(Boolean)
    .join('\n')

  const { root } = toLexical(`${r.body}\n\n${proCon}\n\n${steckbrief}`, valid)

  const data = {
    title: headline,
    slug,
    excerpt,
    category: 'review',
    coverImageUrl: animeBanner(a) || undefined,
    body: { root },
    author: authorId,
    relatedAnime: [a.id],
    publishDate: publishDate.toISOString(),
    _status: draft ? 'draft' : 'published',
  } as any

  if (existing.docs.length) {
    await payload.update({ collection: 'articles', id: (existing.docs[0] as any).id, draft, data })
    console.log(`[✓] aktualisiert: ${headline} (${rating}/10) → /news/${slug} · live ab ${item.publishAt}`)
  } else {
    await payload.create({ collection: 'articles', draft, data })
    console.log(`[✓] ${headline} (${rating}/10) → /news/${slug} · live ab ${item.publishAt}${draft ? ' (Entwurf)' : ''}`)
  }
}

async function main() {
  const planPath = arg('plan')
  if (!planPath) {
    console.error('✗ --plan <datei.json> fehlt.')
    process.exit(1)
  }
  const plan: PlanItem[] = JSON.parse(readFileSync(planPath, 'utf8'))
  if (!Array.isArray(plan) || !plan.length) {
    console.error('✗ Plan ist leer oder kein Array.')
    process.exit(1)
  }

  const payload = await getPayload({ config })
  const authorId = await ensureAuthor(payload)
  console.log(`→ ${plan.length} Reviews geplant${dry ? ' (dry)' : ''}`)

  for (const item of plan) {
    try {
      await reviewOne(payload, authorId, item)
    } catch (err) {
      console.error(`[✗] ${item.anime}:`, err)
    }
  }

  console.log('✓ Fertig.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
