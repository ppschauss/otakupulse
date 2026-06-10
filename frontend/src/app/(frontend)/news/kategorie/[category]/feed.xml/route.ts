import { getPayload } from 'payload'
import config from '@payload-config'
import { SITE_NAME, url } from '@/lib/site'
import { ARTICLE_CATEGORY_LABELS, articleCategoryLabel, liveArticleFilters } from '@/lib/anime'
import { buildRssFeed, rssResponse } from '@/lib/feed'

// RSS-Feed pro News-Kategorie, z. B. /news/kategorie/simulcast/feed.xml
export const revalidate = 600

export async function GET(_req: Request, { params }: { params: Promise<{ category: string }> }) {
  const { category } = await params
  if (!ARTICLE_CATEGORY_LABELS[category]) return new Response('Unbekannte Kategorie', { status: 404 })
  const label = articleCategoryLabel(category)

  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'articles',
    where: { and: [{ category: { equals: category } }, ...liveArticleFilters()] },
    sort: '-publishDate',
    limit: 50,
    depth: 0,
  })

  const xml = buildRssFeed({
    title: `${SITE_NAME} — ${label}`,
    selfPath: `/news/kategorie/${category}/feed.xml`,
    linkPath: `/news/kategorie/${category}`,
    description: `Alle ${label}-Beiträge von ${SITE_NAME} als RSS-Feed.`,
    items: (docs as any[]).map((a) => ({
      title: a.title || '',
      link: url(`/news/${a.slug}`),
      date: a.publishDate,
      description: a.excerpt,
    })),
  })

  return rssResponse(xml)
}
