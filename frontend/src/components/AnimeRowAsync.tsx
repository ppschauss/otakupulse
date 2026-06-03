import { getPayload } from 'payload'
import config from '@payload-config'
import { MediaRow } from './MediaRow'

// Async-Serverkomponente: holt ihre Daten selbst und rendert eine MediaRow.
// In <Suspense> verpackt streamt jede Reihe unabhängig nach.
export async function AnimeRowAsync({
  title,
  href,
  where = {},
  sort = '-popularity',
  genreSlug,
}: {
  title: string
  href?: string
  where?: any
  sort?: string
  genreSlug?: string
}) {
  const payload = await getPayload({ config })

  let finalWhere = where
  if (genreSlug) {
    const g = await payload.find({ collection: 'genres', where: { slug: { equals: genreSlug } }, limit: 1, depth: 0 })
    const id = (g.docs[0] as any)?.id
    if (!id) return null
    finalWhere = { genres: { in: [id] } }
  }

  const { docs } = await payload.find({ collection: 'anime', where: finalWhere, sort, limit: 20, depth: 0 })
  return <MediaRow title={title} href={href} items={docs} />
}
