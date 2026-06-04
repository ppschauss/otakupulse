// Gemeinsame Logik für die (aufgeteilten) Sitemaps.
import { getPayload } from 'payload'
import config from '@payload-config'
import { PROVIDER_SLUGS } from './streaming'

export const PER = 5000

export type SitemapType = {
  key: string
  collection: any
  path: (slug: string) => string
  where?: any
}

export const TYPES: SitemapType[] = [
  { key: 'anime', collection: 'anime', path: (s) => `/anime/${s}` },
  { key: 'characters', collection: 'characters', path: (s) => `/character/${s}` },
  { key: 'persons', collection: 'persons', path: (s) => `/person/${s}` },
  { key: 'studios', collection: 'studios', path: (s) => `/studio/${s}` },
  { key: 'genres', collection: 'genres', path: (s) => `/genre/${s}` },
  { key: 'tags', collection: 'tags', path: (s) => `/tag/${s}` },
  { key: 'seasons', collection: 'anime-seasons', path: (s) => `/season/${s}` },
  { key: 'articles', collection: 'articles', path: (s) => `/news/${s}`, where: { _status: { equals: 'published' } } },
]

export const STATIC_PATHS = [
  '/', '/anime', '/genre', '/tag', '/studio', '/character', '/person',
  '/plattform', '/season', '/news', '/kalender', '/suche', '/top-anime',
  ...PROVIDER_SLUGS.map((s) => `/plattform/${s}`),
]

// Liste aller Chunk-IDs ('static', 'anime-0', 'characters-0', …) für den Index.
export async function listChunkIds(): Promise<string[]> {
  const payload = await getPayload({ config })
  const ids = ['static']
  for (const type of TYPES) {
    const res = await payload.find({ collection: type.collection, where: type.where, limit: 1, depth: 0 })
    const pages = Math.ceil((res.totalDocs || 0) / PER)
    for (let p = 0; p < pages; p++) ids.push(`${type.key}-${p}`)
  }
  return ids
}

export const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
