// Gemeinsame Aggregation für SEO-Hub-Seiten (Studio, Tag, Season, …):
// Top-Genres/Studios/Tags aus einer Anime-Menge + genre-/entitätsrelevante News.
import type { Payload } from 'payload'

export type Agg = { name: string; slug: string; n: number }
export type HubExtras = { topGenres: Agg[]; topStudios: Agg[]; topTags: Agg[]; news: any[] }

export async function hubExtras(payload: Payload, where: any, opts: { news?: boolean } = {}): Promise<HubExtras> {
  const wantNews = opts.news !== false
  const sample = await payload.find({
    collection: 'anime',
    where,
    sort: '-popularity',
    limit: 80,
    depth: 1,
    select: { genres: true, studios: true, tags: true } as any,
  })

  const g = new Map<any, Agg>()
  const s = new Map<any, Agg>()
  const t = new Map<any, Agg>()
  const ids: any[] = []

  for (const a of sample.docs as any[]) {
    ids.push(a.id)
    for (const x of a.genres || []) {
      if (x && typeof x === 'object' && x.slug) {
        const e = g.get(x.id) || { name: x.name, slug: x.slug, n: 0 }
        e.n++
        g.set(x.id, e)
      }
    }
    for (const x of a.studios || []) {
      if (x && typeof x === 'object' && x.slug) {
        const e = s.get(x.id) || { name: x.name, slug: x.slug, n: 0 }
        e.n++
        s.set(x.id, e)
      }
    }
    for (const x of a.tags || []) {
      const tag = x?.tag
      if (tag && typeof tag === 'object' && tag.slug) {
        const e = t.get(tag.id) || { name: tag.name, slug: tag.slug, n: 0 }
        e.n++
        t.set(tag.id, e)
      }
    }
  }

  const top = (m: Map<any, Agg>, n: number) => [...m.values()].sort((a, b) => b.n - a.n).slice(0, n)

  const news = ids.length && wantNews
    ? await payload.find({
        collection: 'articles',
        where: { and: [{ relatedAnime: { in: ids } }, { _status: { equals: 'published' } }] },
        sort: '-publishDate',
        limit: 6,
        depth: 0,
      })
    : { docs: [] as any[] }

  return { topGenres: top(g, 10), topStudios: top(s, 10), topTags: top(t, 15), news: news.docs }
}
