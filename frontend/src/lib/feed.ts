// Gemeinsame Helfer für RSS-2.0-Feeds (News, Genre, Simulcast).
import { SITE_NAME, url } from './site'

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export type FeedItem = {
  title: string
  link: string
  date?: string | Date | null
  description?: string | null
}

export function buildRssFeed(opts: {
  title: string
  selfPath: string // Pfad des Feeds selbst, z. B. /feed.xml
  linkPath: string // Pfad der zugehörigen HTML-Seite, z. B. /news
  description: string
  items: FeedItem[]
}): string {
  const items = opts.items
    .map((it) => {
      const date = it.date ? new Date(it.date).toUTCString() : ''
      return `    <item>
      <title>${escapeXml(it.title)}</title>
      <link>${escapeXml(it.link)}</link>
      <guid isPermaLink="true">${escapeXml(it.link)}</guid>
      ${date ? `<pubDate>${date}</pubDate>` : ''}
      ${it.description ? `<description>${escapeXml(it.description)}</description>` : ''}
    </item>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(opts.title)}</title>
    <link>${escapeXml(url(opts.linkPath))}</link>
    <atom:link href="${escapeXml(url(opts.selfPath))}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(opts.description)}</description>
    <language>de-DE</language>
    <generator>${escapeXml(SITE_NAME)}</generator>
${items}
  </channel>
</rss>`
}

export function rssResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
