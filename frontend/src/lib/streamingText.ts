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
  streamingOffersOf,
  streamingSummary,
  type StreamingOffer,
  type StreamingProvider,
} from './streaming'
import type { FaqItem } from '@/components/Faq'

type Group = { provider: StreamingProvider; offers: StreamingOffer[] }

// Deterministische Variante 0..n-1 aus der Anime-ID (stabil über Renders).
const pick = <T,>(anime: any, variants: T[]): T => variants[Math.abs(Number(anime?.id) || 0) % variants.length]

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

/** Satz je Anbieter: „Bei Crunchyroll läuft X im Abo mit deutscher Synchro (5 Staffeln mit 173 Folgen)." */
function providerSentence(anime: any, title: string, g: Group, idx: number): string {
  // Ab dem zweiten Anbieter-Satz „die Serie"/„der Film" statt des (oft langen) Titels.
  const subject = idx === 0 ? title : anime?.format === 'MOVIE' ? 'der Film' : 'die Serie'
  const object = idx === 0 ? title : anime?.format === 'MOVIE' ? 'den Film' : 'die Serie'
  const lang = langPhrase(g)
  const cost = costPhrase(g)
  const scope = scopePhrase(g)
  const to = g.offers[0].availableTo ? formatDateDe(g.offers[0].availableTo) : ''
  const details = [cost, lang].filter(Boolean).join(' ')
  const tail = scope ? ` (${scope})` : ''
  const expiry = to ? ` – allerdings nur noch bis ${to}` : ''
  const forms = [
    `Bei ${g.provider.name} läuft ${subject}${details ? ` ${details}` : ''}${tail}${expiry}.`,
    `${g.provider.name} hat ${object}${details ? ` ${details}` : ''} im Programm${tail}${expiry}.`,
    `Auf ${g.provider.name} kannst du ${object}${details ? ` ${details}` : ''} schauen${tail}${expiry}.`,
  ]
  return forms[(Math.abs(Number(anime?.id) || 0) + idx) % forms.length]
}

/**
 * Guide für Titel mit Anbietern: Überschrift, 2–3 Absätze, FAQ. null ohne Anbieter.
 */
export function streamingGuide(anime: any): StreamingGuide {
  const views = streamingOffersOf(anime)
  if (!views.length) return null
  const title = displayTitle(anime)
  const groups = groupOffersByProvider(views)
  const s = streamingSummary(anime)
  const names = groups.map((g) => g.provider.name)
  const stand = formatDateDe(s.checkedAt)
  const year = yearOf(anime)
  const gen = genres(anime)
  const studio = studioName(anime)
  const fmt = formatLabel(anime?.format) || 'Anime'
  const isMovie = anime?.format === 'MOVIE'
  const running = anime?.status === 'RELEASING'

  const paragraphs: string[] = []

  // Absatz 1: Wo? + Anbieter-Sätze
  const intro = pick(anime, [
    `Wo kann ich ${title} streamen? In Deutschland läuft ${title} aktuell bei ${joinNames(names)}${stand ? ` (Stand: ${stand})` : ''}.`,
    `${title} streamen – geht bei ${joinNames(names)}${stand ? ` (Stand: ${stand})` : ''}.`,
    `Wer ${title} online schauen will, wird in Deutschland bei ${joinNames(names)} fündig${stand ? ` (Stand: ${stand})` : ''}.`,
  ])
  paragraphs.push([intro, ...groups.slice(0, 4).map((g, i) => providerSentence(anime, title, g, i))].join(' '))

  // Absatz 2: Sprachfassung (nur mit belegten Daten)
  if (!s.legacy) {
    const dubAt = groups.filter(hasDe).map((g) => g.provider.name)
    const subAt = groups.filter((g) => !hasDe(g) && hasDeSub(g)).map((g) => g.provider.name)
    const freeAt = groups.filter(isFree).map((g) => g.provider.name)
    const parts: string[] = []
    if (dubAt.length) parts.push(`Mit deutscher Synchronisation (Ger Dub) gibt es ${title} bei ${joinNames(dubAt)}.`)
    else if (subAt.length) parts.push(`Eine deutsche Synchro ist bislang nicht im Stream – ${title} läuft im japanischen Original mit deutschen Untertiteln (Ger Sub).`)
    else parts.push(`Eine deutsche Fassung ist bislang nicht im Stream gelistet; ${title} läuft im Original mit Untertiteln.`)
    if (dubAt.length && subAt.length) parts.push(`Wer lieber im Originalton schaut, findet ${title} mit deutschen Untertiteln bei ${joinNames(subAt)}.`)
    if (freeAt.length) parts.push(`Kostenlos streamen lässt sich ${title} bei ${joinNames(freeAt)} – werbefinanziert, ohne Abo.`)
    else parts.push(pick(anime, [`Ein kostenloses Angebot gibt es für ${title} derzeit nicht, alle Anbieter setzen ein Abo voraus.`, `Gratis ist ${title} aktuell nirgends zu sehen – nötig ist ein Abo bei einem der genannten Dienste.`]))
    paragraphs.push(parts.join(' '))
  }

  // Absatz 3: Einordnung + Handlungsaufforderung
  const facts: string[] = []
  if (gen.length) facts.push(`${joinNames(gen.slice(0, 3))}`)
  const about = [
    `${title} ist ${isMovie ? 'ein Anime-Film' : `eine ${fmt}`}${studio ? ` von ${studio}` : ''}${year ? ` aus dem ${anime?.season ? `${seasonLabel(anime.season)} ${year}` : `Jahr ${year}`}` : ''}${facts.length ? ` (${facts.join(', ')})` : ''}${!isMovie && anime?.episodes ? ` mit ${anime.episodes} Folgen` : ''}.`,
    running ? `Die Serie läuft aktuell – neue Folgen erscheinen im Simulcast, unser Kalender zeigt die Termine.` : '',
    pick(anime, [
      `Bei ${names[0]} jetzt ${title} schauen: Der Link oben führt direkt zum Titel.`,
      `Ein Klick auf ${names[0]} bringt dich direkt zu ${title} – ohne Suchen im Katalog.`,
      `Direkt zum Stream: Die Anbieter-Karten oben verlinken ${title} beim jeweiligen Dienst.`,
    ]),
    `Lizenzen ändern sich – wir gleichen die Verfügbarkeit regelmäßig ab.`,
  ].filter(Boolean)
  paragraphs.push(about.join(' '))

  // FAQ
  const faq: FaqItem[] = []
  faq.push({
    q: `Wo kann man ${title} streamen?`,
    a: `${title} läuft in Deutschland bei ${joinNames(names)}${stand ? ` (Stand: ${stand})` : ''}. Die Links auf dieser Seite führen direkt zum Titel beim jeweiligen Anbieter.`,
  })
  if (!s.legacy) {
    const dubAt = groups.filter(hasDe).map((g) => g.provider.name)
    faq.push({
      q: `Gibt es ${title} mit deutscher Synchro?`,
      a: dubAt.length
        ? `Ja – ${title} ist mit deutschem Dub bei ${joinNames(dubAt)} verfügbar.`
        : `Nein, derzeit ist ${title} nur im Original mit Untertiteln im Stream. Sobald ein Anbieter eine deutsche Synchro listet, erscheint sie hier.`,
    })
    const freeAt = groups.filter(isFree).map((g) => g.provider.name)
    faq.push({
      q: `Kann man ${title} kostenlos streamen?`,
      a: freeAt.length
        ? `Ja, bei ${joinNames(freeAt)} läuft ${title} kostenlos (werbefinanziert).`
        : `Nein, ${title} gibt es aktuell nur im Abo – bei ${joinNames(names)}.`,
    })
  }
  // „Läuft X auf Netflix/Crunchyroll?" — die zwei meistgesuchten Dienste, jeweils Ja/Nein.
  for (const big of ['Netflix', 'Crunchyroll']) {
    const g = groups.find((x) => x.provider.name === big)
    if (g) {
      faq.push({ q: `Läuft ${title} auf ${big}?`, a: `Ja. ${providerSentence(anime, title, g, 0)}` })
    } else if (faq.length < 5) {
      faq.push({ q: `Läuft ${title} auf ${big}?`, a: `Nein, bei ${big} ist ${title} derzeit nicht im Programm. Stattdessen läuft der Titel bei ${joinNames(names)}.` })
    }
  }
  if (!isMovie && anime?.episodes) {
    faq.push({ q: `Wie viele Folgen hat ${title}?`, a: `${title} umfasst ${anime.episodes} Folgen${running ? ' (laufend, es kommen wöchentlich neue hinzu)' : ''}.` })
  }

  const heading = pick(anime, [
    `${title} streamen: Anbieter, Sprachen & Kosten`,
    `Wo kann ich ${title} streamen?`,
    `${title} online schauen – alle Anbieter im Überblick`,
  ])
  return { heading, paragraphs, faq: faq.slice(0, 6) }
}
