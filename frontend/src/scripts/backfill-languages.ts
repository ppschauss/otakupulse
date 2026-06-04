/**
 * Sprach-Backfill: holt für alle vorhandenen Anime die AniList-Streaming-Links
 * (50 Titel pro Request) und befüllt `availableLanguages` (+ `externalLinks`).
 *
 * AniList trennt Sub/Dub nicht — ein "German"-Streaming-Link → `de-sub`,
 * "English" → `en-sub`, JP-Originale → `ja`. Echter Dub (de-dub/en-dub) bleibt
 * manueller Pflege vorbehalten und wird hier NICHT überschrieben (nur gemerged).
 *
 * Aufruf:  npm run backfill:languages
 */
import { getPayload } from 'payload'
import config from '../payload.config'
import { anilistRequest, LANGUAGES_BACKFILL_QUERY } from '../lib/anilist'
import { deriveLanguages, mapExternalLinks } from '../lib/import'

const chunk = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))

async function main() {
  const payload = await getPayload({ config })

  // Alle Anime mit ihrer anilistId einsammeln (paginiert, leichtgewichtig).
  const ids: { animeId: any; anilistId: number; have: string[] }[] = []
  let page = 1
  for (;;) {
    const res = await payload.find({
      collection: 'anime',
      where: { anilistId: { exists: true } },
      limit: 500,
      page,
      depth: 0,
      select: { anilistId: true, availableLanguages: true } as any,
    })
    for (const d of res.docs as any[]) {
      if (d.anilistId) ids.push({ animeId: d.id, anilistId: d.anilistId, have: d.availableLanguages || [] })
    }
    if (!res.hasNextPage) break
    page++
  }
  console.log(`→ ${ids.length} Anime mit anilistId gefunden.`)

  const batches = chunk(ids, 50)
  let updated = 0
  let withLang = 0

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]
    const byId = new Map(batch.map((b) => [b.anilistId, b]))
    const data = await anilistRequest<{ Page: { media: any[] } }>(LANGUAGES_BACKFILL_QUERY, {
      ids: batch.map((b) => b.anilistId),
    })
    const media = data.Page?.media || []

    for (const m of media) {
      const entry = byId.get(m.id)
      if (!entry) continue
      const derived = deriveLanguages(m)
      // Bestehende (auch manuell gepflegte de-dub/en-dub) NICHT verlieren → mergen.
      const merged = [...new Set([...(entry.have || []), ...derived])]
      const links = mapExternalLinks(m)
      await payload.update({
        collection: 'anime',
        id: entry.animeId,
        data: { availableLanguages: merged, externalLinks: links } as any,
      })
      updated++
      if (derived.some((l) => l !== 'ja')) withLang++
    }
    console.log(`  Batch ${i + 1}/${batches.length} — ${updated} aktualisiert (${withLang} mit DE/EN-Verfügbarkeit)`)
  }

  console.log(`✓ Fertig. ${updated} Anime aktualisiert, davon ${withLang} mit deutscher/englischer Verfügbarkeit.`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
