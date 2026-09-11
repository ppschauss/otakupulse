/**
 * Datengetriebene Streaming-Texte für die Anime-Seite: Meta-Description,
 * Fließtext („Wo kann ich … streamen?") und FAQ.
 *
 * Alles wird aus den Offers abgeleitet (Anbieter, Dub/Sub je Anbieter, Abo/
 * kostenlos, Staffeln/Folgen, Ablaufdatum) plus Stammdaten (Genre, Studio, Jahr,
 * Format, Episoden, Status). Formulierungen variieren deterministisch über die
 * Anime-ID, damit nicht 4.000 Seiten denselben Satzbau tragen — aber jede
 * Aussage bleibt faktisch aus den Daten belegt. Ohne Anbieter gibt es keinen
 * Guide (dünner Text wäre schlechter als keiner).
 */
import { displayTitle, formatDateDe, formatLabel, joinNames, seasonLabel } from './anime'
import {
  groupOffersByProvider,
  purchaseOffersOf,
  streamingOffersOf,
  streamingSummary,
  type StreamingOffer,
  type StreamingProvider,
} from './streaming'
import type { FaqItem } from '@/components/Faq'

type Group = { provider: StreamingProvider; offers: StreamingOffer[] }

const hasDe = (g: Group) => g.offers.some((o) => o.audio.includes('de'))
const hasDeSub = (g: Group) => g.offers.some((o) => o.subs.includes('de'))
const isFree = (g: Group) => g.offers.some((o) => o.monetization === 'ads' || o.monetization === 'free')
const isLegacy = (g: Group) => g.offers.every((o) => o.legacy)

/** „mit deutscher Synchro und deutschen Untertiteln" / „im Original mit deutschen Untertiteln" / „" */
function langPhrase(g: Group): string {
  if (isLegacy(g)) return ''
  const dub = hasDe(g)
  const sub = hasDeSub(g)
  if (dub && sub) return 'mit deutscher Synchro und deutschen Untertiteln'
  if (dub) return 'mit deutscher Synchro'
  if (sub) return 'im Original mit deutschen Untertiteln'
  const en = g.offers.some((o) => o.subs.includes('en') || o.audio.includes('en'))
  return en ? 'im Original mit englischen Untertiteln' : 'im japanischen Original'
}

/** „im Abo" / „kostenlos (mit Werbung)" / „kostenlos" */
function costPhrase(g: Group): string {
  if (isLegacy(g)) return ''
  if (g.offers.some((o) => o.monetization === 'free')) return 'kostenlos'
  if (g.offers.some((o) => o.monetization === 'ads')) return 'kostenlos mit Werbung'
  return 'im Abo'
}

/** „5 Staffeln mit 173 Folgen" / „13 Folgen" / „" */
function scopePhrase(g: Group): string {
  const o = g.offers[0]
  if (o.seasons && o.episodes) return o.seasons === 1 ? `${o.episodes} Folgen` : `${o.seasons} Staffeln mit ${o.episodes} Folgen`
  if (o.episodes) return `${o.episodes} Folgen`
  if (o.seasons) return `${o.seasons} ${o.seasons === 1 ? 'Staffel' : 'Staffeln'}`
  return ''
}

function genres(anime: any): string[] {
  return (Array.isArray(anime?.genres) ? anime.genres : []).filter((g: any) => typeof g === 'object').map((g: any) => g.name)
}

function studioName(anime: any): string {
  const all = (Array.isArray(anime?.studios) ? anime.studios : []).filter((s: any) => typeof s === 'object')
  const anim = all.filter((s: any) => s.isAnimationStudio)
  return (anim[0] || all[0])?.name || ''
}

function yearOf(anime: any): number | null {
  return anime?.seasonYear || null
}

// --- Meta ---------------------------------------------------------------------

/**
 * Meta-Description nach dem Muster
 * „{Anime} jetzt auf {Anbieter} streamen – {Sprache}{, teils kostenlos}. {Genre}-Anime ({Format}, {Jahr}{, N Folgen})."
 */
export function streamingMetaDescription(anime: any): string {
  const title = displayTitle(anime)
  const s = streamingSummary(anime)
  const g = genres(anime).slice(0, 2).join('/')
  const facts = [formatLabel(anime?.format), yearOf(anime), anime?.episodes ? `${anime.episodes} Folgen` : ''].filter(Boolean).join(', ')
  const kind = `${g ? `${g}-Anime` : 'Anime'}${facts ? ` (${facts})` : ''}`
  if (!s.hasStream) {
    return `${title}: ${kind}. Handlung, Charaktere, Episoden und Streaming-Status – aktuell bei keinem Anbieter in Deutschland im Abo- oder Gratis-Stream.`
  }
  const lang = s.legacy
    ? ''
    : s.hasDeDub && s.hasDeSub
      ? ' – Deutscher Dub & Sub'
      : s.hasDeDub
        ? ' – mit deutscher Synchro'
        : s.hasDeSub
          ? ' – mit deutschen Untertiteln'
          : ' – im Original mit Untertiteln'
  const free = s.hasFree ? ', teils kostenlos' : ''
  // Max. drei Anbieter namentlich, sonst passen Genre/Jahr nicht mehr in 160 Zeichen.
  const n = s.providerNames.length
  const providers = n > 4 ? `${s.providerNames.slice(0, 3).join(', ')} und ${n - 3} weiteren Anbietern` : joinNames(s.providerNames)
  return `${title} jetzt auf ${providers} streamen${lang}${free}. ${kind}.`
}

/** „{Anime} streamen auf {Anbieter} (Deutscher Dub) | OtakuPulse" */
export function streamingMetaTitle(anime: any): string {
  const title = displayTitle(anime)
  const s = streamingSummary(anime)
  if (!s.hasStream) return `${title} — Anime: Infos, Charaktere & Stream | OtakuPulse`
  // Google zeigt ~60 Zeichen: bei langen Titeln nur zwei Anbieter nennen.
  const n = title.length > 30 ? 2 : 3
  const lang = s.legacy ? '' : s.hasDeDub ? ' (Deutscher Dub)' : s.hasDeSub ? ' (Ger Sub)' : ''
  return `${title} streamen auf ${joinNames(s.providerNames.slice(0, n))}${lang} | OtakuPulse`
}

// --- Fließtext ------------------------------------------------------------------

export type StreamingGuide = { heading: string; paragraphs: string[]; faq: FaqItem[] } | null

/**
 * Kurzform für Wiederholungen: „Re:ZERO -Starting Life in Another World- Season 4"
 * → „Re:ZERO Season 4", „Frieren: Beyond Journey's End" → „Frieren". Der volle
 * Titel fällt nur einmal (erste Nennung); danach wäre er in jedem Satz Ballast.
 */
export function shortTitle(title: string): string {
  // Satzzeichen am Ende („Your Name.") stören in Fragen und Überschriften.
  const clean = title.replace(/[.!]+$/, '').trim()
  const m = clean.match(/^(.{3,}?)\s*(?:[:\-–—]\s|\s-)/)
  if (!m) return clean
  const base = m[1].trim()
  if (clean.length - base.length < 8) return clean
  const season = clean.match(/\b(?:Season|Staffel|Part|Cour)\s*\d+\b/i)
  return season ? `${base} ${season[0]}` : base
}

/** Zusatzsatz je Anbieter — Anbieter fett, Fakten aus den Offers (Abo/kostenlos, Dub/Sub, Staffeln/Folgen, Ablauf). */
function providerSentence(anime: any, title: string, g: Group, idx: number): string {
  const isMovie = anime?.format === 'MOVIE'
  const subj = idx === 0 ? title : isMovie ? 'der Film' : 'die Serie'
  const lang = langPhrase(g)
  const cost = costPhrase(g)
  const scope = scopePhrase(g)
  const to = g.offers[0].availableTo ? formatDateDe(g.offers[0].availableTo) : ''
  // Zwei „mit" hintereinander (kostenlos mit Werbung, mit deutscher Synchro) per Komma trennen.
  const details = cost && lang ? (cost.includes('mit') && lang.startsWith('mit') ? `${cost}, ${lang}` : `${cost} ${lang}`) : cost || lang
  return `Bei **${g.provider.name}** läuft ${subj}${details ? ` ${details}` : ''}${scope ? ` (${scope})` : ''}${to ? ` – verfügbar bis **${to}**` : ''}.`
}

export type OverviewRow = { label: string; value: string }
export type StreamingGuideData = {
  heading: string
  intro: string
  overviewHeading: string
  overview: OverviewRow[]
  cta: { url: string; provider: string; text: string; title: string; lead: string }
  details: string | null
  faqHeading: string
  faq: FaqItem[]
}

/**
 * Guide für Titel mit Anbietern — Wortlaut nach der redaktionellen Vorlage
 * (Intro → Anbieter-Übersicht → CTA → FAQ). Die Sätze der Vorlage bleiben
 * unverändert, nur die Platzhalter werden gefüllt; harte Fakten aus den Offers
 * (Netflix ja/nein, Kauf/Leih, Ablaufdatum, Dub/Sub je Anbieter) werden als
 * ZUSATZSÄTZE angehängt, ersetzen aber nie den Vorlagentext. Texte mit
 * **fett**-Markern (components/RichLine); FAQ-Antworten ohne Marker (JSON-LD).
 * null ohne Streaming-Anbieter.
 */
export function streamingGuide(anime: any): StreamingGuideData | null {
  const views = streamingOffersOf(anime)
  const groups = groupOffersByProvider(views)
  if (!groups.length) return null
  const title = displayTitle(anime)
  const s = streamingSummary(anime)
  const names = groups.map((g) => g.provider.name)
  const bold = joinNames(names.map((n) => `**${n}**`))
  const plain = joinNames(names)
  const many = groups.length > 1
  const stand = formatDateDe(s.checkedAt)
  const isMovie = anime?.format === 'MOVIE'
  const running = anime?.status === 'RELEASING'
  const year = yearOf(anime)
  const release = year ? (anime?.season ? `${seasonLabel(anime.season)} ${year}` : `${year}`) : ''
  const serie = isMovie ? 'den Film' : 'die Serie'
  const anime_ = isMovie ? 'den Film' : 'den Anime'
  // Sprache: aus Offers (je Anbieter) oder im Legacy-Fall aus den globalen Flags.
  const dubAt = s.legacy ? (s.hasDeDub ? names : []) : groups.filter(hasDe).map((g) => g.provider.name)
  const subAt = s.legacy ? (s.hasDeSub ? names : []) : groups.filter(hasDeSub).map((g) => g.provider.name)
  const freeAt = groups.filter(isFree).map((g) => g.provider.name)
  const stores = purchaseOffersOf(anime)
  const sprache = dubAt.length ? 'Deutsch' : subAt.length ? 'Japanisch mit deutschen Untertiteln' : ''

  // --- Überschrift + Intro (Vorlage)
  const heading = `Wer streamt ${title}? Alle Anbieter & Optionen`
  const intro = [
    `Auf der Suche nach dem passenden Stream für **${title}**? Wir zeigen dir, wo du ${serie} aktuell findest.`,
    release
      ? `Seit dem **${release}** ${many ? 'führen' : 'führt'} ${bold} ${anime_} im Sortiment.`
      : `${bold} ${many ? 'führen' : 'führt'} ${anime_} im Sortiment.`,
    dubAt.length
      ? `Dort kannst du direkt einschalten und **${title} auf Deutsch streamen** oder im japanischen Originalton genießen.`
      : subAt.length
        ? `Dort kannst du direkt einschalten und **${title} im japanischen Originalton mit deutschen Untertiteln streamen**.`
        : `Dort kannst du direkt einschalten und **${title} streamen**.`,
  ].join(' ')

  // --- Übersicht (Vorlage: Anbieter, Audio-Spuren, Release-Termin) + Zusatzzeilen aus den Daten
  const overviewHeading = `Anbieter-Übersicht für ${title}`
  const overview: OverviewRow[] = [{ label: 'Streaming-Anbieter', value: plain }]
  if (sprache) overview.push({ label: 'Verfügbare Audio-Spuren', value: dubAt.length ? 'Deutsch & Japanisch (OmU)' : 'Japanisch (OmU) mit deutschen Untertiteln' })
  if (release) overview.push({ label: 'Release-Termin', value: release })
  if (!s.legacy) {
    const aboAt = groups.filter((g) => !isFree(g)).map((g) => g.provider.name)
    overview.push({ label: 'Kosten', value: [aboAt.length ? `Abo (${aboAt.join(', ')})` : '', freeAt.length ? `kostenlos mit Werbung (${freeAt.join(', ')})` : ''].filter(Boolean).join(' · ') })
  }
  if (stores.length) {
    overview.push({ label: 'Kaufen / Leihen', value: stores.map((st) => `${st.provider.name} (${[st.buy ? 'Kauf' : '', st.rent ? 'Leihe' : ''].filter(Boolean).join('/')})`).join(' · ') })
  }
  if (stand) overview.push({ label: 'Stand', value: stand })

  // --- CTA (Vorlage)
  const first = groups[0]
  const cta = {
    url: first.offers[0].url,
    provider: first.provider.name,
    lead: 'Jetzt direkt starten:',
    text: `Zu ${first.provider.name} wechseln und ${title} streamen`,
    title: `${title} online streamen bei ${first.provider.name}`,
  }

  // --- Zusatzabsatz: harte Fakten je Anbieter (nur mit belegten Offers)
  const detailLines = s.legacy ? [] : groups.slice(0, 4).map((g, i) => providerSentence(anime, title, g, i))
  const details = detailLines.length ? `Im Detail: ${detailLines.join(' ')}` : null

  // --- FAQ (Vorlage + Zusatzsätze mit Daten)
  const faqHeading = `FAQ zur Anbieter-Verfügbarkeit: Wer streamt ${title}?`
  const faq: FaqItem[] = []
  faq.push({
    q: `Wer hat ${title} aktuell im Angebot?`,
    a: `Der Anime ist derzeit bei ${plain} gelistet${stand ? ` (Stand: ${stand})` : ''}. Je nach Ausstrahlungsmuster kann ${serie} parallel auch bei weiteren Streaming-Diensten verfügbar sein oder dort zu einem späteren Zeitpunkt ins Sortiment aufgenommen werden.`,
  })
  if (dubAt.length) {
    faq.push({
      q: `Wer streamt ${title} auf Deutsch?`,
      a: `Die Fassung mit der Tonspur Deutsch steht bei ${joinNames(dubAt)} zum Abruf bereit. Sollte die Synchronisation noch nicht vollständig abgeschlossen sein, werden neue Folgen meist in regelmäßigen Abständen nachgereicht.${subAt.filter((n) => !dubAt.includes(n)).length ? ` Nur mit deutschen Untertiteln läuft ${title} bei ${joinNames(subAt.filter((n) => !dubAt.includes(n)))}.` : ''}`,
    })
  } else if (subAt.length) {
    faq.push({
      q: `Wer streamt ${title} auf Deutsch?`,
      a: `Eine deutsche Synchronfassung ist bislang nicht im Stream gelistet. Bei ${joinNames(subAt)} läuft ${title} im japanischen Originalton mit deutschen Untertiteln. Sobald ein Anbieter eine Synchronisation aufnimmt, findest du sie hier.`,
    })
  }
  faq.push({
    q: `Wer zeigt den Simulcast von ${title}?`,
    a: `Für die Ausstrahlung im Simulcast von ${title} – also die Veröffentlichung zeitnah zur Erstausstrahlung in Japan – ${many ? `sind ${plain} zentrale Anlaufstellen` : `ist ${plain} eine der zentralen Anlaufstellen`}. Die Episoden stehen dort meist wenige Stunden nach der Japan-Premiere mit Untertiteln bereit.${
      running
        ? ` Aktuell laufen neue Folgen – die Sendetermine stehen in unserem Simulcast-Kalender.`
        : anime?.status === 'NOT_YET_RELEASED'
          ? ` ${title} ist angekündigt, aber noch nicht gestartet.`
          : ` ${title} ist bereits abgeschlossen${!isMovie && anime?.episodes ? `; alle ${anime.episodes} Folgen sind komplett abrufbar` : ''}.`
    }`,
  })
  const bigs = ['Netflix', 'Crunchyroll', 'Amazon Prime Video']
  const yes = bigs.filter((b) => names.includes(b))
  const no = bigs.filter((b) => !names.includes(b))
  faq.push({
    q: `Streamen auch Dienste wie Netflix, Crunchyroll oder Amazon Prime Video ${title}?`,
    a: `Ob neben ${plain} noch weitere große Plattformen ${title} im Abo anbieten, hängt vom jeweiligen Rechtekatalog im deutschsprachigen Raum ab. Es kommt häufig vor, dass Serien bei mehreren Anbietern gleichzeitig oder zeitversetzt laufen.${
      yes.length ? ` Aktuell: ${joinNames(yes)} ${yes.length > 1 ? 'haben' : 'hat'} ${title} im Programm.` : ''
    }${no.length ? ` Bei ${joinNames(no)} ist ${title} derzeit nicht gelistet${stand ? ` (Stand: ${stand})` : ''}.` : ''}`,
  })
  faq.push({
    q: `Kann man ${title} auch ohne Abo streamen, kaufen oder leihen?`,
    a: `Neben Abo-Flatrates bieten einige Plattformen Anime auch als VoD-Kauf- oder Leihoption an. Wir prüfen regelmäßig, ob ${title} online schauen auch als digitaler Einzelkauf möglich ist.${
      freeAt.length ? ` Ohne Abo läuft ${title} bei ${joinNames(freeAt)} – kostenlos mit Werbung.` : ''
    }${
      stores.length
        ? ` Als Einzelkauf${stores.some((st) => st.rent) ? ' oder Leihe' : ''} ist ${title} aktuell bei ${joinNames(stores.map((st) => st.provider.name))} erhältlich.`
        : ` Derzeit ist kein Kauf- oder Leihangebot gelistet.`
    }`,
  })
  const expiring = groups.filter((g) => g.offers[0].availableTo).map((g) => `${g.provider.name} bis ${formatDateDe(g.offers[0].availableTo)}`)
  faq.push({
    q: `Warum ändert sich manchmal, wer ${title} streamt?`,
    a: `Streaming-Rechte werden für bestimmte Zeiträume verhandelt. Wenn Lizenzverträge auslaufen oder verlängert werden, kann sich die Verfügbarkeit bei ${plain} oder anderen Plattformen verschieben. Wir halten die Daten für diesen Titel fortlaufend auf dem neuesten Stand.${
      expiring.length ? ` Bekanntes Enddatum: ${joinNames(expiring)}.` : ''
    }${stand ? ` Letzter Abgleich: ${stand}.` : ''}`,
  })

  return { heading, intro, overviewHeading, overview, cta, details, faqHeading, faq }
}
