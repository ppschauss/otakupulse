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

export type OverviewRow = { label: string; value: string }
/** Textsektion (A–F der Vorlage): Überschrift, Absätze mit **fett**-Markern, optional Unterabschnitte je Anbieter. */
export type GuideSection = {
  id: string
  heading: string
  paragraphs: string[]
  subsections?: { heading: string; paragraph: string }[]
  /** Abschluss-Satz mit Link: „{before}<a>{linkText}</a>{after}" */
  ctaSentence?: { before: string; linkText: string; after: string; url: string }
}
export type StreamingGuideData = {
  heading: string
  intro: string
  /** Sektion A — steht zwischen Intro und Anbieter-Übersicht. */
  howTo: GuideSection
  overviewHeading: string
  overview: OverviewRow[]
  cta: { url: string; provider: string; text: string; title: string; lead: string }
  /** Sektionen B–E — nach dem CTA. */
  sections: GuideSection[]
  /** Sektion F — vor der FAQ. */
  summary: GuideSection
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
  const studio = studioName(anime)
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

  // --- Sektionen A–F (Vorlage; bedingte Teile nur mit Daten)
  const subOnly = subAt.filter((n) => !dubAt.includes(n))
  const aboAt = groups.filter((g) => !isFree(g)).map((g) => g.provider.name)
  const b = (names: string[]) => joinNames(names.map((n) => `**${n}**`))
  const expiringGroups = groups.filter((g) => g.offers[0].availableTo)
  const maxSeasons = Math.max(0, ...groups.map((g) => g.offers[0].seasons || 0))

  // A · „{Titel} streamen: So findest du den richtigen Stream"
  const howTo: GuideSection = {
    id: 'stream-finden',
    heading: `${title} streamen: So findest du den richtigen Stream`,
    paragraphs: [
      `Du möchtest **${title} streamen**, weißt aber nicht, welcher Dienst den Anime im Programm hat? Kein Problem: Aktuell kannst du **${title} online schauen** bei ${bold}. ${
        many
          ? 'Welcher Anbieter für dich der richtige ist, hängt davon ab, ob du lieber auf Deutsch oder im Originalton schaust, ob du ein Abo hast oder gratis streamen willst – die Unterschiede findest du weiter unten.'
          : `Damit gibt es in Deutschland genau eine legale Anlaufstelle, um **${title} im Stream** zu sehen.`
      }`,
      `Die Verfügbarkeit von **${title}** prüfen wir regelmäßig gegen die Anbieter-Kataloge${stand ? ` (letzter Abgleich: **${stand}**)` : ''}. Alle Links auf dieser Seite führen direkt zum Titel beim jeweiligen Dienst – kein Umweg über die Suche, kein Raten, ob der Anime noch im Sortiment ist.`,
    ],
  }

  const sections: GuideSection[] = []

  // B · Sprache
  sections.push({
    id: 'deutsch',
    heading: `${title} auf Deutsch streamen – Ger Dub & Ger Sub`,
    paragraphs: [
      dubAt.length
        ? `Für alle, die **${title} auf Deutsch streamen** wollen: Die deutsche Synchronfassung (**Ger Dub**) läuft bei ${b(dubAt)}.${
            subOnly.length ? ` Wer den japanischen Originalton bevorzugt, findet **${title} mit deutschen Untertiteln** (Ger Sub) bei ${b(subOnly)}.` : ''
          } So kannst du frei entscheiden, ob du ${title} synchronisiert oder im Original mit Untertiteln schaust.`
        : subAt.length
          ? `Eine deutsche Synchronfassung von **${title}** gibt es im Stream bislang nicht. Bei ${b(subAt)} läuft der Anime im japanischen Originalton mit **deutschen Untertiteln (Ger Sub)** – für viele Fans ohnehin die erste Wahl, weil die Original-Sprecher erhalten bleiben. Sobald ein Anbieter einen **Ger Dub** ergänzt, tragen wir das hier ein.`
          : `Welche Sprachfassungen für **${title}** verfügbar sind, prüfst du am besten direkt bei ${bold} – die meisten Dienste bieten wahlweise Ger Dub oder den japanischen Originalton mit deutschen Untertiteln.`,
    ],
  })

  // C · Kosten
  const costParas: string[] = []
  if (s.legacy) {
    costParas.push(`Ob du **${title} kostenlos streamen** kannst oder ein Abo brauchst, hängt vom Anbieter ab: ${bold} ${many ? 'zeigen' : 'zeigt'} den Anime aktuell im Programm – die genauen Konditionen prüfst du am besten direkt beim Dienst.`)
  } else if (freeAt.length) {
    costParas.push(`Ja, du kannst **${title} kostenlos streamen**: Bei ${b(freeAt)} läuft der Anime werbefinanziert und ohne Abo – legal und in Deutschland.${aboAt.length ? ` Wer ohne Werbung schauen möchte, bekommt **${title} im Abo** bei ${b(aboAt)}.` : ''}`)
  } else {
    costParas.push(`Einen kostenlosen Stream gibt es für **${title}** derzeit nicht – der Anime läuft ausschließlich im Abo bei ${bold}. Viele Dienste bieten allerdings einen Probemonat an, mit dem du **${title} gratis testen** kannst.`)
  }
  if (stores.length) {
    costParas.push(`Alternativ kannst du **${title} kaufen oder leihen**: Bei ${b(stores.map((st) => st.provider.name))} ist der Anime als digitaler Einzelkauf${stores.some((st) => st.rent) ? ' oder zur Leihe' : ''} erhältlich – praktisch, wenn du kein Abo abschließen willst.`)
  }
  sections.push({ id: 'kostenlos', heading: `${title} kostenlos streamen? Abo, Gratis-Stream & Kauf im Vergleich`, paragraphs: costParas })

  // D · Folgen, Staffeln & Simulcast
  const releaseTxt = release ? ` aus dem **${release}**` : ''
  const studioTxt = studio ? ` von **${studio}**` : ''
  sections.push({
    id: 'folgen',
    heading: `${title} online schauen: Folgen, Staffeln & Simulcast`,
    paragraphs: [
      isMovie
        ? `**${title}** ist ein Anime-Film${releaseTxt}${studioTxt}. Du kannst den **Film online streamen** bei ${bold} – in voller Länge und ${dubAt.length ? 'wahlweise mit deutscher Synchro oder ' : ''}im japanischen Original.`
        : `**${title}**${anime?.episodes ? ` umfasst **${anime.episodes} Folgen**${maxSeasons > 1 ? ` in ${maxSeasons} Staffeln` : ''} und` : ''} stammt${releaseTxt || ' aus Japan'}${studioTxt}.${
            running
              ? ` Die Serie läuft aktuell im **Simulcast** – neue Folgen erscheinen zeitnah zur Japan-Ausstrahlung bei ${bold}; die Sendetermine findest du in unserem Simulcast-Kalender.`
              : anime?.status === 'NOT_YET_RELEASED'
                ? ` Die Serie ist angekündigt; sobald sie startet, findest du hier, wer den Simulcast zeigt.`
                : ` Die Serie ist abgeschlossen, du kannst **${title} komplett streamen** und alle Folgen am Stück schauen.`
          }${
            expiringGroups.length
              ? ` Beachte: ${expiringGroups
                  .map((g, i) => `${i === 0 ? `Bei **${g.provider.name}** ist ${title} nur noch` : `bei **${g.provider.name}**`} bis **${formatDateDe(g.offers[0].availableTo)}**${i === 0 ? ' verfügbar' : ''}`)
                  .join(', ')}.`
              : ''
          }`,
    ],
  })

  // E · ein Absatz je Anbieter (max. 4)
  const providerPara = (g: Group) => {
    const profile = g.provider.blurb ? g.provider.blurb.replace(/\.$/, '') : `Streaming-Anbieter für Anime in Deutschland`
    const facts = s.legacy
      ? ''
      : [costPhrase(g), langPhrase(g), scopePhrase(g)].filter(Boolean).join(', ')
    return `**${g.provider.name}** – ${profile}. Für **${title}** bedeutet das: ${facts || `der Anime ist dort im Programm`}. Wenn du ohnehin ein ${g.provider.name}-Abo hast, ist das der schnellste Weg, **${title} zu streamen**.`
  }
  const top = groups.slice(0, 4)
  sections.push({
    id: 'anbieter',
    heading: `Warum ${title} bei ${first.provider.name} streamen?`,
    paragraphs: [providerPara(top[0])],
    subsections: top.slice(1).map((g) => ({ heading: g.provider.name, paragraph: providerPara(g) })),
  })

  // F · Fazit
  const summary: GuideSection = {
    id: 'fazit',
    heading: `Fazit: Wer streamt ${title}?`,
    paragraphs: [
      `Kurz zusammengefasst: **${title} streamen** kannst du in Deutschland bei ${bold}${
        dubAt.length ? ' – auf Deutsch (Ger Dub)' : subAt.length ? ' – im Original mit deutschen Untertiteln' : ''
      }${freeAt.length ? `, bei ${joinNames(freeAt)} sogar kostenlos` : ''}. Die Lizenzlage kann sich ändern; wir halten diese Seite aktuell${stand ? ` (Stand: ${stand})` : ''}.`,
    ],
    ctaSentence: { before: 'Jetzt ', linkText: `${title} bei ${first.provider.name} streamen`, after: ' und direkt loslegen.', url: first.offers[0].url },
  }

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

  return { heading, intro, howTo, overviewHeading, overview, cta, sections, summary, faqHeading, faq }
}
