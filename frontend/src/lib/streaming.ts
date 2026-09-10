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
  /** DE = in Deutschland nutzbarer Dienst (Listen-Seiten, Sitemap). INTL = nur informativ (Hulu, Bilibili …). */
  region?: 'DE' | 'INTL'
}

/** Wikimedia-Commons-Logo (CC) als hotlinkbare URL. */
const commons = (file: string) =>
  `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=240`

export const STREAMING_PROVIDERS: StreamingProvider[] = [
  {
    slug: 'crunchyroll',
    name: 'Crunchyroll',
    aliases: ['Crunchyroll', 'Crunchyroll Amazon Channel', 'Wakanim'],
    region: 'DE',
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
    region: 'DE',
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
    region: 'DE',
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
    region: 'DE',
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
    region: 'DE',
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
    region: 'DE',
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
    aliases: ['RTL+', 'RTL Plus', 'RTLplus', 'RTL+ Max Amazon Channel'],
    region: 'DE',
    color: '#e8000d',
    homepage: 'https://plus.rtl.de',
    logo: commons('RTL+_Logo_2021.svg'),
    blurb: 'RTL+ bündelt ein wachsendes Anime-Angebot mit deutschen Fassungen.',
    about:
      'RTL+ ist das Streaming-Angebot der RTL-Gruppe und hat sein Anime-Portfolio in den letzten Jahren spürbar ausgebaut — inklusive Simulcasts und deutscher Synchronfassungen. Damit positioniert sich RTL+ zunehmend als heimischer Anbieter für Anime-Fans in Deutschland.',
  },
  {
    slug: 'aniverse',
    name: 'Aniverse',
    aliases: ['Aniverse', 'Aniverse Amazon Channel'],
    region: 'DE',
    color: '#ff2d55',
    homepage: 'https://www.amazon.de/channels/aniverse',
    blurb: 'Anime-Channel bei Amazon Prime Video — viele Klassiker mit deutscher Synchro.',
    about:
      'Aniverse ist ein zubuchbarer Anime-Channel innerhalb von Amazon Prime Video, hinter dem die deutschen Publisher KSM Anime, peppermint anime und Nipponart stehen. Der Katalog besteht überwiegend aus lizenzierten Serien und Filmen mit deutscher Synchronfassung — darunter viele Titel, die bei den großen Diensten fehlen.',
  },
  {
    slug: 'adn',
    name: 'ADN',
    aliases: ['ADN', 'Animation Digital Network', 'Anime Digital Network', 'Anime Digital Network Amazon Channel'],
    region: 'DE',
    color: '#00c2ff',
    homepage: 'https://animationdigitalnetwork.com/de',
    blurb: 'Animation Digital Network — europäischer Anime-Dienst, seit 2024 auch in Deutschland.',
    about:
      'ADN (Animation Digital Network) ist ein auf Anime spezialisierter Streamingdienst aus Frankreich, der seit 2024 auch in Deutschland verfügbar ist — direkt und als Channel bei Amazon Prime Video. Der Fokus liegt auf Simulcasts und einem Katalog, der sich teilweise deutlich von Crunchyroll unterscheidet.',
  },
  {
    slug: 'toggo',
    name: 'Toggo',
    aliases: ['Toggo', 'TOGGO'],
    region: 'DE',
    color: '#ffcc00',
    homepage: 'https://www.toggo.de',
    blurb: 'Kostenlose Mediathek von SUPER RTL — Kinder- und Familien-Anime mit deutscher Synchro.',
  },
  {
    slug: 'anime-on-demand',
    name: 'Anime on Demand',
    aliases: ['Anime on Demand', 'Anime-on-Demand', 'AoD'],
    region: 'DE',
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
    region: 'DE',
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
    region: 'DE',
    color: '#000000',
    homepage: 'https://tv.apple.com',
    logo: commons('Apple_TV_Plus_Logo.svg'),
    blurb: 'Über Apple TV lassen sich Anime kaufen, leihen oder per Kanal streamen.',
  },
  {
    slug: 'magenta-tv',
    name: 'MagentaTV',
    aliases: ['Magenta TV', 'MagentaTV'],
    region: 'DE',
    color: '#e20074',
    homepage: 'https://www.telekom.de/magenta-tv',
    blurb: 'MagentaTV der Telekom bündelt Anime über zubuchbare Kanäle und Mediatheken.',
  },
  {
    slug: 'hidive',
    name: 'HIDIVE',
    aliases: ['HIDIVE'],
    region: 'INTL',
    color: '#00b4e3',
    homepage: 'https://www.hidive.com',
    blurb: 'Auf Anime spezialisierter Dienst mit Simulcasts und vielen älteren Titeln.',
    about:
      'HIDIVE ist ein auf Anime spezialisierter Streamingdienst aus dem Umfeld von Sentai Filmworks und punktet mit Simulcasts sowie einem tiefen Katalog älterer und nischiger Titel, die anderswo schwer zu finden sind.',
  },
  { slug: 'hulu', name: 'Hulu', aliases: ['Hulu'], region: 'INTL', color: '#1ce783', homepage: 'https://www.hulu.com', logo: commons('Hulu_logo_(2018).svg'), blurb: 'US-Streamingdienst mit umfangreichem Anime-Lizenzkatalog.' },
  { slug: 'bilibili', name: 'Bilibili', aliases: ['Bilibili TV', 'Bilibili'], region: 'INTL', color: '#00a1d6', homepage: 'https://www.bilibili.tv', blurb: 'Große chinesische Plattform für Anime und chinesische Animation (Donghua).' },
  { slug: 'iqiyi', name: 'iQIYI', aliases: ['iQ', 'iQIYI', 'iQiyi'], region: 'INTL', color: '#00be06', homepage: 'https://www.iq.com', blurb: 'Chinesischer Streamingdienst mit Anime und Donghua, teils mit Simulcasts.' },
  { slug: 'wetv', name: 'WeTV', aliases: ['WeTV'], region: 'INTL', color: '#ff6f00', homepage: 'https://wetv.vip', blurb: 'Internationaler Tencent-Dienst mit Anime und chinesischer Animation.' },
  {
    slug: 'adult-swim',
    name: 'Adult Swim',
    aliases: ['Adult Swim', 'Toonami'],
    region: 'INTL',
    color: '#000000',
    homepage: 'https://www.adultswim.com',
    logo: commons('Adult_Swim_2003_logo.svg'),
    blurb: 'US-Spätprogramm, das mit dem Block „Toonami" Anime im Westen mitprägte.',
    about:
      'Adult Swim ist ein US-amerikanischer Programmblock, der mit „Toonami" maßgeblich dazu beitrug, Anime im englischsprachigen Raum populär zu machen, und inzwischen auch eigene Anime-Produktionen in Auftrag gibt.',
  },
  { slug: 'tencent', name: 'Tencent Video', aliases: ['Tencent Video'], region: 'INTL', color: '#0052d9', homepage: 'https://v.qq.com', blurb: 'Chinesische Plattform mit großem Donghua- und Anime-Angebot.' },
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
/** Slugs der in Deutschland nutzbaren Anbieter — Basis für Listen-Seiten und Sitemap. */
export const DE_PROVIDER_SLUGS = STREAMING_PROVIDERS.filter((p) => p.region === 'DE').map((p) => p.slug)

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

// --- Anbieter-genaue Angebote (streamingOffers) -------------------------------

export type Monetization = 'flatrate' | 'ads' | 'free'

export const MONETIZATION_LABELS: Record<Monetization, string> = {
  flatrate: 'Im Abo',
  ads: 'Kostenlos (mit Werbung)',
  free: 'Kostenlos',
}

export type StreamingOffer = {
  provider: string
  url: string
  monetization: Monetization | null
  audio: string[]
  subs: string[]
  seasons?: number | null
  episodes?: number | null
  availableTo?: string | null
  firstSeenAt?: string | null
  lastSeenAt?: string | null
  /** true = aus den Legacy-Flags abgeleitet: kein Deep-Link-Nachweis, keine Sprachen. */
  legacy?: boolean
}

export type OfferView = { provider: StreamingProvider; offer: StreamingOffer }

/** "de,ja" → ['de','ja'] (leer/null → []). */
export const splitCsv = (s?: string | null): string[] =>
  (s || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

const MONETIZATIONS: readonly string[] = ['flatrate', 'ads', 'free']
const providerRank = (slug: string) => PROVIDER_SLUGS.indexOf(slug)

/**
 * Alle Angebote eines Anime, sortiert wie das Register (wichtigste Anbieter zuerst).
 * Solange ein Titel noch keine `streamingOffers` hat (Backfill läuft rollierend),
 * fällt die Funktion auf die alten Flags + AniList-Link zurück — markiert als
 * `legacy`, damit die UI keine Sprach-/Episodenangaben vortäuscht.
 */
export function streamingOffersOf(anime: any): OfferView[] {
  const raw: any[] = Array.isArray(anime?.streamingOffers) ? anime.streamingOffers : []
  const views: OfferView[] = []
  for (const o of raw) {
    const provider = providerBySlug(o?.provider)
    if (!provider || !o?.url) continue
    views.push({
      provider,
      offer: {
        provider: provider.slug,
        url: o.url,
        monetization: MONETIZATIONS.includes(o.monetization) ? (o.monetization as Monetization) : null,
        audio: splitCsv(o.audio),
        subs: splitCsv(o.subs),
        seasons: o.seasons ?? null,
        episodes: o.episodes ?? null,
        availableTo: o.availableTo ?? null,
        firstSeenAt: o.firstSeenAt ?? null,
        lastSeenAt: o.lastSeenAt ?? null,
      },
    })
  }
  if (views.length) {
    return views.sort((a, b) => providerRank(a.provider.slug) - providerRank(b.provider.slug))
  }
  return streamingProvidersOf(anime).map(({ provider, url }) => ({
    provider,
    offer: { provider: provider.slug, url, monetization: null, audio: [], subs: [], legacy: true },
  }))
}

/** Angebote nach Anbieter bündeln (z. B. Crunchyroll Abo + Crunchyroll Free). */
export function groupOffersByProvider(views: OfferView[]): { provider: StreamingProvider; offers: StreamingOffer[] }[] {
  const out: { provider: StreamingProvider; offers: StreamingOffer[] }[] = []
  for (const v of views) {
    const g = out.find((x) => x.provider.slug === v.provider.slug)
    if (g) g.offers.push(v.offer)
    else out.push({ provider: v.provider, offers: [v.offer] })
  }
  return out
}

export type StreamingSummary = {
  hasStream: boolean
  providerNames: string[]
  hasDeDub: boolean
  hasDeSub: boolean
  hasFree: boolean
  /** Mindestens ein Angebot ist jünger als 30 Tage. */
  isNew: boolean
  checkedAt: string | null
  legacy: boolean
}

const NEW_WINDOW_MS = 30 * 86400_000

/** Kompakte Kennzahlen für Title/Description/Intro-Satz der Anime-Seite. */
export function streamingSummary(anime: any, now: Date = new Date()): StreamingSummary {
  const views = streamingOffersOf(anime)
  const legacy = views.length > 0 && views.every((v) => v.offer.legacy)
  const langs: string[] = Array.isArray(anime?.availableLanguages) ? anime.availableLanguages : []
  const hasDeDub = legacy ? langs.includes('de-dub') : views.some((v) => v.offer.audio.includes('de'))
  const hasDeSub = legacy ? langs.includes('de-sub') : views.some((v) => v.offer.subs.includes('de'))
  const isNew = views.some((v) => {
    const t = v.offer.firstSeenAt ? Date.parse(v.offer.firstSeenAt) : NaN
    return Number.isFinite(t) && now.getTime() - t <= NEW_WINDOW_MS
  })
  return {
    hasStream: views.length > 0,
    providerNames: groupOffersByProvider(views).map((g) => g.provider.name),
    hasDeDub,
    hasDeSub,
    hasFree: views.some((v) => v.offer.monetization === 'ads' || v.offer.monetization === 'free'),
    isNew,
    checkedAt: anime?.streamingCheckedAt || null,
    legacy,
  }
}
