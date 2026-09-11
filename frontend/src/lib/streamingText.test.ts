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
    expect(shortTitle('A Certain Magical Index II')).toBe('A Certain Magical Index II')
  })
})

describe('streamingGuide', () => {
  it('null ohne Anbieter (Kauf/Leih allein zählt nicht)', () => {
    expect(streamingGuide({ id: 1, titleEnglish: 'X' })).toBeNull()
    expect(streamingGuide({ id: 1, titleEnglish: 'X', streamingOffers: [{ provider: 'amazon-video', url: 'https://a', monetization: 'buy', audio: '', subs: '' }] })).toBeNull()
  })
  it('liefert Intro, Übersicht, CTA, Absätze und FAQ mit Datenaussagen', () => {
    const g = streamingGuide({ ...naruto, streamingOffers: [...naruto.streamingOffers, { provider: 'amazon-video', url: 'https://av', monetization: 'buy', audio: '', subs: '' }, { provider: 'amazon-video', url: 'https://av', monetization: 'rent', audio: '', subs: '' }] })!
    expect(g.heading).toMatch(/^Wer streamt Naruto/)
    expect(g.intro).toContain('**Naruto**')
    expect(g.overview.map((r) => r.label)).toEqual(['Streaming-Anbieter', 'Audio-Spuren', 'Untertitel', 'Kosten', 'Kaufen / Leihen', 'Release', 'Studio', 'Status'])
    expect(g.overview[0].value).toBe('Crunchyroll, Amazon Prime Video, Joyn')
    expect(g.overview[1].value).toContain('Deutsch (Amazon Prime Video, Joyn)')
    expect(g.overview[4].value).toBe('Amazon Video (Kauf/Leihe)')
    expect(g.cta.url).toBe('https://cr/x')
    expect(g.cta.provider).toBe('Crunchyroll')
    const text = g.paragraphs.join(' ')
    expect(text).toContain('**Crunchyroll**')
    expect(text).toContain('31.10.2026')
    expect(text).toContain('5 Staffeln mit 173 Folgen')
    expect(g.overview.find((r) => r.label === 'Studio')!.value).toBe('Pierrot')
    const qs = g.faq.map((f) => f.q)
    expect(qs).toEqual([
      'Wer hat Naruto aktuell im Angebot?',
      'Wer streamt Naruto auf Deutsch?',
      'Wer zeigt den Simulcast von Naruto?',
      'Streamen auch Netflix, Crunchyroll oder Amazon Prime Video Naruto?',
      'Kann man Naruto auch ohne Abo streamen, kaufen oder leihen?',
      'Warum ändert sich manchmal, wer Naruto streamt?',
    ])
    expect(g.faq[1].a).toContain('Amazon Prime Video und Joyn')
    expect(g.faq[2].a).toMatch(/abgeschlossen/)
    expect(g.faq[3].a).toContain('Ja: Crunchyroll und Amazon Prime Video')
    expect(g.faq[3].a).toContain('Bei Netflix ist Naruto derzeit nicht gelistet')
    expect(g.faq[4].a).toContain('Joyn')
    expect(g.faq[4].a).toContain('Amazon Video')
    expect(g.faq[5].a).toContain('Amazon Prime Video (bis 31.10.2026)')
    expect(g.faq.map((f) => f.a).join(' ')).not.toContain('**')
  })
  it('Legacy: Übersicht ohne Sprach-/Kostenzeilen, keine Sprach-FAQ', () => {
    const g = streamingGuide({ id: 3, titleEnglish: 'Z', streamingProviders: ['netflix'], format: 'TV', episodes: 12, status: 'RELEASING' })!
    expect(g.overview.map((r) => r.label)).toEqual(['Streaming-Anbieter', 'Release', 'Status'])
    expect(g.faq.map((f) => f.q)).not.toContain('Wer streamt Z auf Deutsch?')
    expect(g.faq.find((f) => f.q.startsWith('Wer zeigt den Simulcast'))!.a).toContain('läuft aktuell im Simulcast')
  })
  it('variiert Einstieg und Überschrift über die ID', () => {
    const a = streamingGuide({ ...naruto, id: 1 })!
    const b = streamingGuide({ ...naruto, id: 2 })!
    expect(a.heading).not.toBe(b.heading)
    expect(a.intro.slice(0, 20)).not.toBe(b.intro.slice(0, 20))
  })
})
