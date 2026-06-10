// Gemeinsame Logik für die (aufgeteilten) Sitemaps.
import { getPayload } from 'payload'
import config from '@payload-config'
import { PROVIDER_SLUGS } from './streaming'
import { liveArticleFilters } from './anime'

export const PER = 5000

export type SitemapType = {
  key: string
  collection: any
  path: (slug: string) => string
  /** Statisches Where ODER Thunk (für zeitabhängige Filter, pro Request ausgewertet). */
  where?: any | (() => any)
}

export const resolveWhere = (w: SitemapType['where']) => (typeof w === 'function' ? w() : w)

export const TYPES: SitemapType[] = [
  { key: 'anime', collection: 'anime', path: (s) => `/anime/${s}` },
  { key: 'characters', collection: 'characters', path: (s) => `/character/${s}` },
  { key: 'persons', collection: 'persons', path: (s) => `/person/${s}` },
  { key: 'studios', collection: 'studios', path: (s) => `/studio/${s}` },
  { key: 'genres', collection: 'genres', path: (s) => `/genre/${s}` },
  { key: 'tags', collection: 'tags', path: (s) => `/tag/${s}` },
  { key: 'seasons', collection: 'anime-seasons', path: (s) => `/season/${s}` },
  // Geplante Artikel (publishDate in der Zukunft) erst zum Termin in die Sitemap.
  { key: 'articles', collection: 'articles', path: (s) => `/news/${s}`, where: () => ({ and: liveArticleFilters() }) },
  // Intent-Seiten — nur inhaltsstarke (sonst noindex): Streaming nur mit Anbietern,
  // „ähnlich" nur mit Genre (Genre-Fallback liefert dann genug ähnliche Titel).
  { key: 'streamen', collection: 'anime', path: (s) => `/streamen/${s}`, where: { streamingProviders: { exists: true } } },
  { key: 'aehnlich', collection: 'anime', path: (s) => `/aehnlich/${s}`, where: { genres: { exists: true } } },
]

export const STATIC_PATHS = [
  '/', '/anime', '/genre', '/tag', '/studio', '/character', '/person',
  '/plattform', '/season', '/news', '/kalender', '/suche', '/top-anime',
  '/anime-discord-server',
  ...PROVIDER_SLUGS.map((s) => `/plattform/${s}`),
]

// Doppel-Unterstrich als Delimiter: Slugs enthalten nie '_' (slugify nutzt '-'),
// daher kollisionsfrei trennbar – auch bei Slugs mit Bindestrichen (slice-of-life).
export const GENRE_PREFIX = 'genre__' // genre__<slug>__<page> → Anime des Genres
export const TAG_ANIME_PREFIX = 'tagsanime__' // tagsanime__<page> → alle getaggten Anime
export const TAG_ANIME_WHERE = { 'tags.tag': { exists: true } } as any

// Liste aller Chunk-IDs für den Index – gestaffelt:
// static · <typ>-N (anime, characters, …) · genre__<slug>__N · tagsanime__N
export async function listChunkIds(): Promise<string[]> {
  const payload = await getPayload({ config })
  const ids = ['static']

  // 1) Bestehende Typen (anime, characters, persons, studios, genres, tags, seasons, articles)
  for (const type of TYPES) {
    const res = await payload.find({ collection: type.collection, where: resolveWhere(type.where), limit: 1, depth: 0 })
    const pages = Math.ceil((res.totalDocs || 0) / PER)
    for (let p = 0; p < pages; p++) ids.push(`${type.key}-${p}`)
  }

  // 2) Pro Genre eine Sitemap (Anime des Genres), alphabetisch, ggf. paginiert.
  const genres = await payload.find({ collection: 'genres', sort: 'slug', limit: 500, depth: 0, select: { slug: true } as any })
  for (const g of genres.docs as any[]) {
    if (!g.slug) continue
    const res = await payload.find({ collection: 'anime', where: { genres: { in: [g.id] } }, limit: 1, depth: 0 })
    const pages = Math.max(1, Math.ceil((res.totalDocs || 0) / PER))
    if (!res.totalDocs) continue
    for (let p = 0; p < pages; p++) ids.push(`${GENRE_PREFIX}${g.slug}__${p}`)
  }

  // 3) Kombinierte, deduplizierte Tag-Sitemap(s): alle Anime mit ≥1 Tag, je 5.000.
  const tagged = await payload.find({ collection: 'anime', where: TAG_ANIME_WHERE, limit: 1, depth: 0 })
  const tagPages = Math.ceil((tagged.totalDocs || 0) / PER)
  for (let p = 0; p < tagPages; p++) ids.push(`${TAG_ANIME_PREFIX}${p}`)

  return ids
}

export const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
