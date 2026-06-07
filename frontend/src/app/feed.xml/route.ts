import { getPayload } from 'payload'
import config from '@payload-config'
import { SITE_NAME, SITE_DESCRIPTION, url } from '@/lib/site'
import { buildRssFeed, rssResponse } from '@/lib/feed'

export const revalidate = 3600 // stündlich neu

export async function GET() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'articles',
    where: { and: [{ publishDate: { exists: true } }, { _status: { equals: 'published' } }] },
    sort: '-publishDate',
    limit: 30,
    depth: 0,
  })

  const xml = buildRssFeed({
    title: `${SITE_NAME} — News`,
    selfPath: '/feed.xml',
    linkPath: '/news',
    description: SITE_DESCRIPTION,
    items: (docs as any[]).map((a) => ({
      title: a.title || '',
      link: url(`/news/${a.slug}`),
      date: a.publishDate,
      description: a.excerpt,
    })),
  })

  return rssResponse(xml)
}
