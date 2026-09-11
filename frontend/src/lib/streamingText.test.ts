import { describe, it, expect } from 'vitest'
import { streamingMetaDescription, streamingMetaTitle, streamingGuide, shortTitle } from './streamingText'

const naruto = {
  id: 7,
  titleEnglish: 'Naruto',
  format: 'TV',
  status: 'FINISHED',
  season: 'FALL',
  seasonYear: 2002,
  episodes: 220,
  genres: [{ name: 'Action' }, { name: 'Adventure' }],
  studios: [{ name: 'Pierrot', isAnimationStudio: true }],
  streamingCheckedAt: '2026-09-10T00:00:00.000Z',
  streamingOffers: [
    { provider: 'crunchyroll', url: 'https://cr/x', monetization: 'flatrate', audio: 'en,ja', subs: 'de,en', seasons: 5, episodes: 173 },
    { provider: 'joyn', url: 'https://joyn/x', monetization: 'ads', audio: 'de', subs: '', seasons: 5, episodes: 220 },
    { provider: 'amazon-prime-video', url: 'https://amz/x', monetization: 'flatrate', audio: 'de,ja', subs: 'de', seasons: 4, episodes: 108, availableTo: '2026-10-31' },
  ],
}

describe('streamingMetaDescription / Title', () => {
  it('nennt Anbieter, Sprache, Kostenlos, Genre, Format, Jahr und Folgen', () => {
    const d = streamingMetaDescription(naruto)
    expect(d).toBe('Naruto jetzt auf Crunchyroll, Amazon Prime Video und Joyn streamen – Deutscher Dub & Sub, teils kostenlos. Action/Adventure-Anime (TV-Serie, 2002, 220 Folgen).')
    const many = { ...naruto, streamingOffers: [...naruto.streamingOffers, { provider: 'netflix', url: 'https://n', monetization: 'flatrate', audio: '', subs: '' }, { provider: 'disney-plus', url: 'https://d', monetization: 'flatrate', audio: '', subs: '' }] }
    expect(streamingMetaDescription(many)).toContain('Crunchyroll, Netflix, Amazon Prime Video und 2 weiteren Anbietern streamen')
    expect(streamingMetaTitle(naruto)).toBe('Naruto streamen auf Crunchyroll, Amazon Prime Video und Joyn (Deutscher Dub) | OtakuPulse')
  })
  it('ohne Stream: Datenbank-Infos statt Anbieter', () => {
    const d = streamingMetaDescription({ id: 1, titleEnglish: 'X', format: 'MOVIE', seasonYear: 2001, genres: [{ name: 'Drama' }] })
    expect(d).toMatch(/^X: Drama-Anime \(Film, 2001\)\./)
    expect(streamingMetaTitle({ id: 1, titleEnglish: 'X' })).toBe('X — Anime: Infos, Charaktere & Stream | OtakuPulse')
  })
  it('Legacy-Flags: keine Sprachbehauptung', () => {
    const d = streamingMetaDescription({ id: 2, titleEnglish: 'Y', streamingProviders: ['netflix'], availableLanguages: ['de-dub'] })
    expect(d).toBe('Y jetzt auf Netflix streamen. Anime.')
  })
})

describe('shortTitle', () => {
  it('kürzt Untertitel und behält die Season', () => {
    expect(shortTitle('Re:ZERO -Starting Life in Another World- Season 4')).toBe('Re:ZERO Season 4')
    expect(shortTitle('Frieren: Beyond Journey’s End')).toBe('Frieren')
    expect(shortTitle('Naruto')).toBe('Naruto')
    expect(shortTitle('Your Name.')).toBe('Your Name')
    expect(shortTitle('A Certain Magical Index II')).toBe('A Certain Magical Index II')
  })
})

describe('streamingGuide (Vorlagen-Wortlaut + Datenzusätze)', () => {
  it('null ohne Streaming-Anbieter (Kauf/Leih allein zählt nicht)', () => {
    expect(streamingGuide({ id: 1, titleEnglish: 'X' })).toBeNull()
    expect(streamingGuide({ id: 1, titleEnglish: 'X', streamingOffers: [{ provider: 'amazon-video', url: 'https://a', monetization: 'buy', audio: '', subs: '' }] })).toBeNull()
  })
  it('übernimmt die Vorlagensätze wörtlich und hängt Fakten an', () => {
    const g = streamingGuide({ ...naruto, streamingOffers: [...naruto.streamingOffers, { provider: 'amazon-video', url: 'https://av', monetization: 'buy', audio: '', subs: '' }] })!
    expect(g.heading).toBe('Wer streamt Naruto? Alle Anbieter & Optionen')
    expect(g.intro).toContain('Auf der Suche nach dem passenden Stream für **Naruto**? Wir zeigen dir, wo du die Serie aktuell findest.')
    expect(g.intro).toContain('Seit dem **Herbst 2002** führen **Crunchyroll**, **Amazon Prime Video** und **Joyn** den Anime im Sortiment.')
    expect(g.intro).toContain('**Naruto auf Deutsch streamen** oder im japanischen Originalton genießen')
    expect(g.overviewHeading).toBe('Anbieter-Übersicht für Naruto')
    expect(g.overview.map((r) => r.label)).toEqual(['Streaming-Anbieter', 'Verfügbare Audio-Spuren', 'Release-Termin', 'Kosten', 'Kaufen / Leihen', 'Stand'])
    expect(g.overview[1].value).toBe('Deutsch & Japanisch (OmU)')
    expect(g.cta.lead).toBe('Jetzt direkt starten:')
    expect(g.cta.text).toBe('Zu Crunchyroll wechseln und Naruto streamen')
    expect(g.cta.title).toBe('Naruto online streamen bei Crunchyroll')
    expect(g.details).toContain('Bei **Crunchyroll** läuft Naruto im Abo im Original mit deutschen Untertiteln (5 Staffeln mit 173 Folgen).')
    expect(g.details).toContain('verfügbar bis **31.10.2026**')
    expect(g.faqHeading).toBe('FAQ zur Anbieter-Verfügbarkeit: Wer streamt Naruto?')
    expect(g.faq.map((f) => f.q)).toEqual([
      'Wer hat Naruto aktuell im Angebot?',
      'Wer streamt Naruto auf Deutsch?',
      'Wer zeigt den Simulcast von Naruto?',
      'Streamen auch Dienste wie Netflix, Crunchyroll oder Amazon Prime Video Naruto?',
      'Kann man Naruto auch ohne Abo streamen, kaufen oder leihen?',
      'Warum ändert sich manchmal, wer Naruto streamt?',
    ])
    expect(g.faq[0].a).toMatch(/^Der Anime ist derzeit bei Crunchyroll, Amazon Prime Video und Joyn gelistet \(Stand: 10\.09\.2026\)\. Je nach Ausstrahlungsmuster/)
    expect(g.faq[1].a).toMatch(/^Die Fassung mit der Tonspur Deutsch steht bei Amazon Prime Video und Joyn zum Abruf bereit\./)
    expect(g.faq[1].a).toContain('Nur mit deutschen Untertiteln läuft Naruto bei Crunchyroll.')
    expect(g.faq[2].a).toContain('Naruto ist bereits abgeschlossen; alle 220 Folgen sind komplett abrufbar.')
    expect(g.faq[3].a).toContain('hängt vom jeweiligen Rechtekatalog im deutschsprachigen Raum ab')
    expect(g.faq[3].a).toContain('Aktuell: Crunchyroll und Amazon Prime Video haben Naruto im Programm. Bei Netflix ist Naruto derzeit nicht gelistet')
    expect(g.faq[4].a).toContain('Wir prüfen regelmäßig, ob Naruto online schauen auch als digitaler Einzelkauf möglich ist.')
    expect(g.faq[4].a).toContain('Ohne Abo läuft Naruto bei Joyn')
    expect(g.faq[4].a).toContain('Als Einzelkauf ist Naruto aktuell bei Amazon Video erhältlich.')
    expect(g.faq[5].a).toContain('Bekanntes Enddatum: Amazon Prime Video bis 31.10.2026.')
    expect(g.faq.map((f) => f.a).join(' ')).not.toContain('**')
  })
  it('Legacy: Sprache aus globalen Flags, kein Detail-Absatz, Kosten-Zeile fehlt', () => {
    const g = streamingGuide({ id: 3, titleEnglish: 'Z', streamingProviders: ['netflix'], availableLanguages: ['de-dub'], format: 'TV', episodes: 12, status: 'RELEASING' })!
    expect(g.intro).toContain('**Netflix** führt den Anime im Sortiment.')
    expect(g.overview.map((r) => r.label)).toEqual(['Streaming-Anbieter', 'Verfügbare Audio-Spuren'])
    expect(g.details).toBeNull()
    expect(g.faq[1].a).toContain('Die Fassung mit der Tonspur Deutsch steht bei Netflix zum Abruf bereit.')
    expect(g.faq[2].a).toContain('Aktuell laufen neue Folgen')
  })
  it('Film: „den Film“ statt „die Serie“', () => {
    const g = streamingGuide({ id: 4, titleEnglish: 'Your Name.', format: 'MOVIE', streamingProviders: ['crunchyroll'] })!
    expect(g.intro).toContain('wo du den Film aktuell findest')
    expect(g.intro).toContain('führt den Film im Sortiment')
  })
})
