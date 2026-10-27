/**
 * Adult-Policy — eine Quelle für „was ist nicht öffentlich und wo laufen keine Anzeigen".
 *
 * Hintergrund: Googles Publisher-Richtlinien verbieten sexuell explizite Inhalte auf
 * Seiten, die Anzeigen ausliefern (AdSense-Programmrichtlinien / Google Publisher
 * Policies, Abschnitt „Sexually explicit content"). OtakuPulse nimmt Hentai deshalb
 * komplett aus dem öffentlichen Bestand: Import filtert es weg, bestehende Datensätze
 * bleiben zwar in der DB (reversibel), ihre URLs leiten aber dauerhaft auf das
 * thematisch nächstliegende, jugendfreie Genre um — /genre/ecchi.
 *
 * Ecchi/Nudity sind NICHT explizit (Fanservice: Strandfolgen, Bikini, Panty-Shots) und
 * bleiben öffentlich — dort werden aber vorsichtshalber keine Anzeigen ausgeliefert,
 * weil Google „adult-themed" Inventar niedriger bewertet.
 */

/** Genre-Slugs, die komplett aus dem öffentlichen Bestand fliegen. */
export const BLOCKED_GENRE_SLUGS = ['hentai'] as const

/** Ziel aller Umleitungen entfernter Adult-Inhalte (thematisch nächstliegend). */
export const ADULT_REDIRECT_TARGET = '/genre/ecchi'

/** Genre-/Tag-Slugs, die zwar öffentlich sind, aber keine Anzeigen bekommen. */
export const NO_ADS_GENRE_SLUGS = ['ecchi'] as const
export const NO_ADS_TAG_SLUGS = ['nudity', 'sexual-content', 'erotica', 'boys-love', 'girls-love'] as const

/** Ist dieser Anime (Doc oder DTO) aus dem öffentlichen Bestand genommen? */
export function isBlockedAnime(anime: any): boolean {
  if (!anime) return false
  if (anime.isHentai === true) return true
  const genres: any[] = Array.isArray(anime.genres) ? anime.genres : []
  return genres.some((g) => typeof g === 'object' && BLOCKED_GENRE_SLUGS.includes(g?.slug))
}

/** Where-Baustein für Payload-Abfragen: nur öffentliche Titel. */
export const publicAnimeFilter = { isHentai: { not_equals: true } } as const

/** Gehört ein Artikel zu einem gesperrten Titel? (relatedAnime bei depth ≥ 1) */
export function isBlockedArticle(article: any): boolean {
  const related: any[] = Array.isArray(article?.relatedAnime) ? article.relatedAnime : []
  if (related.some((a) => typeof a === 'object' && isBlockedAnime(a))) return true
  // Fallback für Artikel ohne aufgelöste Relation: Titel/Teaser nennen das Genre.
  const text = `${article?.title || ''} ${article?.excerpt || ''}`.toLowerCase()
  return text.includes('hentai')
}

/**
 * Dürfen auf dieser Seite Anzeigen laufen? Konservativ: alles, was mit Adult-Themen
 * zu tun hat, bleibt anzeigenfrei — auch das öffentlich erlaubte Ecchi/Nudity.
 */
export function adsAllowedForAnime(anime: any): boolean {
  if (isBlockedAnime(anime)) return false
  const genres: any[] = Array.isArray(anime?.genres) ? anime.genres : []
  return !genres.some((g) => typeof g === 'object' && (NO_ADS_GENRE_SLUGS as readonly string[]).includes(g?.slug))
}

/**
 * Dürfen in diesem Beitrag Anzeigen laufen? Ein Artikel erbt die Bewertung der
 * Titel, die er behandelt: sobald einer davon Adult-nah ist (Hentai gesperrt,
 * Ecchi/Nudity anzeigenfrei), bleibt auch der Beitrag ohne Anzeigen.
 */
export function adsAllowedForArticle(article: any): boolean {
  if (isBlockedArticle(article)) return false
  const related: any[] = Array.isArray(article?.relatedAnime) ? article.relatedAnime : []
  return related.every((a) => typeof a !== 'object' || adsAllowedForAnime(a))
}

export const adsAllowedForGenre = (slug?: string | null): boolean =>
  !!slug && !(NO_ADS_GENRE_SLUGS as readonly string[]).includes(slug) && !(BLOCKED_GENRE_SLUGS as readonly string[]).includes(slug)

export const adsAllowedForTag = (slug?: string | null): boolean =>
  !!slug && !(NO_ADS_TAG_SLUGS as readonly string[]).includes(slug)
