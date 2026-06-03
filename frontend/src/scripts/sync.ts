/**
 * Täglicher Sync (für Cron): aktualisiert laufende Anime + importiert die aktuelle Season.
 * Aufruf:  npm run sync
 *
 * Beispiel-Cron (im Container, täglich 4 Uhr):
 *   0 4 * * *  cd /app && npm run sync >> /tmp/otaku-sync.log 2>&1
 */
import { getPayload } from 'payload'
import config from '../payload.config'
import { anilistRequest, PAGE_QUERY } from '../lib/anilist'
import { importAnime, linkRelations, type ImportResult } from '../lib/import'

function currentSeason(d: Date): { season: string; year: number } {
  const m = d.getMonth() + 1
  const season = m <= 3 ? 'WINTER' : m <= 6 ? 'SPRING' : m <= 9 ? 'SUMMER' : 'FALL'
  return { season, year: d.getFullYear() }
}

async function main() {
  const now = new Date()
  const { season, year } = currentSeason(now)
  console.log(`→ Sync: Season ${season} ${year} + laufende Anime`)

  const payload = await getPayload({ config })

  // 1) IDs der aktuellen Season von AniList
  const seasonIds: number[] = []
  for (let page = 1; page <= 2; page++) {
    const data = await anilistRequest<{ Page: any }>(PAGE_QUERY, {
      page,
      perPage: 50,
      sort: ['POPULARITY_DESC'],
      season,
      seasonYear: year,
    })
    for (const m of data.Page?.media || []) seasonIds.push(m.id)
    if (!data.Page?.pageInfo?.hasNextPage) break
  }

  // 2) anilistIds der aktuell laufenden Anime aus der DB
  const releasing = await payload.find({
    collection: 'anime',
    where: { status: { equals: 'RELEASING' } },
    limit: 500,
    depth: 0,
    select: { anilistId: true },
  })
  const releasingIds = releasing.docs.map((d: any) => d.anilistId).filter(Boolean)

  const ids = [...new Set([...seasonIds, ...releasingIds])]
  console.log(`  ${ids.length} Anime zu synchronisieren (${seasonIds.length} Season, ${releasingIds.length} laufend)`)

  const results: ImportResult[] = []
  let ok = 0
  let fail = 0
  for (let i = 0; i < ids.length; i++) {
    try {
      const r = await importAnime(payload, ids[i], { episodes: true, link: false })
      results.push(r)
      ok++
      console.log(`[${i + 1}/${ids.length}] ✓ ${r.title} (E:${r.counts.episodes})`)
    } catch (err: any) {
      fail++
      console.warn(`[${i + 1}/${ids.length}] ✗ #${ids[i]}: ${err?.message || err}`)
    }
  }

  for (const r of results) {
    try {
      await linkRelations(payload, r)
    } catch {
      /* ignore */
    }
  }

  console.log(`✓ Sync fertig. Aktualisiert: ${ok} · Fehler: ${fail}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
