import { getPayload } from 'payload'
import config from '@payload-config'
import { SITE_NAME, SITE_DESCRIPTION, url } from '@/lib/site'
import { buildRssFeed, rssResponse } from '@/lib/feed'
import { liveArticleFilters } from '@/lib/anime'
import { lexicalToHtml } from '@/lib/lexicalHtml'

export const revalidate = 3600 // stündlich neu

// Vollinhalts-Feed: wie /feed.xml, aber mit komplettem Artikel-HTML in
// <content:encoded> (für Flipboard & Reader, die Volltext bevorzugen).
export async function GET() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'articles',
    where: { and: [{ publishDate: { exists: true } }, ...liveArticleFilters()] },
    sort: '-publishDate',
    limit: 30,
    depth: 0,
  })

  const xml = buildRssFeed({
    title: `${SITE_NAME} — News (Vollinhalt)`,
    selfPath: '/feed-full.xml',
    linkPath: '/news',
    description: SITE_DESCRIPTION,
    items: (docs as any[]).map((a) => {
      const img = a.coverImageUrl
        ? a.coverImageUrl.startsWith('http')
          ? a.coverImageUrl
          : url(a.coverImageUrl)
        : undefined
      // Cover oben in den Inhalt ziehen (Flipboard verlangt ein Bild pro Beitrag).
      const cover = img ? `<p><img src="${img}" alt="${(a.title || '').replace(/"/g, '&quot;')}" /></p>` : ''
      const contentHtml = cover + lexicalToHtml(a.body)
      return {
        title: a.title || '',
        link: url(`/news/${a.slug}`),
        date: a.publishDate,
        description: a.excerpt,
        image: a.coverImageUrl,
        contentHtml: contentHtml || undefined,
      }
    }),
  })

  return rssResponse(xml)
}
