import { getPayload } from 'payload'
import config from '@payload-config'
import { url, SITE_NAME } from '@/lib/site'
import { displayTitle } from '@/lib/anime'
import { stripHtml } from '@/lib/articleBody'

export const dynamic = 'force-dynamic'

function esc(s = ''): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
const cdata = (s = '') => `<![CDATA[${s.replace(/]]>/g, ']]&gt;')}]]>`
// Pfad oder Voll-URL → absolute URL.
const abs = (u: string) => (/^https?:\/\//.test(u) ? u : url(u.startsWith('/') ? u : `/${u}`))

type Item = { title: string; link: string; description?: string; category?: string; date: number }

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug: raw } = await params
  const slug = raw.replace(/\.xml$/, '')

  const payload = await getPayload({ config })
  const found = await payload.find({ collection: 'feeds', where: { slug: { equals: slug } }, limit: 1, depth: 1 })
  const feed = found.docs[0] as any
  if (!feed) return new Response('Feed nicht gefunden', { status: 404 })

  const now = Date.now()
  const items: Item[] = []

  // 1) Artikel (nur veröffentlicht)
  for (const a of (feed.articles || []) as any[]) {
    if (!a || typeof a !== 'object' || a._status !== 'published') continue
    items.push({
      title: a.title || '',
      link: url(`/news/${a.slug}`),
      description: a.excerpt || undefined,
      category: a.category || undefined,
      date: a.publishDate ? new Date(a.publishDate).getTime() : a.updatedAt ? new Date(a.updatedAt).getTime() : now,
    })
  }

  // 2) Anime direkt (verlinkt auf /anime/<slug>, Text = dt. Beschreibung)
  for (const an of (feed.anime || []) as any[]) {
    if (!an || typeof an !== 'object' || !an.slug) continue
    const desc = (an.descriptionDe?.trim() || stripHtml(an.descriptionSource)).slice(0, 400)
    items.push({
      title: displayTitle(an),
      link: url(`/anime/${an.slug}`),
      description: desc || undefined,
      category: 'Anime',
      date: an.updatedAt ? new Date(an.updatedAt).getTime() : an.createdAt ? new Date(an.createdAt).getTime() : now,
    })
  }

  // 3) Eigene Einträge (beliebige Seite/URL)
  for (const c of (feed.customItems || []) as any[]) {
    if (!c?.title || !c?.url) continue
    items.push({
      title: c.title,
      link: abs(c.url),
      description: c.description || undefined,
      date: c.date ? new Date(c.date).getTime() : now,
    })
  }

  // Neueste zuerst, auf maxItems begrenzen.
  items.sort((a, b) => b.date - a.date)
  const max = feed.maxItems || 50
  const chosen = items.slice(0, max)

  const self = url(`/feed/${slug}`)
  const lastBuild = new Date().toUTCString()
  const itemsXml = chosen
    .map((it) =>
      [
        '    <item>',
        `      <title>${esc(it.title)}</title>`,
        `      <link>${it.link}</link>`,
        `      <guid isPermaLink="true">${it.link}</guid>`,
        it.description ? `      <description>${cdata(it.description)}</description>` : '',
        it.category ? `      <category>${esc(it.category)}</category>` : '',
        `      <pubDate>${new Date(it.date).toUTCString()}</pubDate>`,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(feed.name)} – ${SITE_NAME}</title>
    <link>${url('/news')}</link>
    <atom:link href="${self}" rel="self" type="application/rss+xml" />
    <description>${esc(feed.description || `${feed.name} – OtakuPulse`)}</description>
    <language>de</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${itemsXml}
  </channel>
</rss>`

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=600',
    },
  })
}
