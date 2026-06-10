/**
 * Erzeugt pro (neuem) Anime einen Ankündigungs-/Simulcast-Artikel in der
 * articles-Collection. Steckbrief (Studio, Genres, Episoden, Release, Plattform,
 * Vorgänger-Staffel) wird DETERMINISTISCH aus den DB-Fakten gebaut; nur Headline,
 * Teaser und der Beschreibungs-Rewrite ("Otaku/Weeb-Style") kommen von Claude.
 *
 * Dedup: pro Anime existiert höchstens ein Artikel mit Slug `neu-<anime-slug>`.
 *
 * Voraussetzung: ANTHROPIC_API_KEY in der Umgebung.
 * Aufruf (im enrich-Container, der den Live-Code bind-mountet):
 *   npx tsx src/scripts/generate-anime-news.ts --recent 3            # neue Titel der letzten 3 Tage (Pipeline)
 *   npx tsx src/scripts/generate-anime-news.ts --season-current --limit 60   # Backfill laufende/angekündigte
 *   npx tsx src/scripts/generate-anime-news.ts --slug <anime-slug>   # gezielt ein Titel (Test)
 *   Flags: --draft (Entwurf statt veröffentlichen) · --dry (nur Vorschau) · --limit N
 */
import { getPayload, type Payload } from 'payload'
import config from '../payload.config'
import Anthropic from '@anthropic-ai/sdk'
import { slugify } from '../lib/anilist'
import { displayTitle, seasonLabel, formatLabel, animeBanner } from '../lib/anime'
import { providerBySlug } from '../lib/streaming'
import { toLexical, stripMarkers, stripHtml, type Valid } from '../lib/articleBody'

const MODEL = 'claude-sonnet-4-6'

const apiKey = process.env.ANTHROPIC_API_KEY
if (!apiKey) {
  console.error('✗ ANTHROPIC_API_KEY fehlt.')
  process.exit(1)
}
const anthropic = new Anthropic({ apiKey, maxRetries: 5 })

const SYSTEM =
  'Du bist Redakteur:in beim deutschsprachigen Anime-Magazin OtakuPulse und schreibst eine kurze ' +
  'Ankündigung/News zu EINEM Anime-Titel. Zielgruppe: Anime-Fans und Otakus. Schreibstil: energiegeladen, ' +
  'fan-nah, hypig, ABER lesbar und ehrlich ("Hype trifft Substanz"). Sprich die Leser:innen mit "du" an. ' +
  'Dosierter Community-Slang (Simulcast, Sakuga, Best Girl, Isekai, Cour, Sub/Dub, Hype …) ist erwünscht, aber ' +
  'nicht überladen oder cringe.\n\n' +
  'WICHTIG: Erfinde KEINE Fakten — keine erfundenen Plot-Twists, Cast, Termine oder Studios. Nutze nur die unten ' +
  'gelieferten Fakten und die Originalbeschreibung. Die Beschreibung sollst du im OtakuPulse-Stil NEU formulieren ' +
  '(nicht 1:1 kopieren), spoiler-arm und packend. Wenn ein Fakt fehlt, lass ihn weg statt zu raten.\n\n' +
  'Du bekommst FERTIGE Link-Bausteine [[anime:slug|Titel]] und [[studio:slug|Name]]. Baue den Titel-Baustein ' +
  'mindestens einmal wörtlich ein; das Studio gern ebenfalls. Erfinde NIEMALS eigene Slugs.\n\n' +
  'Formatierung des `body` (reiner Text mit Markern): Absätze durch Leerzeilen trennen; optional EINE ' +
  'Zwischenüberschrift als Zeile mit "## ". KEINE Aufzählung im body (der Steckbrief wird separat angehängt).\n\n' +
  'Antworte als JSON {headline, excerpt, body}. headline: packend & klickstark, MIT Titelname (ohne Marker). ' +
  'excerpt: 1–2 Sätze Teaser (max. ~160 Zeichen, ohne Marker). body: 120–250 Wörter, der Beschreibungs-Rewrite + ' +
  'Hype-Einordnung, mit dem [[anime:…]]-Baustein.'

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
    max_tokens: 1600,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
  } as any)
  const block = (res.content as any[]).find((b) => b.type === 'text')
  return JSON.parse(block.text)
}

const STATUS_LABEL: Record<string, string> = {
  RELEASING: 'Läuft aktuell (Simulcast)',
  NOT_YET_RELEASED: 'Angekündigt',
  FINISHED: 'Abgeschlossen',
  HIATUS: 'Pausiert',
  CANCELLED: 'Abgesagt',
}

const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

type Facts = {
  studioBlocks: string[] // [[studio:slug|Name]]
  studioSlugs: string[]
  genreBlocks: string[] // [[genre:slug|Name]]
  genreSlugs: string[]
  episodes: string
  formatStr: string
  release: string
  statusStr: string
  platforms: string[] // Namen
  prequel?: { id: any; slug: string; title: string }
  description: string
}

async function gatherFacts(payload: Payload, a: any): Promise<Facts> {
  const allStudios = (a.studios || []).filter((s: any) => s && typeof s === 'object')
  // Animationsstudios bevorzugen (sonst tauchen Lizenzgeber/Produzenten auf), max. 4.
  const animStudios = allStudios.filter((s: any) => s.isAnimationStudio)
  const studios = (animStudios.length ? animStudios : allStudios).slice(0, 4)
  const genres = (a.genres || []).filter((g: any) => g && typeof g === 'object')

  // Vorgänger-Staffel: Relation vom Typ PREQUEL.
  let prequel: { id: any; slug: string; title: string } | undefined
  const prequelRel = (a.relations || []).find((r: any) => r?.relationType === 'PREQUEL')
  if (prequelRel?.anime) {
    let p: any = prequelRel.anime
    if (typeof p !== 'object') {
      const found = await payload.findByID({ collection: 'anime', id: p, depth: 0 }).catch(() => null)
      p = found
    }
    if (p?.slug) prequel = { id: p.id, slug: p.slug, title: displayTitle(p) }
  }

  const platforms = (a.streamingProviders || [])
    .map((slug: string) => providerBySlug(slug)?.name)
    .filter(Boolean) as string[]

  const release =
    a.season && a.seasonYear ? `${seasonLabel(a.season)} ${a.seasonYear}` : a.seasonYear ? String(a.seasonYear) : 'noch offen'

  return {
    studioBlocks: studios.map((s: any) => `[[studio:${s.slug}|${s.name}]]`),
    studioSlugs: studios.map((s: any) => s.slug),
    genreBlocks: genres.map((g: any) => `[[genre:${g.slug}|${g.name}]]`),
    genreSlugs: genres.map((g: any) => g.slug),
    episodes: a.episodes ? String(a.episodes) : 'unbekannt',
    formatStr: formatLabel(a.format) || '—',
    release,
    statusStr: STATUS_LABEL[a.status] || a.status || '—',
    platforms,
    prequel,
    description: a.descriptionDe?.trim() || stripHtml(a.descriptionSource) || '',
  }
}

/** Deterministischer Steckbrief als Tabelle (wird an den KI-body angehängt). */
function steckbrief(a: any, f: Facts): string {
  const esc = (s: string) => s.replace(/\|/g, '∕')
  const titleBlock = `[[anime:${a.slug}|${esc(displayTitle(a))}]]`
  const rows: [string, string][] = [
    ['Titel', titleBlock],
    ['Studio', f.studioBlocks.length ? esc(f.studioBlocks.join(', ')) : 'unbekannt'],
    ['Genres', f.genreBlocks.length ? esc(f.genreBlocks.join(', ')) : 'unbekannt'],
    ['Episoden', f.episodes],
    ['Format', f.formatStr],
    ['Release', f.release],
    ['Status', f.statusStr],
    ['Plattform', f.platforms.length ? esc(f.platforms.join(', ')) : 'noch nicht bekannt'],
  ]
  if (f.prequel) rows.push(['Fortsetzung von', `[[anime:${f.prequel.slug}|${esc(f.prequel.title)}]]`])
  return ['## Steckbrief', '', ...rows.map(([k, v]) => `| **${k}** | ${v} |`)].join('\n')
}

function buildPrompt(a: any, f: Facts): string {
  const titleBlock = `[[anime:${a.slug}|${displayTitle(a)}]]`
  const parts = [
    `Schreibe eine kurze Ankündigung/News zu diesem Anime.`,
    ``,
    `Titel-Link-Baustein (wörtlich einbauen): ${titleBlock}`,
    f.studioBlocks.length ? `Studio-Link-Bausteine: ${f.studioBlocks.join(', ')}` : '',
    `Fakten: Status=${f.statusStr}; Release=${f.release}; Format=${f.formatStr}; Episoden=${f.episodes}` +
      (f.genreSlugs.length ? `; Genres=${f.genreSlugs.join(', ')}` : '') +
      (f.platforms.length ? `; Plattform=${f.platforms.join(', ')}` : '') +
      (f.prequel ? `; Vorgänger=${f.prequel.title}` : ''),
    ``,
    `Originalbeschreibung (im OtakuPulse-Stil NEU formulieren, NICHT kopieren, spoiler-arm):`,
    f.description || '(keine Beschreibung vorhanden — dann nur die Fakten hypig einordnen, nichts erfinden)',
    f.prequel ? `\nHinweis: Es ist eine Fortsetzung von "${f.prequel.title}" — sprich kurz an, dass es weitergeht.` : '',
  ]
  return parts.filter((p) => p !== '').join('\n')
}

async function main() {
  const payload = await getPayload({ config })
  const limit = arg('limit') ? Number(arg('limit')) : undefined
  const draft = process.argv.includes('--draft')
  const dry = process.argv.includes('--dry')
  const slugArg = arg('slug')
  const recent = arg('recent')

  // Kandidaten-Filter zusammenbauen.
  let where: any
  let sort = '-popularity'
  if (slugArg) {
    where = { slug: { equals: slugArg } }
  } else if (recent) {
    where = {
      and: [
        { status: { in: ['RELEASING', 'NOT_YET_RELEASED'] } },
        { createdAt: { greater_than: new Date(Date.now() - Number(recent) * 864e5).toISOString() } },
        // Hentai nie automatisch in News/RSS — nur manuell (per --slug).
        { isHentai: { not_equals: true } },
      ],
    }
    sort = '-createdAt'
  } else {
    // --season-current (Default): laufende + angekündigte Titel mit etwas Relevanz.
    where = {
      and: [
        { status: { in: ['RELEASING', 'NOT_YET_RELEASED'] } },
        { or: [{ popularity: { greater_than_equal: 2000 } }, { averageScore: { greater_than_equal: 60 } }] },
        // Hentai nie automatisch in News/RSS — nur manuell (per --slug).
        { isHentai: { not_equals: true } },
      ],
    }
  }

  const res = await payload.find({ collection: 'anime', where, sort, limit: limit ?? 500, depth: 1 })
  console.log(`→ ${res.docs.length} Kandidaten (Modus: ${slugArg ? 'slug' : recent ? `recent ${recent}d` : 'season-current'})`)

  // Autor (Redaktion) sicherstellen.
  let authorId: any
  {
    const a = await payload.find({ collection: 'authors', where: { slug: { equals: 'otakupulse-redaktion' } }, limit: 1 })
    authorId = a.docs.length
      ? a.docs[0].id
      : (await payload.create({ collection: 'authors', data: { name: 'OtakuPulse Redaktion', slug: 'otakupulse-redaktion', role: 'editor' } as any })).id
  }

  let ok = 0
  let skip = 0
  let fail = 0
  for (const a of res.docs as any[]) {
    const articleSlug = `neu-${a.slug}`
    try {
      // Dedup: existiert schon ein Ankündigungs-Artikel?
      const exists = await payload.find({ collection: 'articles', where: { slug: { equals: articleSlug } }, limit: 1, depth: 0 })
      if (exists.docs.length) {
        skip++
        continue
      }

      const f = await gatherFacts(payload, a)
      const title = displayTitle(a)
      if (dry) {
        console.log(`\n— ${title} (${articleSlug}) —\n${steckbrief(a, f).replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1')}`)
        ok++
        continue
      }

      const art = await write(buildPrompt(a, f))
      const headline = stripMarkers(art.headline) || `Neu im Katalog: ${title}`
      const excerpt = stripMarkers(art.excerpt).slice(0, 200)

      // body (KI-Rewrite) + deterministischer Steckbrief
      const fullBody = `${art.body}\n\n${steckbrief(a, f)}`
      const valid: Valid = {
        anime: new Set([a.slug, ...(f.prequel ? [f.prequel.slug] : [])]),
        studio: new Set(f.studioSlugs),
        genre: new Set(f.genreSlugs),
        tag: new Set(),
      }
      const { root } = toLexical(fullBody, valid)
      const relatedAnime = [a.id, ...(f.prequel?.id ? [f.prequel.id] : [])]

      await payload.create({
        collection: 'articles',
        draft,
        data: {
          title: headline,
          slug: articleSlug,
          excerpt,
          category: 'news',
          coverImageUrl: animeBanner(a) || undefined,
          body: { root },
          author: authorId,
          relatedAnime,
          publishDate: new Date().toISOString(),
          _status: draft ? 'draft' : 'published',
        } as any,
      })
      ok++
      console.log(`[✓] ${headline}  → /news/${articleSlug}${draft ? ' (Entwurf)' : ''}`)
    } catch (err: any) {
      fail++
      console.warn(`[✗] ${a.slug}: ${err?.message || err}`)
    }
  }

  console.log(`\n✓ Fertig. Erstellt: ${ok} · Übersprungen (existiert): ${skip} · Fehler: ${fail}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
