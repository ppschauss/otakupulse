// Ähnliche Titel: Empfehlungen → Relationen → Genre-Fallback, dedupliziert, ohne sich selbst.
// Früher eigene Seite /aehnlich/<slug>; seit dem Merge Sektion der Anime-Seite.
export async function similarAnime(payload: any, anime: any, limit = 24): Promise<any[]> {
  const seen = new Set<any>([anime.id])
  const out: any[] = []
  const push = (a: any) => {
    if (a && typeof a === 'object' && a.slug && !seen.has(a.id)) {
      seen.add(a.id)
      out.push(a)
    }
  }
  for (const r of Array.isArray(anime.recommendations) ? anime.recommendations : []) push(r)
  for (const r of Array.isArray(anime.relations) ? anime.relations : []) push(r?.anime)

  if (out.length < limit) {
    const genreIds = (Array.isArray(anime.genres) ? anime.genres : [])
      .map((g: any) => (g && typeof g === 'object' ? g.id : g))
      .filter(Boolean)
    if (genreIds.length) {
      const more = await payload.find({
        collection: 'anime',
        where: { and: [{ genres: { in: genreIds } }, { id: { not_equals: anime.id } }, { isHentai: { not_equals: true } }] },
        sort: '-popularity',
        limit: 40,
        depth: 0,
      })
      for (const a of more.docs as any[]) {
        if (out.length >= limit) break
        push(a)
      }
    }
  }
  return out.slice(0, limit)
}
