import { getPayload } from 'payload'
import config from '@payload-config'
import { SITE_NAME, url } from '@/lib/site'
import { displayTitle } from '@/lib/anime'
import { buildRssFeed, rssResponse } from '@/lib/feed'

export const revalidate = 600 // wie der Kalender: alle 10 Min

const DAY = 24 * 60 * 60 * 1000

export async function GET() {
  const payload = await getPayload({ config })
  const now = Date.now()
  const from = new Date(now - 21 * DAY).toISOString() // letzte 3 Wochen
  const to = new Date(now + 7 * DAY).toISOString() // + kommende Woche

  const { docs } = await payload.find({
    collection: 'episodes',
    where: { and: [{ airDate: { greater_than_equal: from } }, { airDate: { less_than: to } }] },
    sort: '-airDate', // neueste/anstehende zuerst
    limit: 80,
    depth: 1, // Anime-Relation auflösen (Titel + Slug)
  })

  const items = (docs as any[])
    .filter((ep) => ep.anime && typeof ep.anime === 'object')
    .map((ep) => {
      const a = ep.anime
      const title = `${displayTitle(a)} – Folge ${ep.number}`
      const epTitle = ep.titleGerman || ep.titleEnglish || ep.titleRomaji
      return {
        title,
        link: url(`/anime/${a.slug}/episoden`),
        date: ep.airDate,
        description: epTitle && epTitle !== title ? epTitle : null,
      }
    })

  const xml = buildRssFeed({
    title: `${SITE_NAME} — Simulcast-Kalender`,
    selfPath: '/kalender/feed.xml',
    linkPath: '/kalender',
    description: 'Neue und anstehende Anime-Episoden im Simulcast — als RSS-Feed.',
    items,
  })

  return rssResponse(xml)
}
