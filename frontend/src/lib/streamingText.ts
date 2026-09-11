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
  // Zwei „mit" hintereinander (kostenlos mit Werbung, mit deutscher Synchro) per Komma trennen.
  const details = cost && lang ? (cost.includes('mit') && lang.startsWith('mit') ? `${cost}, ${lang}` : `${cost} ${lang}`) : cost || lang
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

export type OverviewRow = { label: string; value: string }
export type StreamingGuideData = {
  heading: string
  intro: string
  overview: OverviewRow[]
  cta: { url: string; provider: string; text: string; title: string }
  paragraphs: string[]
  faq: FaqItem[]
}

/**
 * Guide für Titel mit Anbietern (Muster: Intro → Anbieter-Übersicht → CTA →
 * Fließtext → FAQ). Texte mit **fett**-Markern (components/RichLine), FAQ-Antworten
 * ohne Marker (gehen 1:1 ins FAQPage-JSON-LD). null ohne Anbieter.
 */
export function streamingGuide(anime: any): StreamingGuideData | null {
  const views = streamingOffersOf(anime)
  const groups = groupOffersByProvider(views)
  if (!groups.length) return null
  const title = displayTitle(anime)
  const short = shortTitle(title)
  const s = streamingSummary(anime)
  const names = groups.map((g) => g.provider.name)
  const bold = names.map((n) => `**${n}**`)
  const stand = formatDateDe(s.checkedAt)
  const standTxt = stand ? ` (Stand: ${stand})` : ''
  const year = yearOf(anime)
  const when = year ? (anime?.season ? `${seasonLabel(anime.season)} ${year}` : `${year}`) : ''
  const gen = genres(anime)
  const genreTxt = gen.length ? joinNames(gen.slice(0, 3)) : ''
  const studio = studioName(anime)
  const isMovie = anime?.format === 'MOVIE'
  const running = anime?.status === 'RELEASING'
  const many = groups.length > 1
  const dubAt = groups.filter(hasDe).map((g) => g.provider.name)
  const subAt = groups.filter(hasDeSub).map((g) => g.provider.name)
  // Anbieter, die NUR Untertitel haben (für „alternativ bei …"); Dub-Anbieter mit Sub → „wahlweise".
  const subOnly = subAt.filter((n) => !dubAt.includes(n))
  const dubWithSub = dubAt.some((n) => subAt.includes(n))
  const freeAt = groups.filter(isFree).map((g) => g.provider.name)
  const stores = purchaseOffersOf(anime)
  const first = groups[0]
  const thing = isMovie ? 'der Film' : 'die Serie'
  const thingAcc = isMovie ? 'den Film' : 'die Serie'

  // --- Überschrift (immer „Wer streamt …" — die Suchphrase)
  const heading = vary(anime, 8, [
    `Wer streamt ${short}? Alle Anbieter & Optionen`,
    `Wer streamt ${short}? Anbieter, Sprachen, Kosten`,
    `Wer streamt ${short} in Deutschland?`,
  ])

  // --- Intro
  const langLead = s.legacy
    ? ''
    : dubAt.length
      ? ` Dort kannst du direkt einschalten und **${short} auf Deutsch streamen** – oder im japanischen Original mit Untertiteln.`
      : subAt.length
        ? ` Dort läuft ${thing} **im japanischen Original mit deutschen Untertiteln** – eine Synchro gibt es bislang nicht.`
        : ` Dort läuft ${thing} im Original mit Untertiteln.`
  const intro = vary(anime, 0, [
    `Auf der Suche nach dem passenden Stream für **${short}**? Hier ist die Antwort: ${when ? `Seit dem ${when} ` : ''}${many ? `führen ${joinNames(bold)} ${thingAcc}` : `führt ${bold[0]} ${thingAcc}`} im Sortiment${standTxt}.${langLead}`,
    `Gute Nachrichten für alle, die **${short}** auf der Watchlist haben: ${many ? `Gleich ${groups.length} Anbieter haben ${thingAcc} in Deutschland im Programm – ${joinNames(bold)}` : `${bold[0]} hat ${thingAcc} in Deutschland im Programm`}${standTxt}.${langLead}`,
    `Kurz und schmerzlos: **${short}** läuft bei ${joinNames(bold)}${standTxt}.${when ? ` ${isMovie ? 'Der Film' : 'Die Serie'} stammt aus dem ${when}${studio ? ` (${studio})` : ''}.` : ''}${langLead}`,
    `Legal, in Deutschland, ohne Umwege: **${short}** gibt's bei ${joinNames(bold)}${standTxt}.${langLead}`,
  ])

  // --- Übersicht
  const overview: OverviewRow[] = [{ label: many ? 'Streaming-Anbieter' : 'Streaming-Anbieter', value: names.join(', ') }]
  if (!s.legacy) {
    const audio: string[] = []
    if (dubAt.length) audio.push(`Deutsch (${dubAt.join(', ')})`)
    if (groups.some((g) => g.offers.some((o) => o.audio.includes('en')))) audio.push('Englisch')
    audio.push('Japanisch')
    overview.push({ label: 'Audio-Spuren', value: audio.join(' · ') })
    const subs: string[] = []
    if (subAt.length) subs.push(`Deutsch (${subAt.join(', ')})`)
    if (groups.some((g) => g.offers.some((o) => o.subs.includes('en')))) subs.push('Englisch')
    if (subs.length) overview.push({ label: 'Untertitel', value: subs.join(' · ') })
    const cost: string[] = []
    const aboAt = groups.filter((g) => !isFree(g)).map((g) => g.provider.name)
    if (aboAt.length) cost.push(`Abo (${aboAt.join(', ')})`)
    if (freeAt.length) cost.push(`kostenlos mit Werbung (${freeAt.join(', ')})`)
    overview.push({ label: 'Kosten', value: cost.join(' · ') })
  }
  if (stores.length) {
    overview.push({ label: 'Kaufen / Leihen', value: stores.map((st) => `${st.provider.name} (${[st.buy ? 'Kauf' : '', st.rent ? 'Leihe' : ''].filter(Boolean).join('/')})`).join(' · ') })
  }
  const release = [when, formatLabel(anime?.format), !isMovie && anime?.episodes ? `${anime.episodes} Folgen` : ''].filter(Boolean).join(' · ')
  if (release) overview.push({ label: 'Release', value: release })
  if (studio) overview.push({ label: 'Studio', value: studio })
  overview.push({ label: 'Status', value: running ? 'läuft aktuell (Simulcast)' : anime?.status === 'NOT_YET_RELEASED' ? 'angekündigt' : 'abgeschlossen' })

  // --- CTA
  const cta = {
    url: first.offers[0].url,
    provider: first.provider.name,
    text: vary(anime, 5, [
      `Zu ${first.provider.name} wechseln und ${short} streamen`,
      `${short} jetzt bei ${first.provider.name} schauen`,
      `Direkt zu ${short} auf ${first.provider.name}`,
    ]),
    title: `${title} online streamen bei ${first.provider.name}`,
  }

  // --- Fließtext: Anbieter-Details + Sprache/Kosten
  const paragraphs: string[] = []
  const providerLines = groups
    .slice(0, 4)
    .filter((g) => !(isLegacy(g) && groups.length === 1))
    .map((g, i) => providerSentence(anime, short, g, i))
  if (providerLines.length) {
    paragraphs.push(
      vary(anime, 9, [`Im Detail:`, `So sieht das Angebot im Einzelnen aus:`, `Die Anbieter im Überblick:`]) + ' ' + providerLines.join(' '),
    )
  }
  if (!s.legacy) {
    const parts: string[] = []
    if (dubAt.length) {
      parts.push(vary(anime, 1, [
        `**Ger Dub oder Ger Sub?** ${dubWithSub ? 'Beides, sogar beim selben Anbieter' : 'Beides geht'}: Mit deutscher Synchro läuft ${short} bei ${joinNames(dubAt.map((n) => `**${n}**`))}${dubWithSub ? ' – dort wahlweise auch im Original mit deutschen Untertiteln' : ''}${subOnly.length ? `${dubWithSub ? ';' : ','} nur mit Untertiteln bei ${joinNames(subOnly)}` : ''}.`,
        `Kein Mitlesen nötig: ${joinNames(dubAt.map((n) => `**${n}**`))} ${dubAt.length > 1 ? 'haben' : 'hat'} ${short} **mit deutscher Synchro**${dubWithSub ? ' (und für OmU-Fans auch mit deutschen Untertiteln)' : ''}${subOnly.length ? ` – wer lieber OmU schaut, wird bei ${joinNames(subOnly)} glücklich` : ''}.`,
        `Für Dub-Fans: Die **deutsche Synchronfassung** gibt es bei ${joinNames(dubAt.map((n) => `**${n}**`))}${dubWithSub ? ', auf Wunsch auch als Original mit deutschen Untertiteln' : ''}${subOnly.length ? `; nur Untertitel bei ${joinNames(subOnly)}` : ''}.`,
      ]))
    } else if (subAt.length) {
      parts.push(vary(anime, 1, [
        `Eine deutsche Synchro gibt es (noch) nicht – ${short} läuft **im japanischen Original mit deutschen Untertiteln**. Für OmU-Fans ohnehin die erste Wahl.`,
        `**Ger Sub statt Ger Dub:** Aktuell ist ${short} nur im Original mit deutschen Untertiteln im Stream. Sobald ein Anbieter eine Synchro nachschiebt, steht es hier.`,
      ]))
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
    if (stores.length) parts.push(`Wer lieber besitzt statt abonniert: ${joinNames(stores.map((st) => st.provider.name))} ${stores.length > 1 ? 'bieten' : 'bietet'} ${short} zum Kauf${stores.some((st) => st.rent) ? ' oder zur Leihe' : ''} an.`)
    paragraphs.push(parts.join(' '))
  }
  const closer = [
    running
      ? vary(anime, 4, [
          `**Simulcast-Alarm:** ${short} läuft aktuell – neue Folgen kommen frisch aus Japan, die Termine stehen im Kalender.`,
          `Und: ${short} läuft gerade – jede Woche eine neue Folge im Simulcast, den Sendeplan findest du im Kalender.`,
        ])
      : !isMovie && anime?.episodes
        ? vary(anime, 4, [
            `${anime.episodes} Folgen am Stück – ${anime.episodes > 26 ? 'genug Stoff für einen ausgedehnten Binge' : 'perfekt für ein Wochenende'}.`,
            `Die Serie ist abgeschlossen: alle ${anime.episodes} Folgen liegen bereit, kein Warten auf die nächste Woche.`,
          ])
        : '',
    vary(anime, 6, [
      `Lizenzen wandern – wir gleichen die Verfügbarkeit regelmäßig ab.`,
      `Sollte sich an der Verfügbarkeit etwas ändern, steht es hier zuerst.`,
    ]),
  ].filter(Boolean)
  paragraphs.push(closer.join(' '))

  // --- FAQ: dieselben Fragen wie im Muster, aber mit Daten beantwortet
  const faq: FaqItem[] = []
  faq.push({
    q: `Wer hat ${short} aktuell im Angebot?`,
    a: `${isMovie ? 'Der Film' : 'Der Anime'} ist derzeit bei ${joinNames(names)} gelistet${standTxt}. Die Karten oben führen direkt zum Titel beim jeweiligen Anbieter.`,
  })
  if (!s.legacy) {
    faq.push({
      q: `Wer streamt ${short} auf Deutsch?`,
      a: dubAt.length
        ? `Die deutsche Synchronfassung steht bei ${joinNames(dubAt)} zum Abruf bereit${dubWithSub ? ' – dort wahlweise auch im Original mit deutschen Untertiteln' : ''}.${subOnly.length ? ` Nur mit deutschen Untertiteln läuft ${short} bei ${joinNames(subOnly)}.` : ''}`
        : subAt.length
          ? `Eine deutsche Synchro gibt es bislang nicht; ${joinNames(subAt)} ${subAt.length > 1 ? 'zeigen' : 'zeigt'} ${short} im japanischen Original mit deutschen Untertiteln. Sobald ein Anbieter einen Dub listet, erscheint er hier.`
          : `Derzeit ist ${short} nur im Original mit Untertiteln im Stream – noch ohne deutsche Fassung.`,
    })
  }
  faq.push({
    q: `Wer zeigt den Simulcast von ${short}?`,
    a: running
      ? `${short} läuft aktuell im Simulcast: ${joinNames(names)} ${many ? 'zeigen' : 'zeigt'} neue Folgen zeitnah zur Japan-Ausstrahlung, meist mit Untertiteln wenige Stunden nach der Premiere. Die Sendetermine stehen in unserem Kalender.`
      : anime?.status === 'NOT_YET_RELEASED'
        ? `${short} ist angekündigt, aber noch nicht gestartet. Welcher Anbieter den Simulcast übernimmt, tragen wir ein, sobald es offiziell ist.`
        : `${short} ist abgeschlossen – einen laufenden Simulcast gibt es nicht mehr. Alle Folgen sind bei ${joinNames(names)} komplett abrufbar.`,
  })
  const bigs = ['Netflix', 'Crunchyroll', 'Amazon Prime Video']
  const yes = bigs.filter((b) => names.includes(b))
  const no = bigs.filter((b) => !names.includes(b))
  faq.push({
    q: `Streamen auch Netflix, Crunchyroll oder Amazon Prime Video ${short}?`,
    a: [
      yes.length ? `Ja: ${joinNames(yes)} ${yes.length > 1 ? 'haben' : 'hat'} ${short} im Programm.` : '',
      no.length ? `Bei ${joinNames(no)} ist ${short} derzeit nicht gelistet.` : '',
      `Streaming-Rechte werden je Land vergeben – wir zeigen hier ausschließlich den Stand für Deutschland${standTxt}.`,
    ].filter(Boolean).join(' '),
  })
  faq.push({
    q: `Kann man ${short} auch ohne Abo streamen, kaufen oder leihen?`,
    a: [
      freeAt.length ? `Ohne Abo geht es bei ${joinNames(freeAt)} – dort läuft ${short} kostenlos mit Werbung.` : `Einen kostenlosen Stream gibt es für ${short} derzeit nicht.`,
      stores.length
        ? `Als Einzelkauf${stores.some((st) => st.rent) ? ' oder Leihe' : ''} ist ${short} bei ${joinNames(stores.map((st) => st.provider.name))} erhältlich.`
        : `Ein Kauf- oder Leihangebot ist aktuell nicht gelistet.`,
    ].join(' '),
  })
  const expiring = groups.filter((g) => g.offers[0].availableTo).map((g) => `${g.provider.name} (bis ${formatDateDe(g.offers[0].availableTo)})`)
  faq.push({
    q: `Warum ändert sich manchmal, wer ${short} streamt?`,
    a: `Streaming-Rechte werden für bestimmte Zeiträume verhandelt; laufen Lizenzverträge aus oder werden verlängert, wandert ein Titel zwischen den Anbietern.${expiring.length ? ` Für ${short} ist aktuell ein Enddatum bekannt: ${joinNames(expiring)}.` : ''} Wir gleichen die Verfügbarkeit für diesen Titel regelmäßig mit den Anbieter-Katalogen ab${stand ? ` – zuletzt am ${stand}` : ''}.`,
  })

  return { heading, intro, overview, cta, paragraphs, faq }
}
