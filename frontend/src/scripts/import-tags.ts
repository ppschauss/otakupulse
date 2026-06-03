/**
 * Tag-Backfill: holt alle AniList-Tag-Definitionen (ein Request) und trägt die
 * Kategorie (theme/setting/demographic/element) bei allen Tags nach.
 * Aufruf:  npm run import:tags
 */
import { getPayload } from 'payload'
import config from '../payload.config'
import { anilistRequest, slugify, TAG_COLLECTION_QUERY } from '../lib/anilist'
import { mapTagCategory } from '../lib/import'

async function main() {
  console.log('→ Hole AniList-Tag-Definitionen …')
  const data = await anilistRequest<{ MediaTagCollection: any[] }>(TAG_COLLECTION_QUERY)
  const tags = data.MediaTagCollection || []
  console.log(`  ${tags.length} Tag-Definitionen erhalten.`)

  const payload = await getPayload({ config })
  let updated = 0
  let created = 0
  for (const t of tags) {
    if (!t.name) continue
    const slug = slugify(t.name)
    const category = mapTagCategory(t.category)
    const found = await payload.find({ collection: 'tags', where: { slug: { equals: slug } }, limit: 1 })
    if (found.docs.length) {
      await payload.update({ collection: 'tags', id: found.docs[0].id, data: { category, isAdult: !!t.isAdult } as any })
      updated++
    } else {
      await payload.create({ collection: 'tags', data: { name: t.name, slug, category, isAdult: !!t.isAdult } as any })
      created++
    }
  }

  console.log(`✓ Fertig. ${updated} aktualisiert, ${created} neu angelegt.`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
