/**
 * Alt-Artikel aus dem Index nehmen (Scaled-Content-Aufräumer).
 *
 * Bis Oktober 2026 erzeugte `generate-recurring-news.ts --daily` pro Tag einen
 * Digest plus bis zu vier Einzel-Episoden-Meldungen — rund 600 Beiträge nach
 * immer derselben Schablone. Google wertet so etwas als „Low value content"
 * (AdSense Policy Center) bzw. „Scaled content abuse" (Suche). Ersetzt wurden
 * sie durch EINEN Wochenüberblick (`--weekly-preview`, montags).
 *
 * Dieses Skript setzt die Altbestände auf `noindex` (und damit aus der Sitemap,
 * siehe lib/sitemap.ts). Die Beiträge bleiben erreichbar — nur eben nicht mehr
 * als Suchergebnis-Masse.
 *
 * Aufruf:
 *   npx tsx src/scripts/prune-news.ts                 # Vorschau
 *   npx tsx src/scripts/prune-news.ts --apply         # schreibt
 *   npx tsx src/scripts/prune-news.ts --apply --delete   # löscht statt noindex
 */
import { getPayload } from 'payload'
import config from '../payload.config'

const apply = process.argv.includes('--apply')
const del = process.argv.includes('--delete')

/** Slug-Präfixe der abgeschafften Serienformate. */
const PREFIXES = ['episode-', 'simulcast-heute-']

async function main() {
  const payload = await getPayload({ config })
  const hits: any[] = []
  for (const prefix of PREFIXES) {
    let page = 1
    for (;;) {
      const res = await payload.find({
        collection: 'articles',
        where: { slug: { like: prefix } },
        limit: 200,
        page,
        depth: 0,
        pagination: true,
      })
      for (const a of res.docs as any[]) if (String(a.slug).startsWith(prefix)) hits.push(a)
      if (!res.hasNextPage) break
      page++
    }
  }
  console.log(`→ ${hits.length} Alt-Beiträge gefunden (${PREFIXES.join(', ')})`)
  for (const a of hits.slice(0, 5)) console.log(`   /news/${a.slug}`)
  if (!apply) {
    console.log('\nVorschau — mit --apply ausführen.')
    process.exit(0)
  }
  let n = 0
  for (const a of hits) {
    if (del) await payload.delete({ collection: 'articles', id: a.id })
    else if (a.noindex !== true) await payload.update({ collection: 'articles', id: a.id, data: { noindex: true } as any })
    else continue
    n++
  }
  console.log(`✓ ${n} Beiträge ${del ? 'gelöscht' : 'auf noindex gesetzt'}.`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
