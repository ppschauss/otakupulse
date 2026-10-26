/**
 * Einmal-Aufräumer für die Adult-Policy (siehe lib/adult.ts).
 *
 * Die Routen leiten gesperrte Inhalte bereits dauerhaft auf /genre/ecchi um; dieses
 * Skript räumt zusätzlich die Datenbank auf, damit die Inhalte auch aus Listen,
 * Sitemaps und Feeds verschwinden:
 *   1. Artikel zu gesperrten Titeln (Hentai) → `noindex` + aus der Veröffentlichung
 *      genommen (`_status: draft`), damit sie nicht mehr gelistet werden.
 *   2. Gesperrte Anime → `noindex`, damit sie auch bei künftigen Sitemap-Läufen
 *      sicher draußen sind (die Where-Filter greifen bereits).
 *
 * Aufruf (im enrich-/App-Container):
 *   npx tsx src/scripts/adult-cleanup.ts            # Vorschau
 *   npx tsx src/scripts/adult-cleanup.ts --apply    # schreibt
 */
import { getPayload, type Payload } from 'payload'
import config from '../payload.config'
import { isBlockedArticle } from '../lib/adult'

const apply = process.argv.includes('--apply')

async function blockedAnime(payload: Payload) {
  const res = await payload.find({
    collection: 'anime',
    where: { isHentai: { equals: true } },
    limit: 5000,
    depth: 0,
    select: { slug: true, noindex: true } as any,
  })
  return res.docs as any[]
}

async function blockedArticles(payload: Payload) {
  const out: any[] = []
  let page = 1
  for (;;) {
    const res = await payload.find({ collection: 'articles', limit: 200, page, depth: 1, pagination: true })
    for (const a of res.docs as any[]) if (isBlockedArticle(a)) out.push(a)
    if (!res.hasNextPage) break
    page++
  }
  return out
}

async function main() {
  const payload = await getPayload({ config })

  const anime = await blockedAnime(payload)
  const articles = await blockedArticles(payload)
  console.log(`→ Gesperrte Anime: ${anime.length} · betroffene Artikel: ${articles.length}`)
  for (const a of articles.slice(0, 10)) console.log(`   /news/${a.slug} — ${a.title}`)
  if (articles.length > 10) console.log(`   … und ${articles.length - 10} weitere`)

  if (!apply) {
    console.log('\nVorschau — mit --apply ausführen, um zu schreiben.')
    process.exit(0)
  }

  let n = 0
  for (const a of anime) {
    if (a.noindex === true) continue
    await payload.update({ collection: 'anime', id: a.id, data: { noindex: true } as any })
    n++
  }
  console.log(`✓ ${n} Anime auf noindex gesetzt.`)

  let m = 0
  for (const a of articles) {
    await payload.update({
      collection: 'articles',
      id: a.id,
      data: { noindex: true, _status: 'draft' } as any,
    })
    m++
  }
  console.log(`✓ ${m} Artikel auf noindex + Entwurf gesetzt.`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
