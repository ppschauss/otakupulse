import { getPayload } from 'payload'
import config from '@payload-config'
import { SITE_NAME, url } from '@/lib/site'
import { displayTitle } from '@/lib/anime'
import { buildRssFeed, rssResponse } from '@/lib/feed'

export const revalidate = 3600

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayload({ config })

  const { docs: genres } = await payload.find({
    collection: 'genres',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  })
  const genre = genres[0] as any
  if (!genre) return new Response('Not found', { status: 404 })

  const { docs } = await payload.find({
    collection: 'anime',
    where: { genres: { in: [genre.id] } },
    sort: '-createdAt',
    limit: 30,
    depth: 0,
  })

  const xml = buildRssFeed({
    title: `${SITE_NAME} — Neue Anime im Genre ${genre.name}`,
    selfPath: `/genre/${slug}/feed.xml`,
    linkPath: `/genre/${slug}`,
    description: `Die neuesten ${genre.name}-Anime bei ${SITE_NAME}.`,
    items: (docs as any[]).map((a) => ({
      title: displayTitle(a),
      link: url(`/anime/${a.slug}`),
      date: a.createdAt,
      description: a.descriptionDe ? a.descriptionDe.slice(0, 300) : null,
    })),
  })

  return rssResponse(xml)
}
