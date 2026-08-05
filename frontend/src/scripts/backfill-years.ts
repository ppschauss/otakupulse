/**
 * Backfill fehlender Anime eines Jahr-Bereichs von AniList — OHNE Erotik
 * (isAdult:false, d. h. Hentai/18+ werden gar nicht erst geholt).
 *
 * Anders als import:years wird NICHT season-weise gesammelt, sondern per
 * `seasonYear` allein — so werden auch season-lose Titel (Filme/OVAs/Specials)
 * erfasst. Bereits vorhandene (per anilistId) werden übersprungen.
 *
 * Aufruf (im enrich-Container):
 *   npx tsx src/scripts/backfill-years.ts --startYear 2000 --endYear 2011
 *   npx tsx src/scripts/backfill-years.ts --startYear 2000 --endYear 2011 --dry
 *   npx tsx src/scripts/backfill-years.ts --startYear 2000 --endYear 2011 --episodes
 */
import { getPayload } from 'payload'
import config from '../payload.config'
import { anilistRequest } from '../lib/anilist'
import { importAnime, linkRelations, type ImportResult } from '../lib/import'

const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

// seasonYear-only + isAdult:false → erfasst ALLE nicht-erotischen Titel des Jahres.
const YEAR_QUERY = /* GraphQL */ `
  query ($page: Int, $perPage: Int, $seasonYear: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(type: ANIME, isAdult: false, sort: POPULARITY_DESC, seasonYear: $seasonYear) {
        id
      }
    }
  }
`

async function collectYearIds(year: number, perPage = 50, maxPages = 20): Promise<number[]> {
  const ids: number[] = []
  for (let page = 1; page <= maxPages; page++) {
    const data = await anilistRequest<{ Page: any }>(YEAR_QUERY, { page, perPage, seasonYear: year })
    for (const m of data.Page?.media || []) ids.push(m.id)
    if (!data.Page?.pageInfo?.hasNextPage) break
  }
  return ids
}

async function main() {
  const endYear = Number(arg('endYear') || new Date().getFullYear())
  const startYear = Number(arg('startYear') || endYear)
  const withEpisodes = process.argv.includes('--episodes')
  const dry = process.argv.includes('--dry')

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

  console.log(`→ Sammle nicht-erotische Titel ${startYear}–${endYear} (seasonYear, isAdult:false) …`)
  const targetIds = new Set<number>()
  for (let y = endYear; y >= startYear; y--) {
    const ids = await collectYearIds(y)
    ids.forEach((id) => targetIds.add(id))
    const neu = ids.filter((id) => !existing.has(id)).length
    console.log(`  ${y}: ${ids.length} gefunden · ${neu} neu`)
  }

  const todo = [...targetIds].filter((id) => !existing.has(id))
  console.log(`\n→ ${targetIds.size} gefunden · ${existing.size} schon da · ${todo.length} NEU zu importieren\n`)

  if (dry) {
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
