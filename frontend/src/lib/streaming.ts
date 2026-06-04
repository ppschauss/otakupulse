/**
 * Streaming-Anbieter ("Wer streamt es?").
 *
 * Quellen der Verfügbarkeit:
 *  - AniList `externalLinks` (roher Plattform-Name + URL) — liefert Outbound-Links.
 *  - JustWatch (DE-Aggregator) — füllt das normalisierte Feld `streamingProviders`
 *    (kanonische Slugs) für alle Anbieter, auch ohne AniList-Link.
 *
 * Abgefragt/gefiltert wird über `streamingProviders` (kanonische Slugs). Die
 * „Wo streamen?"-Box verlinkt nach Möglichkeit den konkreten externalLink, sonst
 * die Anbieter-Startseite.
 */

export type StreamingProvider = {
  slug: string
  name: string
  /** Rohe Namen aus AniList (`site`) UND JustWatch (`clearName`), die hierauf zeigen. */
  aliases: string[]
  color?: string
  /** Startseite (Fallback-Link, wenn kein konkreter externalLink existiert). */
  homepage?: string
  /** Kurzbeschreibung (DE, SEO). */
  blurb?: string
}

export const STREAMING_PROVIDERS: StreamingProvider[] = [
  {
    slug: 'crunchyroll',
    name: 'Crunchyroll',
    aliases: ['Crunchyroll', 'Crunchyroll Amazon Channel', 'Wakanim'],
    color: '#f47521',
    homepage: 'https://www.crunchyroll.com',
    blurb:
      'Der größte Anime-Streamingdienst weltweit — riesiger Simulcast-Katalog, viele Titel mit deutschem Sub und Dub.',
  },
  {
    slug: 'netflix',
    name: 'Netflix',
    aliases: ['Netflix', 'Netflix basic with Ads'],
    color: '#e50914',
    homepage: 'https://www.netflix.com',
    blurb: 'Netflix produziert und lizenziert Anime mit oft hochwertigen deutschen Synchronfassungen.',
  },
  {
    slug: 'amazon-prime-video',
    name: 'Amazon Prime Video',
    aliases: ['Amazon Prime Video', 'Prime Video'],
    color: '#00a8e1',
    homepage: 'https://www.primevideo.com',
    blurb: 'Anime im Prime-Abo sowie exklusive Lizenztitel — viele mit deutscher Tonspur.',
  },
  {
    slug: 'disney-plus',
    name: 'Disney+',
    aliases: ['Disney Plus', 'Disney+'],
    color: '#113ccf',
    homepage: 'https://www.disneyplus.com',
    blurb: 'Disney+ baut sein Anime-Angebot (u. a. via Star) kontinuierlich aus.',
  },
  {
    slug: 'wow',
    name: 'WOW',
    aliases: ['WOW', 'WOW Presents Plus', 'Sky Go', 'Sky'],
    color: '#00f5a0',
    homepage: 'https://www.wowtv.de',
    blurb: 'WOW (Sky) führt ausgewählte Anime-Serien und -Filme.',
  },
  {
    slug: 'joyn',
    name: 'Joyn',
    aliases: ['Joyn', 'Joyn Plus', 'ProSieben', 'ProSiebenMAXX'],
    color: '#fa1e5a',
    homepage: 'https://www.joyn.de',
    blurb: 'Joyn / ProSieben MAXX zeigt Anime im Free- und Plus-Angebot.',
  },
  {
    slug: 'rtl-plus',
    name: 'RTL+',
    aliases: ['RTL+', 'RTL Plus', 'RTLplus'],
    color: '#e8000d',
    homepage: 'https://plus.rtl.de',
    blurb: 'RTL+ bündelt ein wachsendes Anime-Angebot mit deutschen Fassungen.',
  },
  {
    slug: 'anime-on-demand',
    name: 'Anime on Demand',
    aliases: ['Anime on Demand', 'Anime-on-Demand', 'AoD'],
    color: '#ff5e00',
    homepage: 'https://www.anime-on-demand.de',
    blurb: 'Deutscher Anime-Spezialist (Sub & Dub).',
  },
  {
    slug: 'paramount-plus',
    name: 'Paramount+',
    aliases: ['Paramount Plus', 'Paramount+', 'Paramount Plus Apple TV Channel'],
    color: '#0064ff',
    homepage: 'https://www.paramountplus.com',
  },
  {
    slug: 'apple-tv',
    name: 'Apple TV',
    aliases: ['Apple TV Plus', 'Apple TV+', 'Apple TV'],
    color: '#000000',
    homepage: 'https://tv.apple.com',
  },
  {
    slug: 'magenta-tv',
    name: 'MagentaTV',
    aliases: ['Magenta TV', 'MagentaTV'],
    color: '#e20074',
    homepage: 'https://www.telekom.de/magenta-tv',
  },
  { slug: 'hidive', name: 'HIDIVE', aliases: ['HIDIVE'], color: '#00b4e3', homepage: 'https://www.hidive.com' },
  { slug: 'hulu', name: 'Hulu', aliases: ['Hulu'], color: '#1ce783', homepage: 'https://www.hulu.com' },
  { slug: 'bilibili', name: 'Bilibili', aliases: ['Bilibili TV', 'Bilibili'], color: '#00a1d6', homepage: 'https://www.bilibili.tv' },
  { slug: 'iqiyi', name: 'iQIYI', aliases: ['iQ', 'iQIYI', 'iQiyi'], color: '#00be06', homepage: 'https://www.iq.com' },
  { slug: 'wetv', name: 'WeTV', aliases: ['WeTV'], color: '#ff6f00', homepage: 'https://wetv.vip' },
  { slug: 'adult-swim', name: 'Adult Swim', aliases: ['Adult Swim'], color: '#000000', homepage: 'https://www.adultswim.com' },
  { slug: 'tencent', name: 'Tencent Video', aliases: ['Tencent Video'], color: '#0052d9', homepage: 'https://v.qq.com' },
]

const BY_SLUG = new Map(STREAMING_PROVIDERS.map((p) => [p.slug, p]))
const BY_ALIAS = new Map<string, StreamingProvider>()
for (const p of STREAMING_PROVIDERS) {
  BY_ALIAS.set(p.name.toLowerCase(), p)
  for (const a of p.aliases) BY_ALIAS.set(a.toLowerCase(), p)
}

export const providerBySlug = (slug: string): StreamingProvider | undefined => BY_SLUG.get(slug)
export const providerByName = (name?: string | null): StreamingProvider | undefined =>
  name ? BY_ALIAS.get(name.toLowerCase()) : undefined

export const PROVIDER_SLUGS = STREAMING_PROVIDERS.map((p) => p.slug)
/** Optionen für das Payload-Select-Feld `streamingProviders`. */
export const PROVIDER_OPTIONS = STREAMING_PROVIDERS.map((p) => ({ label: p.name, value: p.slug }))

/**
 * Anbieter eines Anime aus dem normalisierten Feld `streamingProviders` (Slugs),
 * jeweils mit Outbound-URL: konkreter externalLink falls vorhanden, sonst Startseite.
 * Reihenfolge wie im Register (wichtigste zuerst).
 */
export function streamingProvidersOf(anime: any): { provider: StreamingProvider; url: string }[] {
  const slugs: string[] = Array.isArray(anime?.streamingProviders) ? anime.streamingProviders : []
  const links = Array.isArray(anime?.externalLinks) ? anime.externalLinks : []
  const urlFor = (p: StreamingProvider): string => {
    const hit = links.find((l: any) => providerByName(l?.platform)?.slug === p.slug && l?.url)
    return hit?.url || p.homepage || '#'
  }
  return slugs
    .map((s) => providerBySlug(s))
    .filter((p): p is StreamingProvider => !!p)
    .sort((a, b) => PROVIDER_SLUGS.indexOf(a.slug) - PROVIDER_SLUGS.indexOf(b.slug))
    .map((p) => ({ provider: p, url: urlFor(p) }))
}
