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
  /** Logo-URL (Wikimedia Commons, legal hotlinkbar). Optional — sonst Farb-Fallback. */
  logo?: string
  /** Längerer Fließtext: Unternehmen + Beitrag zur Anime-Welt (DE, SEO). */
  about?: string
}

/** Wikimedia-Commons-Logo (CC) als hotlinkbare URL. */
const commons = (file: string) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=240`

export const STREAMING_PROVIDERS: StreamingProvider[] = [
  {
    slug: 'crunchyroll',
    name: 'Crunchyroll',
    aliases: ['Crunchyroll', 'Crunchyroll Amazon Channel', 'Wakanim'],
    color: '#f47521',
    homepage: 'https://www.crunchyroll.com',
    logo: commons('Crunchyroll_Logo.svg'),
    blurb:
      'Der größte Anime-Streamingdienst weltweit — riesiger Simulcast-Katalog, viele Titel mit deutschem Sub und Dub.',
    about:
      'Crunchyroll startete 2006 und gehört heute zu Sony (zusammengeführt mit Funimation). Der Dienst hat das legale Simulcast-Streaming geprägt — also die Veröffentlichung neuer Episoden kurz nach der japanischen Ausstrahlung — und betreibt zudem eigene Lizenz-Synchronisationen, Kino-Auswertungen und Merchandise. Damit ist Crunchyroll für viele der zentrale Anlaufpunkt für aktuelle Anime-Seasons.',
  },
  {
    slug: 'netflix',
    name: 'Netflix',
    aliases: ['Netflix', 'Netflix basic with Ads'],
    color: '#e50914',
    homepage: 'https://www.netflix.com',
    logo: commons('Netflix_2015_logo.svg'),
    blurb: 'Netflix produziert und lizenziert Anime mit oft hochwertigen deutschen Synchronfassungen.',
    about:
      'Netflix investiert seit Jahren stark in Anime: teils als reiner Lizenznehmer, teils als Co-Produzent eigener „Netflix Original"-Anime mit namhaften Studios. Charakteristisch sind die meist vollständig vertonten deutschen Synchronfassungen und der gleichzeitige weltweite Release ganzer Staffeln statt wöchentlicher Episoden.',
  },
  {
    slug: 'amazon-prime-video',
    name: 'Amazon Prime Video',
    aliases: ['Amazon Prime Video', 'Prime Video'],
    color: '#00a8e1',
    homepage: 'https://www.primevideo.com',
    logo: commons('Amazon_Prime_Video_logo_(2024).svg'),
    blurb: 'Anime im Prime-Abo sowie exklusive Lizenztitel — viele mit deutscher Tonspur.',
    about:
      'Amazon Prime Video bündelt Anime im normalen Prime-Abo und sichert sich regelmäßig exklusive Lizenztitel. In der Vergangenheit betrieb Amazon mit „Anime Strike" sogar einen eigenen Anime-Kanal; heute laufen die Titel direkt in der Prime-Bibliothek, viele davon mit deutscher Tonspur.',
  },
  {
    slug: 'disney-plus',
    name: 'Disney+',
    aliases: ['Disney Plus', 'Disney+'],
    color: '#113ccf',
    homepage: 'https://www.disneyplus.com',
    logo: commons('Disney+_2024.svg'),
    blurb: 'Disney+ baut sein Anime-Angebot (u. a. via Star) kontinuierlich aus.',
    about:
      'Disney+ baut sein Anime-Angebot — in Europa vor allem über die Marke „Star" — gezielt aus und sicherte sich Partnerschaften mit japanischen Verlagen und Studios für exklusive Titel. Damit ist der Dienst zu einem ernstzunehmenden Player im Wettbewerb um hochkarätige Anime-Lizenzen geworden.',
  },
  {
    slug: 'wow',
    name: 'WOW',
    aliases: ['WOW', 'WOW Presents Plus', 'Sky Go', 'Sky'],
    color: '#00f5a0',
    homepage: 'https://www.wowtv.de',
    blurb: 'WOW (Sky) führt ausgewählte Anime-Serien und -Filme.',
    about:
      'WOW ist der Streamingdienst von Sky Deutschland und führt neben Serien und Filmen auch ein ausgewähltes Anime-Angebot. Der Schwerpunkt liegt eher auf populären Titeln und Filmen als auf der breiten Simulcast-Abdeckung.',
  },
  {
    slug: 'joyn',
    name: 'Joyn',
    aliases: ['Joyn', 'Joyn Plus', 'ProSieben', 'ProSiebenMAXX'],
    color: '#fa1e5a',
    homepage: 'https://www.joyn.de',
    logo: commons('Joyn_logo.svg'),
    blurb: 'Joyn / ProSieben MAXX zeigt Anime im Free- und Plus-Angebot.',
    about:
      'Joyn ist die Streaming-Plattform der ProSiebenSat.1-Gruppe und eng mit dem Sender ProSieben MAXX verbunden, der im deutschen Free-TV eine lange Tradition als Anime-Heimat hat. Viele dort ausgestrahlte Serien sind anschließend im Free- und Plus-Angebot von Joyn abrufbar — häufig in deutscher Synchronfassung.',
  },
  {
    slug: 'rtl-plus',
    name: 'RTL+',
    aliases: ['RTL+', 'RTL Plus', 'RTLplus'],
    color: '#e8000d',
    homepage: 'https://plus.rtl.de',
    logo: commons('RTL+_Logo_2021.svg'),
    blurb: 'RTL+ bündelt ein wachsendes Anime-Angebot mit deutschen Fassungen.',
    about:
      'RTL+ ist das Streaming-Angebot der RTL-Gruppe und hat sein Anime-Portfolio in den letzten Jahren spürbar ausgebaut — inklusive Simulcasts und deutscher Synchronfassungen. Damit positioniert sich RTL+ zunehmend als heimischer Anbieter für Anime-Fans in Deutschland.',
  },
  {
    slug: 'anime-on-demand',
    name: 'Anime on Demand',
    aliases: ['Anime on Demand', 'Anime-on-Demand', 'AoD'],
    color: '#ff5e00',
    homepage: 'https://www.anime-on-demand.de',
    logo: commons('Anime on Demand Logo.png'),
    blurb: 'Deutscher Anime-Spezialist (Sub & Dub).',
    about:
      'Anime on Demand war einer der ersten auf Anime spezialisierten Streamingdienste im deutschsprachigen Raum und bot Titel sowohl im Originalton mit Untertiteln als auch in deutscher Synchronfassung an. Als Nischenanbieter richtete sich der Dienst gezielt an die deutsche Fan-Community.',
  },
  {
    slug: 'paramount-plus',
    name: 'Paramount+',
    aliases: ['Paramount Plus', 'Paramount+', 'Paramount Plus Apple TV Channel'],
    color: '#0064ff',
    homepage: 'https://www.paramountplus.com',
    logo: commons('Paramount Plus.svg'),
    blurb: 'Paramount+ führt ausgewählte Anime-Titel im internationalen Katalog.',
    about:
      'Paramount+ ist der Streamingdienst des US-Medienkonzerns Paramount und bietet neben Filmen und Serien ein wachsendes, regional unterschiedliches Anime-Angebot. Der Schwerpunkt liegt auf populären Lizenztiteln.',
  },
  {
    slug: 'apple-tv',
    name: 'Apple TV',
    aliases: ['Apple TV Plus', 'Apple TV+', 'Apple TV'],
    color: '#000000',
    homepage: 'https://tv.apple.com',
    logo: commons('Apple_TV_Plus_Logo.svg'),
    blurb: 'Über Apple TV lassen sich Anime kaufen, leihen oder per Kanal streamen.',
  },
  {
    slug: 'magenta-tv',
    name: 'MagentaTV',
    aliases: ['Magenta TV', 'MagentaTV'],
    color: '#e20074',
    homepage: 'https://www.telekom.de/magenta-tv',
    blurb: 'MagentaTV der Telekom bündelt Anime über zubuchbare Kanäle und Mediatheken.',
  },
  {
    slug: 'hidive',
    name: 'HIDIVE',
    aliases: ['HIDIVE'],
    color: '#00b4e3',
    homepage: 'https://www.hidive.com',
    blurb: 'Auf Anime spezialisierter Dienst mit Simulcasts und vielen älteren Titeln.',
    about:
      'HIDIVE ist ein auf Anime spezialisierter Streamingdienst aus dem Umfeld von Sentai Filmworks und punktet mit Simulcasts sowie einem tiefen Katalog älterer und nischiger Titel, die anderswo schwer zu finden sind.',
  },
  { slug: 'hulu', name: 'Hulu', aliases: ['Hulu'], color: '#1ce783', homepage: 'https://www.hulu.com', logo: commons('Hulu_logo_(2018).svg'), blurb: 'US-Streamingdienst mit umfangreichem Anime-Lizenzkatalog.' },
  { slug: 'bilibili', name: 'Bilibili', aliases: ['Bilibili TV', 'Bilibili'], color: '#00a1d6', homepage: 'https://www.bilibili.tv', blurb: 'Große chinesische Plattform für Anime und chinesische Animation (Donghua).' },
  { slug: 'iqiyi', name: 'iQIYI', aliases: ['iQ', 'iQIYI', 'iQiyi'], color: '#00be06', homepage: 'https://www.iq.com', blurb: 'Chinesischer Streamingdienst mit Anime und Donghua, teils mit Simulcasts.' },
  { slug: 'wetv', name: 'WeTV', aliases: ['WeTV'], color: '#ff6f00', homepage: 'https://wetv.vip', blurb: 'Internationaler Tencent-Dienst mit Anime und chinesischer Animation.' },
  {
    slug: 'adult-swim',
    name: 'Adult Swim',
    aliases: ['Adult Swim', 'Toonami'],
    color: '#000000',
    homepage: 'https://www.adultswim.com',
    logo: commons('Adult_Swim_2003_logo.svg'),
    blurb: 'US-Spätprogramm, das mit dem Block „Toonami" Anime im Westen mitprägte.',
    about:
      'Adult Swim ist ein US-amerikanischer Programmblock, der mit „Toonami" maßgeblich dazu beitrug, Anime im englischsprachigen Raum populär zu machen, und inzwischen auch eigene Anime-Produktionen in Auftrag gibt.',
  },
  { slug: 'tencent', name: 'Tencent Video', aliases: ['Tencent Video'], color: '#0052d9', homepage: 'https://v.qq.com', blurb: 'Chinesische Plattform mit großem Donghua- und Anime-Angebot.' },
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
