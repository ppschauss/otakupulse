/**
 * Einmal-Backfill: setzt isHentai=true für alle bereits importierten Anime der
 * Genre „Hentai" (und isHentai=false für alle übrigen, die noch keinen Wert haben
 * ist dank defaultValue unnötig). Aufruf im enrich-Container:
 *   npx tsx src/scripts/_hentai-backfill.ts
 */
import { getPayload } from 'payload'
import config from '../payload.config'

async function main() {
  const payload = await getPayload({ config })

  const genre = await payload.find({ collection: 'genres', where: { slug: { equals: 'hentai' } }, limit: 1 })
  if (!genre.docs.length) {
    console.log('Kein Genre mit slug "hentai" gefunden — nichts zu tun.')
    process.exit(0)
  }
  const genreId = genre.docs[0].id
  console.log(`→ Hentai-Genre-ID: ${genreId}`)

  let page = 1
  let updated = 0
  for (;;) {
    const res = await payload.find({
      collection: 'anime',
      where: { genres: { in: [genreId] } },
      limit: 100,
      page,
      depth: 0,
    })
    for (const a of res.docs as any[]) {
      if (a.isHentai === true) continue
      await payload.update({ collection: 'anime', id: a.id, data: { isHentai: true } as any })
      updated++
      console.log(`[✓] ${a.slug}`)
    }
    if (!res.hasNextPage) break
    page++
  }

  console.log(`\n✓ Fertig. ${updated} Anime als Hentai markiert.`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
