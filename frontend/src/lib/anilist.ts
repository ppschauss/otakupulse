/**
 * AniList-Client: rate-limitierter GraphQL-Zugriff + die Queries der Import-Pipeline.
 *
 * AniList erlaubt aktuell ~30 Requests/Minute (offiziell 90, derzeit gedrosselt).
 * Wir serialisieren alle Requests über eine Promise-Kette mit Mindestabstand und
 * respektieren `Retry-After` bei HTTP 429 inkl. exponentiellem Backoff.
 */

const ANILIST_ENDPOINT = 'https://graphql.anilist.co'

// ~28 Requests/Minute — konservativ unter dem aktuellen 30/min-Limit.
const MIN_INTERVAL_MS = 2150
const MAX_RETRIES = 5

let chain: Promise<unknown> = Promise.resolve()
let lastRequestAt = 0
// Wie viele Requests gerade in der Kette stehen (laufend + wartend). Seitenaufrufe
// fragen das ab und stellen sich bei Stau nicht hinten an (lib/import.ts).
let pending = 0
export const anilistPending = (): number => pending

// Ohne Zeitlimit hing ein hängender AniList-Request die GESAMTE Kette auf — alle
// folgenden Aufrufe, auch der tägliche Sync, warteten mit.
const REQUEST_TIMEOUT_MS = 20_000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function rawRequest<T>(query: string, variables: Record<string, unknown>, maxRetries: number): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') || '0')
      const waitMs = (retryAfter > 0 ? retryAfter : Math.min(60, 2 ** attempt)) * 1000
      console.warn(`  ⏳ Rate-Limit (429). Warte ${waitMs / 1000}s … (Versuch ${attempt + 1}/${MAX_RETRIES})`)
      await sleep(waitMs)
      continue
    }

    if (res.status >= 500) {
      const waitMs = Math.min(30, 2 ** attempt) * 1000
      console.warn(`  ⚠ AniList ${res.status}. Backoff ${waitMs / 1000}s … (Versuch ${attempt + 1}/${MAX_RETRIES})`)
      await sleep(waitMs)
      continue
    }

    const json: any = await res.json()
    if (json.errors) {
      const msg = JSON.stringify(json.errors)
      // 404-artige Fehler nicht wiederholen.
      throw new Error(`AniList-GraphQL-Fehler: ${msg}`)
    }
    return json.data as T
  }
  throw new Error(`AniList: Maximale Wiederholungen (${maxRetries}) überschritten.`)
}

/**
 * Serialisierter, rate-limitierter Request. Alle Aufrufer teilen sich eine Warteschlange.
 * `retries`: Wiederholungen bei 429/5xx — Skripte warten geduldig (Standard), ein
 * Seitenaufruf soll das nicht (0), sonst hängt er bis zu einer Minute im Backoff.
 */
export function anilistRequest<T = any>(
  query: string,
  variables: Record<string, unknown> = {},
  opts: { retries?: number } = {},
): Promise<T> {
  const maxRetries = opts.retries ?? MAX_RETRIES
  pending++
  const run = async (): Promise<T> => {
    try {
      const since = Date.now() - lastRequestAt
      if (since < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - since)
      lastRequestAt = Date.now()
      return await rawRequest<T>(query, variables, maxRetries)
    } finally {
      pending--
    }
  }
  // An die Kette hängen, damit immer nur ein Request gleichzeitig läuft.
  const result = chain.then(run, run)
  chain = result.catch(() => {}) // Kette nie an einem Fehler abreißen lassen.
  return result
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
}

// --- Queries -------------------------------------------------------------

// Vollständiger Anime inkl. Charaktere (Hauptcast), Staff, Tags, Relationen,
// Empfehlungen und Airing-Schedule — alles in einem Request.
export const MEDIA_QUERY = /* GraphQL */ `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      idMal
      title { romaji english native }
      description(asHtml: true)
      format
      status
      episodes
      duration
      season
      seasonYear
      averageScore
      popularity
      countryOfOrigin
      source
      genres
      tags { name rank category isAdult }
      studios { nodes { id name isAnimationStudio } }
      coverImage { extraLarge large }
      bannerImage
      trailer { id site }
      characters(sort: [ROLE, RELEVANCE], perPage: 25) {
        edges {
          role
          voiceActors(sort: RELEVANCE) {
            id
            name { full native }
            languageV2
            image { large }
          }
          node {
            id
            name { full native }
            image { large }
            description(asHtml: true)
            gender
            age
            bloodType
            dateOfBirth { month day }
            favourites
          }
        }
      }
      staff(sort: RELEVANCE, perPage: 25) {
        edges {
          role
          node {
            id
            name { full native }
            image { large }
            description(asHtml: true)
            primaryOccupations
            gender
            bloodType
            homeTown
            dateOfBirth { year month day }
            dateOfDeath { year month day }
            favourites
          }
        }
      }
      relations {
        edges {
          relationType
          node { id type }
        }
      }
      recommendations(sort: RATING_DESC, perPage: 12) {
        nodes { mediaRecommendation { id type } }
      }
      airingSchedule(perPage: 50) {
        nodes { episode airingAt }
      }
      streamingEpisodes { title thumbnail url site }
      externalLinks { site url type language }
    }
  }
`

// Alle Tag-Definitionen inkl. Kategorie (ein Request) — für Tag-Kategorie-Backfill.
export const TAG_COLLECTION_QUERY = /* GraphQL */ `
  query {
    MediaTagCollection {
      name
      category
      isAdult
    }
  }
`

// Anime-Suche nach Freitext (für On-Demand-Fallback: Slug → AniList).
export const SEARCH_QUERY = /* GraphQL */ `
  query ($search: String) {
    Page(perPage: 6) {
      media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
        id
        title { romaji english }
        # genres: damit der On-Demand-Import gesperrte Genres (Adult-Policy)
        # schon vor dem vollen MEDIA_QUERY erkennt — siehe lib/adult.ts.
        genres
        isAdult
      }
    }
  }
`

// Streaming-Links + Herkunft für viele Anime auf einmal (Sprach-Backfill, 50/Request).
export const LANGUAGES_BACKFILL_QUERY = /* GraphQL */ `
  query ($ids: [Int]) {
    Page(perPage: 50) {
      media(id_in: $ids, type: ANIME) {
        id
        countryOfOrigin
        externalLinks { site url type language }
      }
    }
  }
`

// Seite mit Anime-IDs nach Sortierung (für Batch-Import).
export const PAGE_QUERY = /* GraphQL */ `
  query ($page: Int, $perPage: Int, $sort: [MediaSort], $season: MediaSeason, $seasonYear: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage hasNextPage lastPage total }
      media(type: ANIME, sort: $sort, season: $season, seasonYear: $seasonYear) {
        id
      }
    }
  }
`
