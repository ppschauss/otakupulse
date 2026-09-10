// Hilfen für Metadaten (Open Graph / Twitter / canonical) und JSON-LD.
import type { Metadata } from 'next'
import { SITE_NAME, SITE_URL, url } from './site'
import { displayTitle, plainText } from './anime'
import { streamingOffersOf, type OfferView } from './streaming'

/**
 * Robots-Direktiven für indexierbare Seiten.
 *
 * `max-image-preview:large` ist die technische Voraussetzung für **Google
 * Discover**: ohne die Direktive liefert Google keine großformatigen Bildkarten
 * aus und spielt die Seite dort faktisch nicht aus. Discover ist bei Publishern
 * inzwischen der größere Kanal als die klassische Websuche — für eine bildstarke
 * Anime-Seite mit täglich neuen Artikeln ist das der wichtigste Hebel überhaupt.
 *
 * `max-snippet:-1` und `max-video-preview:-1` heben die Längenbegrenzung für
 * Textausschnitte bzw. Video-Vorschauen auf (mehr Fläche in Snippets, Top Stories
 * und AI-Antworten).
 *
 * Bewusst auf der obersten Ebene statt unter `googleBot`, damit auch Bing und
 * andere Suchmaschinen die Direktiven sehen (ein einziges <meta name="robots">).
 */
const INDEXABLE_ROBOTS = {
  index: true,
  follow: true,
  'max-image-preview': 'large',
  'max-snippet': -1,
  'max-video-preview': -1,
} as const

// Baut ein konsistentes Metadata-Objekt inkl. OG/Twitter/canonical.
export function pageMeta({
  title,
  description,
  path,
  image,
  noindex,
  canonical: canonicalOverride,
  feed,
}: {
  title: string
  description?: string
  path: string
  image?: string | null
  noindex?: boolean | null
  canonical?: string | null
  // RSS-Feed für die automatische Discovery (<link rel="alternate">). Default: Haupt-Feed.
  // Damit findet JEDER Reader/Crawler den Feed über die Seite — Voraussetzung dafür,
  // dass Cloud-Reader (Feedly, Inoreader, …) ihn aufnehmen und cachen.
  feed?: { url: string; title: string } | null
}): Metadata {
  const canonical = canonicalOverride || url(path)
  const feedLink = feed === null ? null : (feed || { url: url('/feed.xml'), title: `${SITE_NAME} — News` })
  // Seitenspezifisches Bild explizit setzen; OHNE eins NICHT setzen, damit Next die
  // Datei-Konvention src/app/(frontend)/opengraph-image.tsx automatisch als og:image
  // UND twitter:image injiziert (mit korrektem, gehashtem Pfad). So hat jede Seite eine
  // Share-Vorschau, ohne dass wir eine URL hartkodieren (die sich pro Build ändert).
  const images = image ? [{ url: image }] : undefined
  return {
    title,
    description,
    alternates: {
      canonical,
      ...(feedLink ? { types: { 'application/rss+xml': [{ url: feedLink.url, title: feedLink.title }] } } : {}),
    },
    robots: noindex ? { index: false, follow: false } : INDEXABLE_ROBOTS,
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      type: 'website',
      locale: 'de_DE',
      ...(images ? { images } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(image ? { images: [image] } : {}),
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

/**
 * WatchAction pro Streaming-Angebot (Schema.org). Google nutzt das für die
 * „Ansehen"-Box; für uns ist es der maschinenlesbare Beleg, dass die Seite
 * echte, regionale Verfügbarkeit trägt — nicht nur Text.
 */
export function watchActionsLd(views: OfferView[]) {
  return views.map(({ offer }) => ({
    '@type': 'WatchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: offer.url,
      actionPlatform: ['http://schema.org/DesktopWebPlatform', 'http://schema.org/MobileWebPlatform'],
      inLanguage: 'de',
    },
    expectsAcceptanceOf: {
      '@type': 'Offer',
      category: offer.monetization === 'flatrate' ? 'subscription' : 'free',
      eligibleRegion: { '@type': 'Country', name: 'DE' },
    },
  }))
}

export function animeLd(anime: any) {
  const type = FORMAT_TO_TYPE[anime.format] || 'TVSeries'
  const studios = (Array.isArray(anime.studios) ? anime.studios : []).filter((s: any) => typeof s === 'object')
  const genres = (Array.isArray(anime.genres) ? anime.genres : []).filter((g: any) => typeof g === 'object')
  // Nur belegte Angebote (Deep-Link) — Legacy-Flags ohne Nachweis bleiben draußen.
  const offers = streamingOffersOf(anime).filter((v) => !v.offer.legacy)
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
    potentialAction: offers.length ? watchActionsLd(offers) : undefined,
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
