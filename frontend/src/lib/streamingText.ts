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

// Variante per Seed (Anime-ID + Offset), damit Überschrift, Absätze und Sätze
// unabhängig voneinander wechseln und nicht alle Seiten dieselbe Kombination zeigen.
const seed = (anime: any, offset: number) => Math.abs(Number(anime?.id) || 0) + offset
const vary = <T,>(anime: any, offset: number, variants: T[]): T => variants[seed(anime, offset) % variants.length]

/**
 * Kurzform für Wiederholungen: „Re:ZERO -Starting Life in Another World- Season 4"
 * → „Re:ZERO Season 4", „Frieren: Beyond Journey's End" → „Frieren". Der volle
 * Titel fällt nur einmal (erste Nennung); danach wäre er in jedem Satz Ballast.
 */
export function shortTitle(title: string): string {
  const m = title.match(/^(.{3,}?)\s*(?:[:\-–—]\s|\s-)/)
  if (!m) return title
  const base = m[1].trim()
  if (title.length - base.length < 8) return title
  const season = title.match(/\b(?:Season|Staffel|Part|Cour)\s*\d+\b/i)
  return season ? `${base} ${season[0]}` : base
}

/** Satz je Anbieter — Anbieter fett, Details aus den Daten. */
function providerSentence(anime: any, short: string, g: Group, idx: number): string {
  const isMovie = anime?.format === 'MOVIE'
  const obj = idx === 0 ? short : isMovie ? 'den Film' : vary(anime, idx, ['die Serie', 'den Titel'])
  const subj = idx === 0 ? short : isMovie ? 'der Film' : vary(anime, idx, ['die Serie', 'der Titel'])
  const lang = langPhrase(g)
  const cost = costPhrase(g)
  const scope = scopePhrase(g)
  const to = g.offers[0].availableTo ? formatDateDe(g.offers[0].availableTo) : ''
  const details = [cost, lang].filter(Boolean).join(' ')
  const tail = scope ? ` – ${scope}` : ''
  const expiry = to ? vary(anime, idx + 3, [` Aber Achtung: nur noch bis **${to}**, danach ist der Titel dort weg.`, ` Kleiner Haken: Die Lizenz läuft am **${to}** aus.`]) : ''
  const forms = [
    `Bei **${g.provider.name}** läuft ${subj}${details ? ` ${details}` : ''}${tail}.${expiry}`,
    `**${g.provider.name}** hat ${obj}${details ? ` ${details}` : ''} im Katalog${tail}.${expiry}`,
    `Auf **${g.provider.name}** kannst du ${obj}${details ? ` ${details}` : ''} schauen${tail}.${expiry}`,
    `Auch **${g.provider.name}** ist dabei${details ? ` – ${details}` : ''}${tail}.${expiry}`,
  ]
  // Erster Satz nie mit „Auch …" beginnen.
  const pool = idx === 0 ? forms.slice(0, 3) : forms
  return pool[seed(anime, idx * 7) % pool.length]
}

/**
 * Guide für Titel mit Anbietern: Überschrift, 2–3 Absätze (mit **fett**-Markern,
 * siehe components/RichLine), FAQ. null ohne Anbieter.
 */
export function streamingGuide(anime: any): StreamingGuide {
  const views = streamingOffersOf(anime)
  if (!views.length) return null
  const title = displayTitle(anime)
  const short = shortTitle(title)
  const groups = groupOffersByProvider(views)
  const s = streamingSummary(anime)
  const names = groups.map((g) => g.provider.name)
  const bold = names.map((n) => `**${n}**`)
  const stand = formatDateDe(s.checkedAt)
  const standTxt = stand ? ` (Stand: ${stand})` : ''
  const year = yearOf(anime)
  const gen = genres(anime)
  const studio = studioName(anime)
  const isMovie = anime?.format === 'MOVIE'
  const running = anime?.status === 'RELEASING'
  const many = groups.length > 1

  const paragraphs: string[] = []

  // Absatz 1 — Einstieg (bewusst nicht immer mit dem Titel) + Anbieter-Sätze
  const intro = vary(anime, 0, [
    `Gute Nachrichten für alle, die **${short}** auf der Watchlist haben: In Deutschland ${many ? 'laufen gleich mehrere Anbieter mit' : 'gibt es einen legalen Weg'} – ${joinNames(bold)}${standTxt}.`,
    `Kurz und schmerzlos: ${joinNames(bold)} ${many ? 'haben' : 'hat'} **${short}** im Programm${standTxt}.`,
    `Du willst **${short}** sehen, ohne dich durch Kataloge zu wühlen? Hier läuft ${isMovie ? 'der Film' : 'die Serie'} in Deutschland: ${joinNames(bold)}${standTxt}.`,
    `Legal, in Deutschland, ohne Umwege: **${short}** gibt's bei ${joinNames(bold)}${standTxt}.`,
    `Wo läuft **${short}**? Die Antwort ist ${many ? 'erfreulich lang' : 'kurz'}: ${joinNames(bold)}${standTxt}.`,
  ])
  // Anbieter-Sätze nur, wenn sie etwas Neues sagen: Legacy-Flags ohne Sprach-/
  // Episodendaten würden bei einem einzelnen Anbieter nur den Einstieg wiederholen.
  const providerLines = groups
    .slice(0, 4)
    .filter((g) => !(isLegacy(g) && groups.length === 1))
    .map((g, i) => providerSentence(anime, short, g, i))
  paragraphs.push([intro, ...providerLines].join(' '))

  // Absatz 2 — Sprachfassung & Kosten (nur mit belegten Daten)
  if (!s.legacy) {
    const dubAt = groups.filter(hasDe).map((g) => g.provider.name)
    const subOnly = groups.filter((g) => !hasDe(g) && hasDeSub(g)).map((g) => g.provider.name)
    const freeAt = groups.filter(isFree).map((g) => g.provider.name)
    const parts: string[] = []
    if (dubAt.length) {
      parts.push(vary(anime, 1, [
        `**Ger Dub oder Ger Sub?** Beides geht: Mit deutscher Synchro läuft ${short} bei ${joinNames(dubAt.map((n) => `**${n}**`))}${subOnly.length ? `, im Originalton mit deutschen Untertiteln bei ${joinNames(subOnly)}` : ''}.`,
        `Kein Mitlesen nötig: ${joinNames(dubAt.map((n) => `**${n}**`))} ${dubAt.length > 1 ? 'haben' : 'hat'} ${short} **mit deutscher Synchro**${subOnly.length ? ` – wer lieber OmU schaut, wird bei ${joinNames(subOnly)} glücklich` : ''}.`,
        `Für Dub-Fans: Die **deutsche Synchronfassung** gibt es bei ${joinNames(dubAt.map((n) => `**${n}**`))}${subOnly.length ? `; ${joinNames(subOnly)} ${subOnly.length > 1 ? 'setzen' : 'setzt'} auf Original mit deutschen Untertiteln` : ''}.`,
      ]))
    } else if (groups.some(hasDeSub)) {
      parts.push(vary(anime, 1, [
        `Eine deutsche Synchro gibt es (noch) nicht – ${short} läuft **im japanischen Original mit deutschen Untertiteln**. Für OmU-Fans ohnehin die erste Wahl.`,
        `**Ger Sub statt Ger Dub:** Aktuell ist ${short} nur im Original mit deutschen Untertiteln im Stream. Sobald ein Anbieter eine Synchro nachschiebt, steht es hier.`,
      ]))
    } else {
      parts.push(`Eine deutsche Fassung ist bislang nicht gelistet – ${short} läuft **im Original mit Untertiteln**.`)
    }
    if (freeAt.length) {
      parts.push(vary(anime, 2, [
        `**Gratis-Tipp:** Bei ${joinNames(freeAt)} schaust du ${short} kostenlos – werbefinanziert, aber ohne Abo.`,
        `Und das Beste: Bei ${joinNames(freeAt)} kostet ${short} keinen Cent – ein paar Werbepausen, dafür kein Abo.`,
      ]))
    } else {
      parts.push(vary(anime, 2, [
        `Ein Gratis-Stream ist derzeit nicht dabei – für ${short} brauchst du ein Abo bei einem der genannten Dienste.`,
        `Kostenlos gibt's ${short} momentan nirgends; ohne Abo läuft hier nichts.`,
      ]))
    }
    paragraphs.push(parts.join(' '))
  }

  // Absatz 3 — Einordnung & Aufforderung (Studio, Season, Genre, Folgen, Simulcast)
  const genreTxt = gen.length ? joinNames(gen.slice(0, 3)) : ''
  const when = year ? (anime?.season ? `${seasonLabel(anime.season)} ${year}` : `${year}`) : ''
  const origin = vary(anime, 3, [
    `Zur Einordnung: ${short} ${isMovie ? 'ist ein Anime-Film' : 'ist eine Serie'}${studio ? ` von **${studio}**` : ''}${when ? ` (${when})` : ''}${genreTxt ? ` – ${genreTxt}` : ''}${!isMovie && anime?.episodes ? `, ${anime.episodes} Folgen` : ''}.`,
    `${studio ? `**${studio}**` : 'Das Studio'} liefert hier ${genreTxt ? `${genreTxt}` : 'Anime'}${when ? ` aus dem ${when}` : ''}${!isMovie && anime?.episodes ? ` – ${anime.episodes} Folgen, ${anime.episodes > 26 ? 'also genug Stoff für einen ausgedehnten Binge' : 'perfekt für ein Wochenende'}` : ''}.`,
    `Falls du noch überlegst: ${genreTxt ? `${genreTxt}` : 'Anime'}${studio ? ` aus dem Hause **${studio}**` : ''}${when ? `, ${when}` : ''}${!isMovie && anime?.episodes ? `, ${anime.episodes} Folgen` : ''} – ${short} ist ${anime?.averageScore >= 80 ? 'zu Recht ein Community-Liebling' : 'einen Blick wert'}.`,
  ])
  const simulcast = running
    ? vary(anime, 4, [
        ` **Simulcast-Alarm:** Die Serie läuft aktuell, neue Folgen kommen frisch aus Japan – die Termine stehen in unserem Kalender.`,
        ` Und: ${short} läuft gerade – jede Woche eine neue Folge im Simulcast, den Sendeplan findest du im Kalender.`,
      ])
    : ''
  const cta = vary(anime, 5, [
    ` Also: Watchlist auf, **${names[0]}** an – der Link oben führt direkt zum Titel.`,
    ` Ein Klick auf **${names[0]}** und es geht los, ohne Suchen im Katalog.`,
    ` Bei **${names[0]}** jetzt ${short} schauen – die Karte oben bringt dich direkt hin.`,
  ])
  const note = vary(anime, 6, [
    ` Lizenzen wandern – wir gleichen die Verfügbarkeit regelmäßig ab.`,
    ` Sollte sich an der Verfügbarkeit etwas ändern, steht es hier zuerst.`,
  ])
  paragraphs.push(origin + simulcast + cta + note)

  // FAQ (Antworten bewusst ohne Marker: gehen 1:1 ins FAQPage-JSON-LD)
  const faq: FaqItem[] = []
  faq.push({
    q: `Wo kann man ${short} streamen?`,
    a: `${short} läuft in Deutschland bei ${joinNames(names)}${standTxt}. Die Karten auf dieser Seite führen direkt zum Titel beim jeweiligen Anbieter.`,
  })
  if (!s.legacy) {
    const dubAt = groups.filter(hasDe).map((g) => g.provider.name)
    faq.push({
      q: `Gibt es ${short} mit deutscher Synchro?`,
      a: dubAt.length
        ? `Ja – mit Ger Dub läuft ${short} bei ${joinNames(dubAt)}.`
        : `Noch nicht. Aktuell gibt es ${short} nur im Original mit Untertiteln; sobald ein Anbieter eine deutsche Synchro listet, erscheint sie hier.`,
    })
    const freeAt = groups.filter(isFree).map((g) => g.provider.name)
    faq.push({
      q: `Kann man ${short} kostenlos streamen?`,
      a: freeAt.length
        ? `Ja, bei ${joinNames(freeAt)} läuft ${short} kostenlos (werbefinanziert, ohne Abo).`
        : `Nein, ${short} gibt es momentan nur im Abo – bei ${joinNames(names)}.`,
    })
  }
  // „Läuft X auf Netflix/Crunchyroll?" — die zwei meistgesuchten Dienste, jeweils Ja/Nein.
  for (const big of ['Netflix', 'Crunchyroll']) {
    const g = groups.find((x) => x.provider.name === big)
    if (g) {
      faq.push({ q: `Läuft ${short} auf ${big}?`, a: `Ja. ${providerSentence(anime, short, g, 0).replace(/\*\*/g, '')}` })
    } else if (faq.length < 5) {
      faq.push({ q: `Läuft ${short} auf ${big}?`, a: `Nein, bei ${big} ist ${short} derzeit nicht im Programm. Stattdessen läuft der Titel bei ${joinNames(names)}.` })
    }
  }
  if (!isMovie && anime?.episodes) {
    faq.push({ q: `Wie viele Folgen hat ${short}?`, a: `${short} umfasst ${anime.episodes} Folgen${running ? ' – die Serie läuft noch, es kommen wöchentlich neue dazu' : ''}.` })
  }

  const heading = vary(anime, 8, [
    `${short} streamen: Anbieter, Sprachen & Kosten`,
    `Wo kann ich ${short} streamen?`,
    `${short} online schauen – alle Anbieter im Überblick`,
    `${short} legal streamen: So geht's`,
  ])
  return { heading, paragraphs, faq: faq.slice(0, 6) }
}
