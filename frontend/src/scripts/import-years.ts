/**
 * Importiert Anime der letzten N Jahre season-weise von AniList und überspringt
 * dabei bereits vorhandene (per anilistId). Rate-limitiert über anilistRequest.
 *
 * Aufruf (im Container):
 *   npm run import:years                 letzte 15 Jahre (Default)
 *   npm run import:years -- --years 10   letzte 10 Jahre
 *   npm run import:years -- --episodes   zusätzlich Episoden je Anime (mehr Requests)
 *
 * Relationen/Empfehlungen werden nach dem Import in einem zweiten Durchgang verlinkt.
 */
import { getPayload } from 'payload'
import config from '../payload.config'
import { anilistRequest, PAGE_QUERY } from '../lib/anilist'
import { importAnime, linkRelations, type ImportResult } from '../lib/import'

const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL']

async function collectSeasonIds(season: string, year: number, perPage = 50, maxPages = 8): Promise<number[]> {
  const ids: number[] = []
  for (let page = 1; page <= maxPages; page++) {
    const data = await anilistRequest<{ Page: any }>(PAGE_QUERY, {
      page,
      perPage,
      sort: ['POPULARITY_DESC'],
      season,
      seasonYear: year,
    })
    for (const m of data.Page?.media || []) ids.push(m.id)
    if (!data.Page?.pageInfo?.hasNextPage) break
  }
  return ids
}

async function main() {
  const years = Number(arg('years') || 15)
  const endYear = Number(arg('endYear') || new Date().getFullYear())
  const startYear = endYear - years + 1
  const withEpisodes = process.argv.includes('--episodes')

  const payload = await getPayload({ config })

  // Vorhandene anilistIds einsammeln (zum Überspringen).
  const existing = new Set<number>()
  let page = 1
  for (;;) {
    const r: any = await payload.find({
      collection: 'anime',
      limit: 500,
      page,
      depth: 0,
      select: { anilistId: true } as any,
    })
    for (const d of r.docs as any[]) if (d.anilistId) existing.add(Number(d.anilistId))
    if (!r.hasNextPage) break
    page++
  }
  console.log(`→ Bereits erfasst: ${existing.size} Anime`)

  // Ziel-IDs aller Seasons der letzten N Jahre sammeln.
  console.log(`→ Sammle Season-IDs ${startYear}–${endYear} …`)
  const targetIds = new Set<number>()
  for (let y = endYear; y >= startYear; y--) {
    for (const s of SEASONS) {
      const ids = await collectSeasonIds(s, y)
      ids.forEach((id) => targetIds.add(id))
      console.log(`  ${s} ${y}: +${ids.length}  (Ziel gesamt ${targetIds.size})`)
    }
  }

  const todo = [...targetIds].filter((id) => !existing.has(id))
  console.log(`\n→ ${targetIds.size} gefunden · ${existing.size} schon da · ${todo.length} NEU zu importieren\n`)

  if (process.argv.includes('--dry')) {
    console.log('(--dry: kein Import, nur Vorschau)')
    process.exit(0)
  }

  const results: ImportResult[] = []
  let ok = 0
  let fail = 0
  for (let i = 0; i < todo.length; i++) {
    try {
      const r = await importAnime(payload, todo[i], { episodes: withEpisodes, link: false })
      results.push(r)
      ok++
      if (i % 25 === 0 || i === todo.length - 1) console.log(`[${i + 1}/${todo.length}] ✓ ${r.title}`)
    } catch (err: any) {
      fail++
      console.warn(`[${i + 1}/${todo.length}] ✗ #${todo[i]}: ${err?.message || err}`)
    }
  }

  console.log(`\n→ Verlinke Relationen & Empfehlungen (${results.length}) …`)
  for (const r of results) {
    try {
      await linkRelations(payload, r)
    } catch (err: any) {
      console.warn(`  ✗ Linking #${r.anilistId}: ${err?.message || err}`)
    }
  }

  console.log(`\n✓ Fertig. Neu importiert: ${ok} · Fehler: ${fail}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
