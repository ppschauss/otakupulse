// Gemeinsame Logik für die (aufgeteilten) Sitemaps.
import { getPayload } from 'payload'
import config from '@payload-config'
import { PROVIDER_SLUGS } from './streaming'
import { animeIndexable, liveArticleFilters, textTooThin } from './anime'

export const PER = 5000

export type SitemapType = {
  key: string
  collection: any
  path: (slug: string) => string
  /** Statisches Where ODER Thunk (für zeitabhängige Filter, pro Request ausgewertet). */
  where?: any | (() => any)
  /** Zusätzliche Felder, die der Chunk für das keep-Prädikat laden muss. */
  select?: Record<string, true>
  /** JS-seitiger Thinness-Filter — Payload-`where` kann keine Textlänge ausdrücken. */
  keep?: (doc: any) => boolean
}

export const resolveWhere = (w: SitemapType['where']) => (typeof w === 'function' ? w() : w)

// Collections mit `syncMetaFields` — nur die haben `contentUpdatedAt` (die Quelle
// für ein ehrliches <lastmod>). Genres/Tags/Seasons/Artikel werden redaktionell
// bzw. selten gepflegt; dort ist `updatedAt` bereits eine ehrliche Angabe.
const SYNCED_COLLECTIONS = new Set(['anime', 'characters', 'persons', 'studios', 'episodes'])
export const hasContentUpdatedAt = (collection: string) => SYNCED_COLLECTIONS.has(collection)

export const TYPES: SitemapType[] = [
  // Anime: Streaming-Daten ODER deutscher Text (animeIndexable) — identisch zum Seiten-noindex.
  {
    key: 'anime',
    collection: 'anime',
    path: (s) => `/anime/${s}`,
    select: { descriptionDe: true, format: true, noindex: true, streamingProviders: true, streamingOffers: true },
    keep: animeIndexable,
  },
  // Charaktere/Personen: nur mit substanziellem DEUTSCHEM Text in Index + Sitemap — der
  // englische AniList-Quelltext gilt nicht als Inhalt (Sprach-Mismatch auf einer de-Seite).
  // keep-Kriterium identisch zur noindex-Bedingung der jeweiligen Seite (via textTooThin).
  {
    key: 'characters',
    collection: 'characters',
    path: (s) => `/character/${s}`,
    select: { descriptionDe: true, noindex: true },
    keep: (d) => !d.noindex && !textTooThin(d.descriptionDe),
  },
  {
    key: 'persons',
    collection: 'persons',
    path: (s) => `/person/${s}`,
    select: { bioDe: true, noindex: true },
    keep: (d) => !d.noindex && !textTooThin(d.bioDe),
  },
  { key: 'studios', collection: 'studios', path: (s) => `/studio/${s}` },
  { key: 'genres', collection: 'genres', path: (s) => `/genre/${s}` },
  { key: 'tags', collection: 'tags', path: (s) => `/tag/${s}` },
  { key: 'seasons', collection: 'anime-seasons', path: (s) => `/season/${s}` },
  // Geplante Artikel (publishDate in der Zukunft) erst zum Termin in die Sitemap.
  { key: 'articles', collection: 'articles', path: (s) => `/news/${s}`, where: () => ({ and: liveArticleFilters() }) },
]

export const STATIC_PATHS = [
  '/', '/anime', '/genre', '/tag', '/studio', '/character', '/person',
  '/plattform', '/season', '/news', '/kalender', '/suche', '/top-anime',
  '/anime-discord-server', '/anime-telegram-kanal', '/nutzungsbedingungen',
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
