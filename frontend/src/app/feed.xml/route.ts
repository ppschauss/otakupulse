import { getPayload } from 'payload'
import config from '@payload-config'
import { SITE_NAME, SITE_DESCRIPTION, url } from '@/lib/site'

export const revalidate = 3600 // stündlich neu

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'articles',
    where: { publishDate: { exists: true } },
    sort: '-publishDate',
    limit: 30,
    depth: 0,
  })

  const items = (docs as any[])
    .map((a) => {
      const link = url(`/news/${a.slug}`)
      const date = a.publishDate ? new Date(a.publishDate).toUTCString() : ''
      return `    <item>
      <title>${esc(a.title || '')}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="true">${esc(link)}</guid>
      ${date ? `<pubDate>${date}</pubDate>` : ''}
      ${a.excerpt ? `<description>${esc(a.excerpt)}</description>` : ''}
    </item>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE_NAME)} — News</title>
    <link>${esc(url('/news'))}</link>
    <atom:link href="${esc(url('/feed.xml'))}" rel="self" type="application/rss+xml" />
    <description>${esc(SITE_DESCRIPTION)}</description>
    <language>de-DE</language>
${items}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
