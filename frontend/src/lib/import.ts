/**
 * Import-Logik: mappt AniList-Daten auf das Payload-Schema und schreibt sie
 * idempotent (Upsert) in die DB. Wiederverwendbar von CLI-Skripten und – später –
 * von einem On-Demand-Fallback in einer Route.
 */
import type { Payload } from 'payload'
import { anilistRequest, slugify, MEDIA_QUERY, SEARCH_QUERY } from './anilist'

type Id = string | number

// --- kleine Mapper ------------------------------------------------------

function mapGender(g?: string | null): 'male' | 'female' | 'non_binary' | 'unknown' | undefined {
  if (!g) return undefined
  const s = g.toLowerCase()
  if (s.includes('female')) return 'female'
  if (s.includes('male')) return 'male'
  if (s.includes('non')) return 'non_binary'
  return 'unknown'
}

type PersonRole = 'voice_actor' | 'director' | 'writer' | 'mangaka' | 'illustrator' | 'composer' | 'producer' | 'other'

function mapOccupation(occ?: string | null): PersonRole | null {
  if (!occ) return null
  const s = occ.toLowerCase()
  if (s.includes('voice')) return 'voice_actor'
  if (s.includes('direct')) return 'director'
  if (s.includes('manga')) return 'mangaka'
  if (s.includes('illustrat')) return 'illustrator'
  if (s.includes('music') || s.includes('compos')) return 'composer'
  if (s.includes('produc')) return 'producer'
  if (s.includes('writ') || s.includes('script') || s.includes('screenplay') || s.includes('creator') || s.includes('story'))
    return 'writer'
  return 'other'
}

// AniList-Tag-Kategorie ("Theme-Action", "Setting-Time", "Demographic", …) → unser Enum.
export function mapTagCategory(cat?: string | null): string | undefined {
  if (!cat) return undefined
  const s = cat.toLowerCase()
  if (s.startsWith('theme')) return 'theme'
  if (s.startsWith('setting')) return 'setting'
  if (s.startsWith('demographic')) return 'demographic'
  return 'element'
}

// --- Inhaltliche Änderungen erkennen (für <lastmod>) --------------------
//
// Ziel: `contentUpdatedAt` darf sich NUR bewegen, wenn sich für einen Leser
// etwas geändert hat. Der Sync schreibt jeden laufenden Anime jede Nacht neu,
// meist nur weil AniList `popularity`/`averageScore`/`favourites` fortgeschrieben
// hat. Solche Ticks als „Seite geändert" an Google zu melden, entwertet die
// lastmod-Angabe für die gesamte Site.
//
// Bewusst als POSITIVLISTE: vergessen wir ein Feld, bleibt lastmod einmal zu alt
// (harmlos). Eine Negativliste würde bei jedem neuen Feld stillschweigend wieder
// Rauschen erzeugen. Die Daten selbst werden weiterhin IMMER geschrieben — diese
// Logik entscheidet ausschließlich über den Zeitstempel.

/** Felder von `anime`, die eine inhaltliche Änderung darstellen. */
const ANIME_CONTENT_FIELDS = [
  'titleRomaji', 'titleEnglish', 'titleNative',
  'format', 'status', 'episodes', 'duration', 'season', 'seasonYear',
  'source', 'countryOfOrigin', 'descriptionSource',
  'coverImageUrl', 'bannerImageUrl', 'trailerUrl',
  'genres', 'studios', 'isHentai', 'availableLanguages',
] as const

/** Felder von `characters`, die eine inhaltliche Änderung darstellen. */
const CHARACTER_CONTENT_FIELDS = [
  'nameRomaji', 'nameNative', 'imageUrl', 'descriptionSource', 'gender', 'age', 'bloodType',
] as const

/**
 * Vergleicht ein Feld robust gegen den DB-Stand.
 * Relationen kommen bei `depth: 0` als IDs zurück, unsere Import-Daten ebenfalls —
 * Arrays werden daher als sortierte ID-Listen verglichen (Reihenfolge aus der API
 * ist nicht stabil und wäre sonst eine Dauer-Falschmeldung).
 */
function sameValue(a: unknown, b: unknown): boolean {
  const norm = (v: unknown): string => {
    if (v === null || v === undefined) return ''
    if (Array.isArray(v)) {
      return v
        .map((x: any) => String(x && typeof x === 'object' ? (x.id ?? x.value ?? JSON.stringify(x)) : x))
        .sort()
        .join('|')
    }
    return String(v)
  }
  return norm(a) === norm(b)
}

/**
 * Liefert den `contentUpdatedAt`-Wert für ein Update: `now`, wenn sich eines der
 * gelisteten Felder geändert hat — sonst der bisherige Wert (bzw. `updatedAt` als
 * Startwert, solange das Feld noch nie gesetzt war).
 */
function nextContentUpdatedAt(
  existing: any,
  next: Record<string, any>,
  fields: readonly string[],
  now: string,
): string {
  const changed = fields.some((f) => !sameValue(existing?.[f], next[f]))
  if (changed) return now
  return existing?.contentUpdatedAt || existing?.updatedAt || now
}

/** Nur für Unit-Tests exportiert (die Helfer selbst bleiben modul-intern). */
export const __test = { sameValue, nextContentUpdatedAt, ANIME_CONTENT_FIELDS, CHARACTER_CONTENT_FIELDS }

const REL_TYPES = ['SEQUEL', 'PREQUEL', 'SIDE_STORY', 'ADAPTATION', 'ALTERNATIVE', 'SPIN_OFF', 'PARENT', 'OTHER']
function mapRelationType(t?: string | null): string {
  return t && REL_TYPES.includes(t) ? t : 'OTHER'
}

/**
 * Leitet die verfügbaren Sprachen aus AniLists Streaming-Links + Herkunft ab.
 * AniList trennt Sub/Dub nicht zuverlässig — ein "German"-Streaming-Link bedeutet
 * "auf Deutsch verfügbar" (wir mappen konservativ auf *-sub). Echter Dub wird
 * später manuell/aus anderer Quelle gepflegt. JP-Originale bekommen immer `ja`.
 */
export function deriveLanguages(m: any): string[] {
  const langs = new Set<string>()
  if (m.countryOfOrigin === 'JP') langs.add('ja')
  for (const link of m.externalLinks || []) {
    if (link?.type !== 'STREAMING' || !link.language) continue
    const l = String(link.language).toLowerCase()
    if (l.includes('german') || l.includes('deutsch')) langs.add('de-sub')
    else if (l.includes('english')) langs.add('en-sub')
    else if (l.includes('japanese')) langs.add('ja')
  }
  return [...langs]
}

/** AniList-externalLinks → unser {platform, url}-Array (nur mit URL). */
export function mapExternalLinks(m: any): { platform?: string; url: string }[] {
  return (m.externalLinks || [])
    .filter((l: any) => l?.url)
    .map((l: any) => ({ platform: l.site ?? undefined, url: l.url }))
}

function fuzzyToISO(d?: { year?: number | null; month?: number | null; day?: number | null } | null): string | undefined {
  if (!d?.year || !d.month || !d.day) return undefined
  const mm = String(d.month).padStart(2, '0')
  const dd = String(d.day).padStart(2, '0')
  return `${d.year}-${mm}-${dd}T00:00:00.000Z`
}

// Slugs sind unique. Da gleichnamige Charaktere/Personen/Studios häufig sind,
// hängen wir bei Kollision die (eindeutige) anilistId an, statt den Import abzubrechen.
async function uniqueSlug(payload: Payload, collection: any, base: string, anilistId: number): Promise<string> {
  const clash = await payload.find({
    collection,
    where: { and: [{ slug: { equals: base } }, { anilistId: { not_equals: anilistId } }] },
    limit: 1,
  })
  return clash.docs.length ? `${base}-${anilistId}` : base
}

// --- Upserts ------------------------------------------------------------

async function upsertGenre(payload: Payload, name: string): Promise<Id> {
  const slug = slugify(name)
  const found = await payload.find({ collection: 'genres', where: { slug: { equals: slug } }, limit: 1 })
  if (found.docs.length) return found.docs[0].id
  return (await payload.create({ collection: 'genres', data: { name, slug } })).id
}

async function upsertTag(payload: Payload, t: { name: string; isAdult?: boolean; category?: string | null }): Promise<Id> {
  const slug = slugify(t.name)
  const category = mapTagCategory(t.category)
  const found = await payload.find({ collection: 'tags', where: { slug: { equals: slug } }, limit: 1 })
  if (found.docs.length) {
    // Kategorie nachtragen, falls noch nicht gesetzt.
    if (category && !(found.docs[0] as any).category) {
      await payload.update({ collection: 'tags', id: found.docs[0].id, data: { category } as any })
    }
    return found.docs[0].id
  }
  return (await payload.create({ collection: 'tags', data: { name: t.name, slug, isAdult: !!t.isAdult, category } as any })).id
}

async function upsertStudio(payload: Payload, node: { id: number; name: string; isAnimationStudio: boolean }): Promise<Id> {
  const found = await payload.find({ collection: 'studios', where: { anilistId: { equals: node.id } }, limit: 1 })
  if (found.docs.length) return found.docs[0].id
  const slug = await uniqueSlug(payload, 'studios', slugify(node.name), node.id)
  return (
    await payload.create({
      collection: 'studios',
      data: { anilistId: node.id, name: node.name, slug, isAnimationStudio: node.isAnimationStudio },
    })
  ).id
}

async function upsertSeason(payload: Payload, season: string, year: number): Promise<Id> {
  const slug = `${season.toLowerCase()}-${year}`
  const found = await payload.find({ collection: 'anime-seasons', where: { slug: { equals: slug } }, limit: 1 })
  if (found.docs.length) return found.docs[0].id
  const name = `${season.charAt(0)}${season.slice(1).toLowerCase()} ${year}`
  return (await payload.create({ collection: 'anime-seasons', data: { name, slug, season, year } as any })).id
}

/** Person nach anilistId upserten; `addRole` wird in `roles` gemerged. */
async function upsertPerson(payload: Payload, node: any, addRole: PersonRole | null): Promise<Id> {
  const found = await payload.find({ collection: 'persons', where: { anilistId: { equals: node.id } }, limit: 1 })
  const occRoles = (node.primaryOccupations || []).map(mapOccupation).filter(Boolean) as PersonRole[]
  const wantRoles = new Set<PersonRole>([...occRoles, ...(addRole ? [addRole] : [])])

  if (found.docs.length) {
    const doc = found.docs[0] as any
    const merged = new Set<PersonRole>([...(doc.roles || []), ...wantRoles])
    // Nur aktualisieren, wenn neue Rollen hinzukommen (spart Writes & schützt Edits grob).
    if (merged.size !== (doc.roles || []).length) {
      await payload.update({ collection: 'persons', id: doc.id, data: { roles: [...merged] } })
    }
    return doc.id
  }

  const slug = await uniqueSlug(payload, 'persons', slugify(node.name?.full || String(node.id)), node.id)
  const data: any = {
    anilistId: node.id,
    slug,
    nameRomaji: node.name?.full || `Person ${node.id}`,
    nameNative: node.name?.native ?? undefined,
    imageUrl: node.image?.large ?? undefined,
    bioSource: node.description ?? undefined,
    gender: mapGender(node.gender),
    bloodType: node.bloodType ?? undefined,
    birthPlace: node.homeTown ?? undefined,
    birthDate: fuzzyToISO(node.dateOfBirth),
    deathDate: fuzzyToISO(node.dateOfDeath),
    favorites: node.favourites ?? undefined,
    roles: [...wantRoles],
    dataSource: 'anilist',
    lastSyncedAt: new Date().toISOString(),
  }
  return (await payload.create({ collection: 'persons', data })).id
}

/** Character nach anilistId upserten (inkl. Synchronsprecher). */
async function upsertCharacter(payload: Payload, edge: any): Promise<Id | null> {
  const node = edge.node
  if (!node?.id) return null

  // Synchronsprecher als Persons anlegen und Sprecher-Array bauen.
  const voiceActors: { person: Id; language?: string }[] = []
  for (const va of edge.voiceActors || []) {
    const personId = await upsertPerson(payload, va, 'voice_actor')
    voiceActors.push({ person: personId, language: va.languageV2 ?? undefined })
  }

  const slug = await uniqueSlug(payload, 'characters', slugify(node.name?.full || String(node.id)), node.id)
  const data: any = {
    anilistId: node.id,
    slug,
    nameRomaji: node.name?.full || `Character ${node.id}`,
    nameNative: node.name?.native ?? undefined,
    imageUrl: node.image?.large ?? undefined,
    descriptionSource: node.description ?? undefined,
    gender: mapGender(node.gender),
    age: node.age ?? undefined,
    bloodType: node.bloodType ?? undefined,
    birthday: node.dateOfBirth?.month
      ? { month: node.dateOfBirth.month, day: node.dateOfBirth.day ?? undefined }
      : undefined,
    favorites: node.favourites ?? undefined,
    voiceActors,
    dataSource: 'anilist',
    lastSyncedAt: new Date().toISOString(),
  }

  // depth: 0 — wir brauchen nur Skalare für den Inhaltsvergleich, keine
  // aufgelösten Relationen (spart bei ~2.000 Charakteren pro Sync-Nacht spürbar).
  const found = await payload.find({
    collection: 'characters',
    where: { anilistId: { equals: node.id } },
    limit: 1,
    depth: 0,
  })
  if (found.docs.length) {
    const doc = found.docs[0] as any
    data.contentUpdatedAt = nextContentUpdatedAt(doc, data, CHARACTER_CONTENT_FIELDS, data.lastSyncedAt)
    await payload.update({ collection: 'characters', id: doc.id, data })
    return doc.id
  }
  data.contentUpdatedAt = data.lastSyncedAt
  return (await payload.create({ collection: 'characters', data })).id
}

/** Episoden aus dem Airing-Schedule anlegen (Nummer + Ausstrahlungsdatum). */
async function importEpisodes(
  payload: Payload,
  animeId: Id,
  animeSlug: string,
  schedule: { episode: number; airingAt: number }[],
  streaming: { title?: string; thumbnail?: string }[],
  maxEpisodes: number,
): Promise<number> {
  let count = 0
  const nodes = [...schedule].sort((a, b) => a.episode - b.episode).slice(0, maxEpisodes)
  for (const ep of nodes) {
    if (!ep.episode) continue
    const slug = `${animeSlug}-episode-${ep.episode}`
    const stream = streaming[ep.episode - 1] // best effort: streamingEpisodes sind grob nach Nummer sortiert
    const data: any = {
      anime: animeId,
      number: ep.episode,
      slug,
      airDate: ep.airingAt ? new Date(ep.airingAt * 1000).toISOString() : undefined,
      titleEnglish: stream?.title ?? undefined,
      thumbnailUrl: stream?.thumbnail ?? undefined,
      dataSource: 'anilist',
      lastSyncedAt: new Date().toISOString(),
    }
    const found = await payload.find({ collection: 'episodes', where: { slug: { equals: slug } }, limit: 1 })
    if (found.docs.length) await payload.update({ collection: 'episodes', id: found.docs[0].id, data })
    else await payload.create({ collection: 'episodes', data })
    count++
  }
  return count
}

// --- Hauptfunktion ------------------------------------------------------

export type ImportResult = {
  animeId: Id
  anilistId: number
  slug: string
  title: string
  counts: { genres: number; studios: number; tags: number; characters: number; staff: number; episodes: number }
  relations: { relationType: string; id: number }[]
  recommendations: number[]
}

export type ImportOptions = {
  /** Episoden aus Airing-Schedule importieren (Default: false). */
  episodes?: boolean
  /** Obergrenze importierter Episoden pro Anime (Default: 200). */
  maxEpisodes?: number
  /** Relationen/Empfehlungen direkt verlinken (Default: true). Batch setzt false und linkt am Ende. */
  link?: boolean
}

/** Holt einen Anime von AniList und schreibt ihn samt Relationen in die DB. */
export async function importAnime(payload: Payload, anilistId: number, opts: ImportOptions = {}): Promise<ImportResult> {
  const data = await anilistRequest<{ Media: any }>(MEDIA_QUERY, { id: anilistId })
  const m = data.Media
  if (!m) throw new Error(`AniList: kein Media für ID ${anilistId}`)

  // Taxonomie / einfache Relationen
  const genreIds: Id[] = []
  for (const g of m.genres || []) genreIds.push(await upsertGenre(payload, g))

  const studioIds: Id[] = []
  for (const s of m.studios?.nodes || []) studioIds.push(await upsertStudio(payload, s))

  const tagEntries: { tag: Id; rank?: number }[] = []
  for (const t of m.tags || []) tagEntries.push({ tag: await upsertTag(payload, t), rank: t.rank ?? undefined })

  const seasonId = m.season && m.seasonYear ? await upsertSeason(payload, m.season, m.seasonYear) : undefined

  // Charaktere (inkl. Synchronsprecher) + Staff
  const characterEntries: { character: Id; role?: string }[] = []
  for (const edge of m.characters?.edges || []) {
    const charId = await upsertCharacter(payload, edge)
    if (charId) characterEntries.push({ character: charId, role: edge.role ?? undefined })
  }

  const staffEntries: { person: Id; role?: string }[] = []
  for (const edge of m.staff?.edges || []) {
    if (!edge.node?.id) continue
    const personId = await upsertPerson(payload, edge.node, mapOccupation(edge.role))
    staffEntries.push({ person: personId, role: edge.role ?? undefined })
  }

  const slug = await uniqueSlug(payload, 'anime', slugify(m.title.romaji || m.title.english || String(m.id)), m.id)
  const trailerUrl = m.trailer?.site === 'youtube' ? `https://www.youtube.com/watch?v=${m.trailer.id}` : undefined

  const animeData: any = {
    anilistId: m.id,
    malId: m.idMal ?? undefined,
    slug,
    titleRomaji: m.title.romaji,
    titleEnglish: m.title.english ?? undefined,
    titleNative: m.title.native ?? undefined,
    format: m.format ?? undefined,
    status: m.status ?? undefined,
    episodes: m.episodes ?? undefined,
    duration: m.duration ?? undefined,
    season: m.season ?? undefined,
    seasonYear: m.seasonYear ?? undefined,
    averageScore: m.averageScore ?? undefined,
    popularity: m.popularity ?? undefined,
    countryOfOrigin: m.countryOfOrigin ?? undefined,
    source: m.source ?? undefined,
    availableLanguages: deriveLanguages(m),
    externalLinks: mapExternalLinks(m),
    descriptionSource: m.description ?? undefined,
    coverImageUrl: m.coverImage?.extraLarge || m.coverImage?.large || undefined,
    bannerImageUrl: m.bannerImage ?? undefined,
    trailerUrl,
    genres: genreIds,
    isHentai: (m.genres || []).some((g: string) => String(g).toLowerCase() === 'hentai'),
    studios: studioIds,
    tags: tagEntries,
    characters: characterEntries,
    staff: staffEntries,
    animeSeason: seasonId,
    dataSource: 'anilist',
    lastSyncedAt: new Date().toISOString(),
  }

  // depth: 0 — Relationen als IDs, damit der Inhaltsvergleich (genres/studios)
  // gegen dieselbe Darstellung läuft wie unsere Import-Daten.
  const existing = await payload.find({
    collection: 'anime',
    where: { anilistId: { equals: m.id } },
    limit: 1,
    depth: 0,
  })
  let animeId: Id
  if (existing.docs.length) {
    animeId = existing.docs[0].id
    // availableLanguages mergen statt überschreiben: aus AniList kommt nur `ja`
    // (Sub/Dub kennt AniList nicht), echte Dub-Daten (Crunchyroll-Sync, manuell)
    // sollen einen Re-Import/Sync überleben.
    const prevLangs: string[] = Array.isArray((existing.docs[0] as any).availableLanguages)
      ? (existing.docs[0] as any).availableLanguages
      : []
    animeData.availableLanguages = [...new Set([...prevLangs, ...(animeData.availableLanguages || [])])]
    // Nach dem Sprach-Merge vergleichen, sonst meldet der Merge selbst eine Änderung.
    animeData.contentUpdatedAt = nextContentUpdatedAt(
      existing.docs[0],
      animeData,
      ANIME_CONTENT_FIELDS,
      animeData.lastSyncedAt,
    )
    await payload.update({ collection: 'anime', id: animeId, data: animeData })
  } else {
    animeData.contentUpdatedAt = animeData.lastSyncedAt
    animeId = (await payload.create({ collection: 'anime', data: animeData })).id
  }

  // Episoden (optional)
  let episodeCount = 0
  if (opts.episodes) {
    episodeCount = await importEpisodes(
      payload,
      animeId,
      slug,
      m.airingSchedule?.nodes || [],
      m.streamingEpisodes || [],
      opts.maxEpisodes ?? 200,
    )
  }

  const relations = (m.relations?.edges || [])
    .filter((e: any) => e.node?.type === 'ANIME' && e.node.id)
    .map((e: any) => ({ relationType: mapRelationType(e.relationType), id: e.node.id }))

  const recommendations = (m.recommendations?.nodes || [])
    .map((n: any) => n.mediaRecommendation)
    .filter((r: any) => r?.type === 'ANIME' && r.id)
    .map((r: any) => r.id as number)

  const result: ImportResult = {
    animeId,
    anilistId: m.id,
    slug,
    title: m.title.romaji,
    counts: {
      genres: genreIds.length,
      studios: studioIds.length,
      tags: tagEntries.length,
      characters: characterEntries.length,
      staff: staffEntries.length,
      episodes: episodeCount,
    },
    relations,
    recommendations,
  }

  if (opts.link !== false) await linkRelations(payload, result)
  return result
}

// In-Flight-Sperre: verhindert, dass parallele Requests denselben fehlenden
// Slug mehrfach gleichzeitig von AniList holen.
const inFlight = new Map<string, Promise<string | null>>()

// Missbrauchs-Schutz für den anonymen On-Demand-Import (Bot ruft massenhaft
// Zufalls-Slugs auf → AniList-Flut, DB-Pollution, IP-Bann):
//  - Negativ-Cache: kürzlich erfolglose Slugs nicht erneut bei AniList anfragen.
//  - Globales Budget: max. IMPORT_MAX Importe pro IMPORT_WINDOW.
const notFound = new Map<string, number>()
const NOT_FOUND_TTL = 60 * 60 * 1000 // 1 h
const recentImports: number[] = []
const IMPORT_WINDOW = 10 * 60 * 1000 // 10 min
const IMPORT_MAX = 30

function importBudgetExhausted(): boolean {
  const now = Date.now()
  while (recentImports.length && now - recentImports[0] > IMPORT_WINDOW) recentImports.shift()
  return recentImports.length >= IMPORT_MAX
}

/**
 * On-Demand-Fallback: ist ein Slug noch nicht in der DB, wird der passende Anime
 * über die AniList-Suche gefunden und importiert — ABER nur bei EXAKTEM Slug-Treffer
 * (kein Fuzzy-Import → keine unkontrollierte Datenanlage). Gibt den Slug des
 * importierten Anime zurück oder `null` (Route zeigt dann 404).
 */
export function importAnimeBySlug(payload: Payload, slug: string): Promise<string | null> {
  const cached = inFlight.get(slug)
  if (cached) return cached

  // Negativ-Cache: bekannt erfolglose Slugs ohne erneuten AniList-Call abweisen.
  const miss = notFound.get(slug)
  if (miss && Date.now() - miss < NOT_FOUND_TTL) return Promise.resolve(null)

  const task = (async (): Promise<string | null> => {
    const search = slug.replace(/-/g, ' ').trim()
    if (search.length < 2) return null
    // Flut-Schutz: in diesem Zeitfenster keine weiteren On-Demand-Importe.
    if (importBudgetExhausted()) return null

    const data = await anilistRequest<{ Page: { media: any[] } }>(SEARCH_QUERY, { search })
    const candidates = data.Page?.media || []

    // NUR exakter Slug-Treffer wird importiert.
    for (const c of candidates) {
      const cslug = slugify(c.title?.romaji || c.title?.english || String(c.id))
      if (cslug === slug) {
        recentImports.push(Date.now())
        return (await importAnime(payload, c.id)).slug
      }
    }
    // Nichts Passendes → für eine Weile als „nicht gefunden" merken.
    notFound.set(slug, Date.now())
    return null
  })()

  inFlight.set(slug, task)
  task.finally(() => inFlight.delete(slug))
  return task
}

/**
 * Verlinkt `relations` und `recommendations` eines bereits importierten Anime
 * mit den jeweils vorhandenen Anime in der DB (nicht vorhandene werden übersprungen).
 */
export async function linkRelations(payload: Payload, r: ImportResult): Promise<{ relations: number; recommendations: number }> {
  const resolve = async (anilistId: number): Promise<Id | null> => {
    const found = await payload.find({ collection: 'anime', where: { anilistId: { equals: anilistId } }, limit: 1 })
    return found.docs.length ? found.docs[0].id : null
  }

  const relations: { anime: Id; relationType: string }[] = []
  for (const rel of r.relations) {
    const id = await resolve(rel.id)
    if (id) relations.push({ anime: id, relationType: rel.relationType })
  }

  const recommendations: Id[] = []
  for (const recId of r.recommendations) {
    const id = await resolve(recId)
    if (id) recommendations.push(id)
  }

  if (relations.length || recommendations.length) {
    await payload.update({ collection: 'anime', id: r.animeId, data: { relations, recommendations } as any })
  }
  return { relations: relations.length, recommendations: recommendations.length }
}
