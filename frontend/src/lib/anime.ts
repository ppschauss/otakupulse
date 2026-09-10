// Hilfsfunktionen rund um Anime-Daten (Anzeige & Labels).

export function displayTitle(a: any): string {
  return a?.titleGerman || a?.titleEnglish || a?.titleRomaji || 'Unbekannt'
}

// Bild-Auswahl: lokal gespiegeltes Bild bevorzugen, sonst Remote-CDN-URL.
export const animeCover = (a: any): string | null => a?.coverImageLocal || a?.coverImageUrl || null
export const animeBanner = (a: any): string | null =>
  a?.bannerImageLocal || a?.bannerImageUrl || a?.coverImageLocal || a?.coverImageUrl || null
export const localImage = (x: any): string | null => x?.imageLocal || x?.imageUrl || null

// Anzeigename für Charaktere & Personen (Romaji bevorzugt, dann EN/Native).
export function displayName(p: any): string {
  return p?.nameRomaji || p?.nameEnglish || p?.nameNative || 'Unbekannt'
}

export const GENDER_LABELS: Record<string, string> = {
  male: 'männlich',
  female: 'weiblich',
  non_binary: 'non-binär',
  unknown: 'unbekannt',
}

export const PERSON_ROLE_LABELS: Record<string, string> = {
  voice_actor: 'Synchronsprecher',
  director: 'Regie',
  writer: 'Drehbuch',
  mangaka: 'Mangaka',
  illustrator: 'Illustration',
  composer: 'Musik',
  producer: 'Produktion',
  other: 'Sonstiges',
}

export const CHARACTER_ROLE_LABELS: Record<string, string> = {
  MAIN: 'Hauptrolle',
  SUPPORTING: 'Nebenrolle',
  BACKGROUND: 'Hintergrund',
}

export const TAG_CATEGORY_LABELS: Record<string, string> = {
  theme: 'Thema',
  setting: 'Setting',
  demographic: 'Zielgruppe',
  mood: 'Stimmung',
  element: 'Element',
}

export const ARTICLE_CATEGORY_LABELS: Record<string, string> = {
  news: 'News',
  simulcast: 'Simulcast',
  review: 'Review',
  editorial: 'Editorial',
  guide: 'Guide',
  ranking: 'Ranking',
  seasonal_preview: 'Season-Vorschau',
}

/**
 * Where-Bausteine für öffentlich sichtbare Artikel: veröffentlicht UND publishDate
 * nicht in der Zukunft — geplante Beiträge erscheinen so automatisch zum Termin.
 * In bestehende and-Arrays spreaden: `where: { and: [..., ...liveArticleFilters()] }`.
 */
export const liveArticleFilters = (): any[] => [
  { _status: { equals: 'published' } },
  { or: [{ publishDate: { less_than_equal: new Date().toISOString() } }, { publishDate: { exists: false } }] },
]

export const RELATION_LABELS: Record<string, string> = {
  SEQUEL: 'Fortsetzung',
  PREQUEL: 'Vorgänger',
  SIDE_STORY: 'Nebengeschichte',
  ADAPTATION: 'Adaption',
  ALTERNATIVE: 'Alternative',
  SPIN_OFF: 'Spin-off',
  PARENT: 'Hauptwerk',
  OTHER: 'Verknüpft',
}

export const genderLabel = (g?: string | null) => (g ? GENDER_LABELS[g] ?? g : '')
export const personRoleLabel = (r?: string | null) => (r ? PERSON_ROLE_LABELS[r] ?? r : '')
export const characterRoleLabel = (r?: string | null) => (r ? CHARACTER_ROLE_LABELS[r] ?? r : '')
export const articleCategoryLabel = (c?: string | null) => (c ? ARTICLE_CATEGORY_LABELS[c] ?? c : '')
export const relationLabel = (r?: string | null) => (r ? RELATION_LABELS[r] ?? r : '')

// Sprach-/Dub-Verfügbarkeit (availableLanguages) → Anzeige.
export const LANGUAGE_LABELS: Record<string, string> = {
  ja: 'Japanisch (OmU)',
  'de-dub': 'Deutscher Dub',
  'de-sub': 'Deutscher Sub',
  'en-dub': 'Englischer Dub',
  'en-sub': 'Englischer Sub',
}
// Stabile Anzeigereihenfolge.
export const LANGUAGE_ORDER = ['de-dub', 'en-dub', 'de-sub', 'en-sub', 'ja']
export const languageLabel = (l?: string | null) => (l ? LANGUAGE_LABELS[l] ?? l : '')

export const FORMAT_LABELS: Record<string, string> = {
  TV: 'TV-Serie',
  TV_SHORT: 'TV-Kurz',
  MOVIE: 'Film',
  SPECIAL: 'Special',
  OVA: 'OVA',
  ONA: 'ONA',
  MUSIC: 'Musik',
}

export const STATUS_LABELS: Record<string, string> = {
  FINISHED: 'Abgeschlossen',
  RELEASING: 'Läuft aktuell',
  NOT_YET_RELEASED: 'Angekündigt',
  CANCELLED: 'Abgebrochen',
  HIATUS: 'Pausiert',
}

export const SEASON_LABELS: Record<string, string> = {
  WINTER: 'Winter',
  SPRING: 'Frühling',
  SUMMER: 'Sommer',
  FALL: 'Herbst',
}

export const formatLabel = (f?: string | null) => (f ? FORMAT_LABELS[f] ?? f : '')
export const statusLabel = (s?: string | null) => (s ? STATUS_LABELS[s] ?? s : '')
export const seasonLabel = (s?: string | null) => (s ? SEASON_LABELS[s] ?? s : '')

// Strippt AniList-HTML aus Beschreibungen für Vorschau-Texte.
export function plainText(html?: string | null): string {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

// Mindest-Klartextlänge, ab der eine Detailseite als indexierbar gilt. Darunter ist die
// Seite dünn (name-only / Ein-Satz-Stub) → noindex UND raus aus der Sitemap. Eine Quelle
// für Seiten-noindex und Sitemap-Filter, damit beide Kriterien nie auseinanderlaufen.
export const INDEX_MIN_CHARS = 100
export function textTooThin(...sources: (string | null | undefined)[]): boolean {
  const first = sources.find((s) => s && s.trim())
  return plainText(first).length < INDEX_MIN_CHARS
}

/**
 * Indexregel für Anime-Seiten — EINE Quelle für Seiten-noindex und Sitemap-keep.
 * Indexiert, wenn der Titel Streaming-Daten hat (das ist der Mehrwert gegenüber
 * AniList/aniSearch) ODER einen eigenen deutschen Text ≥ INDEX_MIN_CHARS. Nur
 * Quelltext (englisch) reicht nicht; Musikvideos ohne Stream sind immer dünn.
 */
export function animeIndexable(a: any): boolean {
  if (a?.noindex) return false
  const hasStream =
    (Array.isArray(a?.streamingOffers) && a.streamingOffers.length > 0) ||
    (Array.isArray(a?.streamingProviders) && a.streamingProviders.length > 0)
  if (hasStream) return true
  if (a?.format === 'MUSIC') return false
  return !textTooThin(a?.descriptionDe)
}

// Natürliche Aufzählung: [a,b,c] → „a, b und c".
export function joinNames(names: (string | null | undefined)[]): string {
  const a = names.filter((n): n is string => !!n)
  if (a.length === 0) return ''
  if (a.length === 1) return a[0]
  if (a.length === 2) return `${a[0]} und ${a[1]}`
  return `${a.slice(0, -1).join(', ')} und ${a[a.length - 1]}`
}

// ISO-Datum → „10.09.2026" (leer bei fehlend/ungültig; für „Stand:"/„bis"-Angaben).
export function formatDateDe(iso?: string | null): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  return Number.isFinite(t)
    ? new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' })
    : ''
}
