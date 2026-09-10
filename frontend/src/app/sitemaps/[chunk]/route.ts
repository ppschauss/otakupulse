import { getPayload } from 'payload'
import config from '@payload-config'
import {
  TYPES, PER, STATIC_PATHS, xmlEscape, resolveWhere,
  GENRE_PREFIX, TAG_ANIME_PREFIX, TAG_ANIME_WHERE, hasContentUpdatedAt,
} from '@/lib/sitemap'
import { url } from '@/lib/site'
import { animeIndexable } from '@/lib/anime'

export const dynamic = 'force-dynamic'

type Entry = { loc: string; lastmod?: string }

/**
 * <lastmod> aus der letzten INHALTLICHEN Änderung.
 *
 * `updatedAt` allein wäre unehrlich: der nächtliche Sync schreibt jeden laufenden
 * Anime und dessen Charaktere neu, auch wenn AniList nur den Popularitätszähler
 * bewegt hat. Google verlangt, dass lastmod echte Änderungen markiert — sonst
 * stuft es die Angabe site-weit als unzuverlässig ein und ignoriert sie.
 *
 * Fallback auf `updatedAt`, solange `contentUpdatedAt` noch nicht gesetzt ist
 * (Dokumente, die seit Einführung des Feldes nicht neu synchronisiert wurden).
 */
const lastmodOf = (d: any): string | undefined => {
  const raw = d?.contentUpdatedAt || d?.updatedAt
  return raw ? new Date(raw).toISOString() : undefined
}

// Anime-URLs einer where-Bedingung als Sitemap-Einträge rendern.
async function animeChunk(where: any, page: number): Promise<Entry[]> {
  const payload = await getPayload({ config })
  const res = await payload.find({
    collection: 'anime',
    where,
    sort: '-popularity',
    limit: PER,
    page,
    depth: 0,
    select: {
      slug: true, updatedAt: true, contentUpdatedAt: true,
      descriptionDe: true, format: true, noindex: true, streamingProviders: true, streamingOffers: true,
    } as any,
  })
  return (res.docs as any[])
    // Gleiche Indexregel wie die Haupt-Sitemap und der Seiten-noindex.
    .filter((d) => d.slug && animeIndexable(d))
    .map((d) => ({ loc: url(`/anime/${d.slug}`), lastmod: lastmodOf(d) }))
}

function render(entries: Entry[]): Response {
  const body = entries
    .map(
      (e) =>
        `  <url><loc>${xmlEscape(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`,
    )
    .join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } })
}

export async function GET(_req: Request, { params }: { params: Promise<{ chunk: string }> }) {
  const { chunk } = await params
  const id = chunk.replace(/\.xml$/, '')

  if (id === 'static') {
    return render(STATIC_PATHS.map((p) => ({ loc: url(p) })))
  }

  // Genre-Sitemap: Anime des Genres. ID = genre__<slug>__<page>
  if (id.startsWith(GENRE_PREFIX)) {
    const rest = id.slice(GENRE_PREFIX.length)
    const sep = rest.lastIndexOf('__')
    if (sep < 0) return render([])
    const slug = rest.slice(0, sep)
    const page = Number(rest.slice(sep + 2)) + 1
    if (!slug || !Number.isFinite(page)) return render([])
    const payload = await getPayload({ config })
    const g = await payload.find({ collection: 'genres', where: { slug: { equals: slug } }, limit: 1, depth: 0 })
    if (!g.docs.length) return render([])
    return render(await animeChunk({ genres: { in: [(g.docs[0] as any).id] } }, page))
  }

  // Kombinierte Tag-Sitemap: alle Anime mit ≥1 Tag. ID = tagsanime__<page>
  if (id.startsWith(TAG_ANIME_PREFIX)) {
    const page = Number(id.slice(TAG_ANIME_PREFIX.length)) + 1
    if (!Number.isFinite(page)) return render([])
    return render(await animeChunk(TAG_ANIME_WHERE, page))
  }

  const dash = id.lastIndexOf('-')
  const key = id.slice(0, dash)
  const page = Number(id.slice(dash + 1)) + 1
  const type = TYPES.find((t) => t.key === key)
  // Unbekannter Typ (z. B. die entfernten streamen-/aehnlich-Sitemaps) → 404,
  // damit die Search Console die Datei als verschwunden führt statt als leer.
  if (!type || !Number.isFinite(page)) return new Response('Not found', { status: 404 })

  const payload = await getPayload({ config })
  const res = await payload.find({
    collection: type.collection,
    where: resolveWhere(type.where),
    limit: PER,
    page,
    depth: 0,
    select: {
      slug: true,
      updatedAt: true,
      ...(hasContentUpdatedAt(type.collection) ? { contentUpdatedAt: true } : {}),
      ...(type.select || {}),
    },
  })

  const entries: Entry[] = res.docs
    // Thinness-Gate (z.B. Charaktere/Personen ohne substanziellen Text) → nicht in die Sitemap.
    .filter((d: any) => d.slug && (!type.keep || type.keep(d)))
    .map((d: any) => ({ loc: url(type.path(d.slug)), lastmod: lastmodOf(d) }))

  return render(entries)
}
