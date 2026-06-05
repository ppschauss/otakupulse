// Hilfen für Metadaten (Open Graph / Twitter / canonical) und JSON-LD.
import type { Metadata } from 'next'
import { SITE_NAME, SITE_URL, url } from './site'
import { displayTitle, plainText } from './anime'

// Baut ein konsistentes Metadata-Objekt inkl. OG/Twitter/canonical.
export function pageMeta({
  title,
  description,
  path,
  image,
  noindex,
  canonical: canonicalOverride,
}: {
  title: string
  description?: string
  path: string
  image?: string | null
  noindex?: boolean | null
  canonical?: string | null
}): Metadata {
  const canonical = canonicalOverride || url(path)
  const images = image ? [{ url: image }] : undefined
  return {
    title,
    description,
    alternates: { canonical },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      type: 'website',
      locale: 'de_DE',
      images,
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title,
      description,
      images: image ? [image] : undefined,
    },
  }
}

// --- JSON-LD Builder -----------------------------------------------------

export function organizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    description: 'Deutschsprachige Anime-Datenbank',
  }
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: url(it.path),
    })),
  }
}

const FORMAT_TO_TYPE: Record<string, string> = { MOVIE: 'Movie' }

export function animeLd(anime: any) {
  const type = FORMAT_TO_TYPE[anime.format] || 'TVSeries'
  const studios = (Array.isArray(anime.studios) ? anime.studios : []).filter((s: any) => typeof s === 'object')
  const genres = (Array.isArray(anime.genres) ? anime.genres : []).filter((g: any) => typeof g === 'object')
  return {
    '@context': 'https://schema.org',
    '@type': type,
    name: displayTitle(anime),
    alternateName: [anime.titleRomaji, anime.titleEnglish, anime.titleNative].filter(Boolean),
    url: url(`/anime/${anime.slug}`),
    image: anime.coverImageUrl || undefined,
    description: plainText(anime.descriptionDe || anime.descriptionSource).slice(0, 400) || undefined,
    genre: genres.map((g: any) => g.name),
    numberOfEpisodes: anime.episodes || undefined,
    productionCompany: studios.map((s: any) => ({ '@type': 'Organization', name: s.name })),
    aggregateRating:
      typeof anime.averageScore === 'number' && anime.averageScore > 0
        ? { '@type': 'AggregateRating', ratingValue: anime.averageScore, bestRating: 100, ratingCount: anime.popularity || 1 }
        : undefined,
  }
}

export function personLd(person: any, names: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: names,
    url: url(`/person/${person.slug}`),
    image: person.imageUrl || undefined,
    birthDate: person.birthDate || undefined,
    birthPlace: person.birthPlace || undefined,
  }
}
