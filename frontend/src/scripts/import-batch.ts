/**
 * Batch-Import: holt viele Anime von AniList nach Sortierung (Default: Popularität)
 * oder für eine bestimmte Season und importiert sie rate-limitiert.
 *
 * Aufruf (im Container):
 *   npm run import:batch -- --pages 4                  Top 200 nach Popularität (50/Seite)
 *   npm run import:batch -- --pages 2 --sort SCORE_DESC  Top 100 nach Score
 *   npm run import:batch -- --season SPRING --year 2026  ganze Season
 *   npm run import:batch -- --pages 4 --episodes         zusätzlich Episoden je Anime
 *
 * Relationen & Empfehlungen werden NACH dem Import in einem zweiten Durchgang
 * verlinkt, damit auch Vorwärts-Referenzen (Sequels etc.) sitzen.
 */
import { getPayload } from 'payload'
import config from '../payload.config'
import { anilistRequest, PAGE_QUERY } from '../lib/anilist'
import { importAnime, linkRelations, type ImportResult } from '../lib/import'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const flag = (name: string) => process.argv.includes(`--${name}`)

async function collectIds(opts: {
  pages: number
  perPage: number
  sort: string
  season?: string
  year?: number
}): Promise<number[]> {
  const ids: number[] = []
  for (let page = 1; page <= opts.pages; page++) {
    const data = await anilistRequest<{ Page: any }>(PAGE_QUERY, {
      page,
      perPage: opts.perPage,
      sort: [opts.sort],
      season: opts.season,
      seasonYear: opts.year,
    })
    for (const m of data.Page?.media || []) ids.push(m.id)
    console.log(`  Seite ${page}/${opts.pages}: ${data.Page?.media?.length || 0} IDs (gesamt ${ids.length})`)
    if (!data.Page?.pageInfo?.hasNextPage) break
  }
  return ids
}

async function main() {
  const pages = Number(arg('pages') || 4)
  const perPage = Math.min(Number(arg('perPage') || 50), 50)
  const sort = arg('sort') || 'POPULARITY_DESC'
  const season = arg('season')?.toUpperCase()
  const year = arg('year') ? Number(arg('year')) : undefined
  const withEpisodes = flag('episodes')

  console.log(
    `→ Sammle IDs … (${season ? `Season ${season} ${year}` : `${sort}`}, ${pages} Seite(n) × ${perPage})`,
  )
  const payload = await getPayload({ config })

  const ids = await collectIds({ pages, perPage, sort, season, year })
  console.log(`\n→ Importiere ${ids.length} Anime …\n`)

  const results: ImportResult[] = []
  let ok = 0
  let fail = 0
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    try {
      // link:false — Relationen erst im zweiten Durchgang, wenn alle Anime existieren.
      const r = await importAnime(payload, id, { episodes: withEpisodes, link: false })
      results.push(r)
      ok++
      console.log(
        `[${i + 1}/${ids.length}] ✓ ${r.title}  (C:${r.counts.characters} S:${r.counts.staff} ` +
          `T:${r.counts.tags} E:${r.counts.episodes})`,
      )
    } catch (err: any) {
      fail++
      console.warn(`[${i + 1}/${ids.length}] ✗ #${id}: ${err?.message || err}`)
    }
  }

  console.log(`\n→ Verlinke Relationen & Empfehlungen (${results.length} Anime) …`)
  let relLinks = 0
  let recLinks = 0
  for (const r of results) {
    try {
      const linked = await linkRelations(payload, r)
      relLinks += linked.relations
      recLinks += linked.recommendations
    } catch (err: any) {
      console.warn(`  ✗ Linking #${r.anilistId}: ${err?.message || err}`)
    }
  }

  console.log(`\n✓ Fertig. Importiert: ${ok} · Fehler: ${fail} · Relationen: ${relLinks} · Empfehlungen: ${recLinks}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
