/**
 * Generiert News-/Magazin-Artikel (Entwürfe) mit Claude Sonnet 4.6.
 * Stil: "Hype trifft Substanz" für Anime-Fans/Otakus, mit internen Querverweisen.
 *
 * Voraussetzung: ANTHROPIC_API_KEY in der Umgebung.
 * Aufruf:
 *   npm run news -- --limit 1          # 1 Test-Artikel
 *   npm run news                       # voller Mix (~60 Entwürfe)
 *   npm run news -- --genres --studios # nur bestimmte Typen
 */
import { getPayload, type Payload } from 'payload'
import config from '../payload.config'
import Anthropic from '@anthropic-ai/sdk'
import { slugify } from '../lib/anilist'
import { displayTitle, seasonLabel, animeBanner } from '../lib/anime'

const MODEL = 'claude-sonnet-4-6'

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('✗ ANTHROPIC_API_KEY fehlt.')
  process.exit(1)
}
const anthropic = new Anthropic({ apiKey, maxRetries: 5 })

const SYSTEM =
  'Du bist Redakteur:in beim deutschsprachigen Anime-Magazin OtakuPulse. Zielgruppe: Anime-Fans und Otakus. ' +
  'Schreibstil: energiegeladen, fan-nah und meinungsstark, ABER gut lesbar und faktenstark ("Hype trifft Substanz"). ' +
  'Sprich die Leser:innen mit "du" an. Dosierter Community-Slang (Sakuga, Simulcast, Best Girl, Power-Scaling, Cour, ' +
  'Sub/Dub, Isekai …) ist erwünscht, aber nicht überladen oder cringe. Erfinde KEINE Fakten und keine Titel.\n\n' +
  'Formatierung des `body`-Felds (reiner Text mit Markern):\n' +
  '- Absätze durch Leerzeilen trennen.\n' +
  '- Zwischenüberschriften als eigene Zeile mit "## " am Anfang.\n' +
  '- Aufzählungen als Zeilen mit "- " am Anfang.\n' +
  '- VERLINKUNG: Im Kontext bekommst du FERTIGE Link-Bausteine der Form [[anime:slug|Titel]] und [[studio:slug|Name]]. ' +
  'Baue exakt diese Bausteine WÖRTLICH in den Fließtext ein, wann immer du den jeweiligen Anime oder das Studio nennst ' +
  '(einfach den ganzen [[…]]-Block hineinkopieren). Erfinde NIEMALS eigene Slugs. Genres verlinkst du mit [[genre:slug|Name]] (Slugs siehe Liste).\n\n' +
  'PFLICHT: Verwende mindestens 4 der vorgegebenen [[anime:…]]-Bausteine (sofern genug im Kontext stehen) — schreibe nicht nur allgemein über das Thema.\n\n' +
  'Antworte als JSON {headline, excerpt, body}. headline: packend & klickstark. excerpt: 1–2 Sätze Teaser ' +
  '(max. ~160 Zeichen). body: 350–600 Wörter im obigen Format.'

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

async function write(user: string): Promise<{ headline: string; excerpt: string; body: string }> {
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2500,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  } as any)
  const block = (res.content as any[]).find((b) => b.type === 'text')
  return JSON.parse(block.text)
}

// --- Lexical-Aufbau ------------------------------------------------------

const PATH: Record<string, string> = { anime: 'anime', genre: 'genre', studio: 'studio', tag: 'tag' }

const textNode = (text: string) => ({ type: 'text', version: 1, text, format: 0, style: '', mode: 'normal', detail: 0 })
const linkNode = (url: string, label: string) => ({
  type: 'link',
  version: 3,
  fields: { linkType: 'custom', newTab: false, url },
  direction: 'ltr',
  format: '',
  indent: 0,
  children: [textNode(label)],
})

type Valid = { anime: Set<string>; genre: Set<string>; studio: Set<string>; tag: Set<string> }

function inline(text: string, valid: Valid, usedAnime: Set<string>, usedTag: Set<string>) {
  const re = /\[\[(\w+):([a-z0-9-]+)\|([^\]]+)\]\]/g
  const nodes: any[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(textNode(text.slice(last, m.index)))
    const [, type, slug, label] = m
    const known = (valid as any)[type] as Set<string> | undefined
    if (PATH[type] && known?.has(slug)) {
      nodes.push(linkNode(`/${PATH[type]}/${slug}`, label))
      if (type === 'anime') usedAnime.add(slug)
      if (type === 'tag') usedTag.add(slug)
    } else {
      nodes.push(textNode(label))
    }
    last = re.lastIndex
  }
  if (last < text.length) nodes.push(textNode(text.slice(last)))
  return nodes.length ? nodes : [textNode(text)]
}

// Wandelt [[typ:slug|Label]] → Label (für Titel/Teaser, die keine Links können).
function stripMarkers(s: string): string {
  return s.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[[^\]]*\]\]/g, '').trim()
}

function toLexical(body: string, valid: Valid, usedAnime: Set<string>, usedTag: Set<string>) {
  const children: any[] = []
  for (const raw of body.split(/\n\n+/)) {
    const block = raw.trim()
    if (!block) continue
    const lines = block.split('\n')
    if (block.startsWith('## ') || block.startsWith('# ')) {
      children.push({
        type: 'heading',
        tag: 'h2',
        version: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        children: inline(block.replace(/^#+\s*/, ''), valid, usedAnime, usedTag),
      })
    } else if (lines.every((l) => l.trim().startsWith('- '))) {
      children.push({
        type: 'list',
        listType: 'bullet',
        tag: 'ul',
        start: 1,
        version: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        children: lines.map((l, i) => ({
          type: 'listitem',
          version: 1,
          value: i + 1,
          direction: 'ltr',
          format: '',
          indent: 0,
          children: inline(l.trim().slice(2), valid, usedAnime, usedTag),
        })),
      })
    } else {
      children.push({
        type: 'paragraph',
        version: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        children: inline(block.replace(/\n/g, ' '), valid, usedAnime, usedTag),
      })
    }
  }
  return { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children } }
}

// Verlinkt Anime automatisch per Titel-Abgleich (Modell rät Slugs oft falsch).
// Setzt [[anime:slug|Titel]]-Marker bei der ersten Nennung jedes Kontext-Titels.
function autolinkAnime(body: string, animeDocs: any[]): string {
  const cands: { title: string; slug: string }[] = []
  for (const a of animeDocs) {
    const titles = Array.from(new Set([displayTitle(a), a.titleEnglish, a.titleRomaji, a.titleGerman].filter(Boolean)))
    for (const t of titles) cands.push({ title: t as string, slug: a.slug })
  }
  cands.sort((x, y) => y.title.length - x.title.length) // längste zuerst

  const store: string[] = []
  const protect = (m: string) => `@@A${store.push(m) - 1}@@`
  let s = body.replace(/\[\[[^\]]+\]\]/g, protect) // bestehende Marker schützen

  const used = new Set<string>()
  for (const c of cands) {
    if (c.title.length < 3 || used.has(c.slug)) continue
    const idx = s.indexOf(c.title)
    if (idx < 0) continue
    s = s.slice(0, idx) + protect(`[[anime:${c.slug}|${c.title}]]`) + s.slice(idx + c.title.length)
    used.add(c.slug)
  }
  return s.replace(/@@A(\d+)@@/g, (_, i) => store[Number(i)])
}

// --- Kontext / Jobs ------------------------------------------------------

type Job = { kind: string; category: string; task: string; where: any }

async function buildContext(payload: Payload, where: any, allGenreSlugs: Set<string>) {
  const res = await payload.find({
    collection: 'anime',
    where,
    sort: '-popularity',
    limit: 14,
    depth: 1,
    select: {
      slug: true,
      titleRomaji: true,
      titleEnglish: true,
      titleGerman: true,
      averageScore: true,
      coverImageLocal: true,
      coverImageUrl: true,
      bannerImageLocal: true,
      bannerImageUrl: true,
      genres: true,
      studios: true,
      tags: true,
    } as any,
  })
  const valid: Valid = { anime: new Set(), genre: new Set(allGenreSlugs), studio: new Set(), tag: new Set() }
  const animeById: Record<string, any> = {}
  const tagById: Record<string, any> = {}
  const lines: string[] = []
  for (const a of res.docs as any[]) {
    valid.anime.add(a.slug)
    animeById[a.slug] = a
    const studios = (a.studios || []).filter((s: any) => typeof s === 'object').map((s: any) => {
      valid.studio.add(s.slug)
      return `[[studio:${s.slug}|${s.name}]]`
    })
    const genres = (a.genres || []).filter((g: any) => typeof g === 'object').map((g: any) => g.slug)
    const tags = (a.tags || [])
      .map((t: any) => t?.tag)
      .filter((t: any) => t && typeof t === 'object')
      .slice(0, 4)
      .map((t: any) => {
        valid.tag.add(t.slug)
        tagById[t.slug] = t
        return `${t.slug}=${t.name}`
      })
    lines.push(
      `- [[anime:${a.slug}|${displayTitle(a)}]]${a.averageScore ? ` (${a.averageScore}%)` : ''}` +
        `${genres.length ? ` · Genres: ${genres.join(',')}` : ''}` +
        `${studios.length ? ` · Studios: ${studios.join(' ')}` : ''}` +
        `${tags.length ? ` · Tags: ${tags.join(',')}` : ''}`,
    )
  }
  return { valid, context: lines.join('\n'), animeById, tagById }
}

async function uniqueArticleSlug(payload: Payload, base: string): Promise<string | null> {
  let slug = base
  for (let i = 0; i < 5; i++) {
    const found = await payload.find({ collection: 'articles', where: { slug: { equals: slug } }, limit: 1, depth: 0 })
    if (!found.docs.length) return slug
    slug = `${base}-${i + 2}`
  }
  return null
}

async function main() {
  const args = process.argv.slice(2)
  const limArg = args.indexOf('--limit')
  const limit = limArg >= 0 ? Number(args[limArg + 1]) : undefined
  const onlyTypes = ['genres', 'studios', 'seasons', 'tags'].filter((t) => args.includes(`--${t}`))
  const want = (t: string) => onlyTypes.length === 0 || onlyTypes.includes(t)

  const payload = await getPayload({ config })

  let authorId: any
  {
    const a = await payload.find({ collection: 'authors', where: { slug: { equals: 'otakupulse-redaktion' } }, limit: 1 })
    authorId = a.docs.length
      ? a.docs[0].id
      : (await payload.create({ collection: 'authors', data: { name: 'OtakuPulse Redaktion', slug: 'otakupulse-redaktion', role: 'editor' } as any })).id
  }

  const allGenres = (await payload.find({ collection: 'genres', sort: 'name', limit: 100, depth: 0 })).docs as any[]
  const allGenreSlugs = new Set(allGenres.map((g) => g.slug))
  const GUIDE_GENRES = new Set(['action', 'adventure', 'comedy', 'drama', 'fantasy', 'romance', 'sci-fi', 'slice-of-life'])

  const jobs: Job[] = []
  if (want('genres')) {
    for (const g of allGenres) {
      if (g.slug === 'hentai') continue
      jobs.push({
        kind: `genre:${g.slug}`,
        category: 'ranking',
        where: { genres: { in: [g.id] } },
        task: `Schreibe ein Ranking/Guide "Die besten ${g.name}-Anime". Verlinke das Genre als [[genre:${g.slug}|${g.name}]] und stelle 5–8 der unten gelisteten Titel mit kurzer Begründung vor. Erwähne prägende Studios (verlinkt).`,
      })
      if (GUIDE_GENRES.has(g.slug)) {
        jobs.push({
          kind: `genre-guide:${g.slug}`,
          category: 'guide',
          where: { genres: { in: [g.id] } },
          task: `Schreibe einen Einsteiger-Guide "${g.name}-Anime für Anfänger:innen": Was macht [[genre:${g.slug}|${g.name}]] aus, welche 4–6 Titel sind perfekte Einstiege und warum?`,
        })
      }
    }
  }
  if (want('studios')) {
    const studios = (
      await payload.find({ collection: 'studios', where: { isAnimationStudio: { equals: true } }, sort: 'name', limit: 400, depth: 0 })
    ).docs as any[]
    for (const s of studios.slice(0, 18)) {
      jobs.push({
        kind: `studio:${s.slug}`,
        category: 'editorial',
        where: { studios: { in: [s.id] } },
        task: `Schreibe ein Studio-Spotlight über [[studio:${s.slug}|${s.name}]]: Stil/Stärken des Studios und seine 4–6 wichtigsten Werke. Nur Fakten aus dem Kontext.`,
      })
    }
  }
  if (want('seasons')) {
    const seasons = (await payload.find({ collection: 'anime-seasons', sort: '-year', limit: 40, depth: 0 })).docs as any[]
    for (const s of seasons.slice(0, 8)) {
      const label = `${seasonLabel(s.season)} ${s.year}`
      jobs.push({
        kind: `season:${s.slug}`,
        category: 'seasonal_preview',
        where: { animeSeason: { equals: s.id } },
        task: `Schreibe eine Season-Vorschau/Rückschau "Anime-Highlights ${label}": die spannendsten 5–7 Titel der Season, mit Hype-Faktor und Genre-Einordnung.`,
      })
    }
  }
  if (want('tags')) {
    const featured = (
      await payload.find({ collection: 'tags', where: { category: { equals: 'theme' } }, sort: 'name', limit: 300, depth: 0 })
    ).docs as any[]
    for (const t of featured.slice(0, 12)) {
      jobs.push({
        kind: `tag:${t.slug}`,
        category: 'guide',
        where: { 'tags.tag': { in: [t.id] } },
        task: `Schreibe eine Themen-Liste "Die besten Anime mit ${t.name}" ([[tag:${t.slug}|${t.name}]]): 5–7 Titel, die das Thema am besten umsetzen.`,
      })
    }
  }

  const todo = limit ? jobs.slice(0, limit) : jobs
  console.log(`→ ${todo.length} Artikel generieren (Modell ${MODEL})`)

  let ok = 0
  let fail = 0
  let skip = 0
  for (let i = 0; i < todo.length; i++) {
    const job = todo[i]
    try {
      const { valid, context, animeById, tagById } = await buildContext(payload, job.where, allGenreSlugs)
      if (valid.anime.size === 0) {
        skip++
        continue
      }
      const user = `${job.task}\n\nKontext — fertige Link-Bausteine (wörtlich in den Text einbauen):\n${context}\n\nErlaubte Genre-Slugs: ${[...allGenreSlugs].join(', ')}`
      const art = await write(user)
      const headline = stripMarkers(art.headline)
      const excerpt = stripMarkers(art.excerpt)

      const slug = await uniqueArticleSlug(payload, slugify(headline))
      if (!slug) {
        skip++
        continue
      }

      const usedAnime = new Set<string>()
      const usedTag = new Set<string>()
      const linkedBody = autolinkAnime(art.body, Object.values(animeById))
      const body = toLexical(linkedBody, valid, usedAnime, usedTag)
      const relatedAnime = [...usedAnime].map((s) => animeById[s]?.id).filter(Boolean)
      const tagIds = [...usedTag].map((s) => tagById[s]?.id).filter(Boolean)
      // Header-Bild: Banner/Cover des ersten erwähnten Anime mit Bild
      const coverDoc = [...usedAnime].map((s) => animeById[s]).find((a) => a && animeBanner(a))
      const coverImageUrl = coverDoc ? animeBanner(coverDoc) : undefined

      await payload.create({
        collection: 'articles',
        draft: true,
        data: {
          title: headline,
          slug,
          excerpt,
          category: job.category,
          coverImageUrl,
          body,
          author: authorId,
          relatedAnime,
          tags: tagIds,
          publishDate: new Date().toISOString(),
          _status: 'draft',
        } as any,
      })
      ok++
      console.log(`[${i + 1}/${todo.length}] ✓ ${art.headline}  (Anime-Links: ${relatedAnime.length})`)
    } catch (err: any) {
      fail++
      console.warn(`[${i + 1}/${todo.length}] ✗ ${job.kind}: ${err?.message || err}`)
    }
  }

  console.log(`✓ Fertig. Erstellt: ${ok} · Übersprungen: ${skip} · Fehler: ${fail} (alle als Entwurf)`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
