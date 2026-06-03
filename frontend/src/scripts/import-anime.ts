/**
 * Einzel-Import: holt EINEN Anime von AniList inkl. Genres, Studios, Season, Tags,
 * Charaktere (mit Synchronsprechern), Staff, Relationen & Empfehlungen.
 *
 * Aufruf (im Container):
 *   npm run import:anime -- <anilistId>             z.B. 21 (One Piece)
 *   npm run import:anime -- <anilistId> --episodes  zusätzlich Episoden (Airing-Schedule)
 */
import { getPayload } from 'payload'
import config from '../payload.config'
import { importAnime } from '../lib/import'

async function main() {
  const args = process.argv.slice(2)
  const id = Number(args.find((a) => /^\d+$/.test(a)) || 21)
  const withEpisodes = args.includes('--episodes')

  console.log(`→ Hole AniList-Media #${id} …`)
  const payload = await getPayload({ config })

  const r = await importAnime(payload, id, { episodes: withEpisodes })

  console.log(`✓ ${r.title}  →  /anime/${r.slug}`)
  console.log(
    `  Genres: ${r.counts.genres} · Studios: ${r.counts.studios} · Tags: ${r.counts.tags} · ` +
      `Charaktere: ${r.counts.characters} · Staff: ${r.counts.staff} · Episoden: ${r.counts.episodes}`,
  )
  console.log(
    `  Relationen: ${r.relations.length} · Empfehlungen: ${r.recommendations.length} (verlinkt soweit in DB vorhanden)`,
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
