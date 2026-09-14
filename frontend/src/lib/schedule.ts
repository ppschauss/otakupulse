/**
 * Simulcast-Kalender (Datenlayer): lädt die Episoden eines Zeitraums und reduziert
 * sie auf das, was die Client-Komponente (components/Schedule.tsx) braucht —
 * bewusst kleine DTOs, weil ein ganzer Monat (~300 Episoden) im HTML/RSC landet.
 * Anbieter je Anime kommen aus den Streaming-Offers (Karten zeigen statt einer
 * „Watchlist" die Dienste, bei denen die Folge läuft).
 */
import { displayTitle, animeCover } from './anime'
import { groupOffersByProvider, streamingOffersOf } from './streaming'

export type ScheduleProvider = { slug: string; name: string; color: string; url: string }
export type ScheduleEpisode = {
  id: string | number
  number: number
  airDate: string
  title: string
  slug: string
  cover: string | null
  genres: string[]
  providers: ScheduleProvider[]
  episodesTotal: number | null
}
export type ScheduleDay = { date: string; weekday: number; day: number; otherMonth: boolean }

/** ISO-Datum (YYYY-MM-DD) in Europe/Berlin — die redaktionelle Zeitzone der Seite. */
const BERLIN_YMD = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })
export const berlinYmd = (d: Date): string => BERLIN_YMD.format(d)

export const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

/** Monatsraster (Mo–So) um `ymd` herum, inkl. Fremdmonatstagen für volle Wochen. */
export function monthGrid(ymd: string): { year: number; month: number; days: ScheduleDay[] } {
  const [y, m] = ymd.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const last = new Date(Date.UTC(y, m, 0))
  const lead = (first.getUTCDay() + 6) % 7 // Montag = 0
  const trail = (7 - ((last.getUTCDay() + 6) % 7) - 1) % 7
  const start = new Date(first)
  start.setUTCDate(start.getUTCDate() - lead)
  const days: ScheduleDay[] = []
  const total = lead + last.getUTCDate() + trail
  for (let i = 0; i < total; i++) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    days.push({
      date: d.toISOString().slice(0, 10),
      weekday: (d.getUTCDay() + 6) % 7,
      day: d.getUTCDate(),
      otherMonth: d.getUTCMonth() !== m - 1,
    })
  }
  return { year: y, month: m, days }
}

/** Zeitfenster des Rasters in UTC-Instants (Berliner Tagesgrenzen). */
export function gridRange(days: ScheduleDay[]): { from: string; to: string } {
  const from = berlinMidnightIso(days[0].date)
  const to = berlinMidnightIso(shiftYmd(days[days.length - 1].date, 1))
  return { from, to }
}

export function shiftYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const x = new Date(Date.UTC(y, m - 1, d + delta))
  return x.toISOString().slice(0, 10)
}

/** Mitternacht Europe/Berlin des Tages als ISO-Instant (DST-sicher: Offset 1 h oder 2 h probieren). */
const BERLIN_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
})
export function berlinMidnightIso(ymd: string): string {
  const base = Date.parse(`${ymd}T00:00:00Z`)
  for (const h of [2, 1]) {
    const t = new Date(base - h * 3600_000)
    const parts = Object.fromEntries(BERLIN_PARTS.formatToParts(t).map((x) => [x.type, x.value]))
    if (`${parts.year}-${parts.month}-${parts.day}` === ymd && parts.hour === '00') return t.toISOString()
  }
  return new Date(base).toISOString()
}

const TITLE_LIMIT = 90

/** Genres kommen bei depth 1 als IDs (oder Objekte) — `genreSlugById` löst IDs auf. */
export function toScheduleEpisode(ep: any, genreSlugById: Map<any, string> = new Map()): ScheduleEpisode | null {
  const anime = ep?.anime && typeof ep.anime === 'object' ? ep.anime : null
  if (!anime || !ep?.airDate || anime.isHentai) return null
  const groups = groupOffersByProvider(streamingOffersOf(anime))
  return {
    id: ep.id,
    number: ep.number,
    airDate: new Date(ep.airDate).toISOString(),
    title: displayTitle(anime).slice(0, TITLE_LIMIT),
    slug: anime.slug,
    cover: animeCover(anime),
    genres: (Array.isArray(anime.genres) ? anime.genres : [])
      .map((g: any) => (g && typeof g === 'object' ? g.slug : genreSlugById.get(g)))
      .filter(Boolean),
    providers: groups.slice(0, 4).map((g) => ({ slug: g.provider.slug, name: g.provider.name, color: g.provider.color || '#888', url: g.offers[0].url })),
    episodesTotal: typeof anime.episodes === 'number' ? anime.episodes : null,
  }
}

/** Alle Episoden des Rasters, sortiert nach Sendezeit. */
export async function loadScheduleEpisodes(payload: any, days: ScheduleDay[]): Promise<ScheduleEpisode[]> {
  const { from, to } = gridRange(days)
  const res = await payload.find({
    collection: 'episodes',
    where: { airDate: { greater_than_equal: from, less_than: to } },
    sort: 'airDate',
    limit: 2000,
    depth: 1,
  })
  const genres = await payload.find({ collection: 'genres', limit: 100, depth: 0, select: { slug: true } as any })
  const genreSlugById = new Map<any, string>((genres.docs as any[]).map((g) => [g.id, g.slug]))
  return (res.docs as any[]).map((d) => toScheduleEpisode(d, genreSlugById)).filter((e): e is ScheduleEpisode => !!e)
}

/** Genres (Slug → Name), die im Raster vorkommen — für die Filter-Chips. */
export async function scheduleGenres(payload: any, episodes: ScheduleEpisode[]): Promise<{ slug: string; name: string }[]> {
  const slugs = new Set(episodes.flatMap((e) => e.genres))
  if (!slugs.size) return []
  const res = await payload.find({ collection: 'genres', where: { slug: { in: [...slugs] } }, limit: 100, depth: 0, select: { slug: true, name: true } as any })
  return (res.docs as any[])
    .filter((g) => g.slug !== 'hentai')
    .map((g) => ({ slug: g.slug, name: g.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
}
