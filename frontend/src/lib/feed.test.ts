import { describe, it, expect } from 'vitest'
import { escapeXml, buildRssFeed } from './feed'

describe('escapeXml', () => {
  it('escaped alle XML-Sonderzeichen', () => {
    expect(escapeXml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &apos;')
  })
  it('lässt normalen Text unverändert', () => {
    expect(escapeXml('Naruto: Shippuden')).toBe('Naruto: Shippuden')
  })
})

describe('buildRssFeed', () => {
  const xml = buildRssFeed({
    title: 'OtakuPulse News',
    selfPath: '/feed.xml',
    linkPath: '/news',
    description: 'Aktuelle Anime-News',
    items: [
      {
        title: 'Titel mit & <Tag>',
        link: 'http://localhost:3001/news/a',
        date: '2026-01-15T10:00:00Z',
        description: 'Beschreibung',
      },
      { title: 'Ohne Datum', link: 'http://localhost:3001/news/b' },
    ],
  })

  it('erzeugt gültiges RSS-2.0-Gerüst', () => {
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<rss version="2.0"')
    expect(xml).toContain('<language>de-DE</language>')
    expect(xml).toContain('rel="self"')
  })
  it('escaped Item-Titel', () => {
    expect(xml).toContain('<title>Titel mit &amp; &lt;Tag&gt;</title>')
  })
  it('rendert pubDate als RFC-822 nur wenn ein Datum vorliegt', () => {
    expect(xml).toContain('<pubDate>Thu, 15 Jan 2026 10:00:00 GMT</pubDate>')
    // Zweites Item hat kein Datum → kein zweites pubDate
    expect(xml.match(/<pubDate>/g)?.length).toBe(1)
  })
  it('enthält ein <item> pro Eintrag', () => {
    expect(xml.match(/<item>/g)?.length).toBe(2)
  })
})
