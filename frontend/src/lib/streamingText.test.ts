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
  it('null ohne Anbieter', () => {
    expect(streamingGuide({ id: 1, titleEnglish: 'X' })).toBeNull()
  })
  it('liefert Absätze mit Anbieter-, Sprach- und Kostenaussagen sowie FAQ', () => {
    const g = streamingGuide(naruto)!
    const text = g.paragraphs.join(' ')
    expect(g.paragraphs).toHaveLength(3)
    expect(text).toContain('**Crunchyroll**')
    expect(text).toMatch(/deutsche(r|n) Synchro/)
    expect(text).toContain('31.10.2026')
    expect(text).toContain('5 Staffeln mit 173 Folgen')
    expect(text).toMatch(/Joyn/)
    expect(text).toContain('**Pierrot**')
    expect(text).toMatch(/Herbst 2002/)
    const qs = g.faq.map((f) => f.q)
    expect(qs).toContain('Wo kann man Naruto streamen?')
    expect(qs).toContain('Gibt es Naruto mit deutscher Synchro?')
    expect(qs).toContain('Läuft Naruto auf Netflix?')
    expect(g.faq.find((f) => f.q === 'Läuft Naruto auf Netflix?')!.a).toMatch(/^Nein/)
    expect(g.faq.find((f) => f.q === 'Läuft Naruto auf Crunchyroll?')!.a).toMatch(/^Ja/)
    expect(g.faq.find((f) => f.q === 'Kann man Naruto kostenlos streamen?')!.a).toMatch(/^Ja, bei Joyn/)
    expect(g.faq.map((f) => f.a).join(' ')).not.toContain('**')
  })
  it('Legacy: nur Anbieter-Absatz + Einordnung, keine Sprach-FAQ', () => {
    const g = streamingGuide({ id: 3, titleEnglish: 'Z', streamingProviders: ['netflix'], format: 'TV', episodes: 12 })!
    expect(g.paragraphs).toHaveLength(2)
    expect(g.paragraphs.join(' ')).not.toContain('Synchro')
    expect(g.faq.map((f) => f.q)).not.toContain('Gibt es Z mit deutscher Synchro?')
  })
  it('variiert Einstieg und Überschrift über die ID', () => {
    const a = streamingGuide({ ...naruto, id: 1 })!
    const b = streamingGuide({ ...naruto, id: 2 })!
    expect(a.heading).not.toBe(b.heading)
    expect(a.paragraphs[0].slice(0, 20)).not.toBe(b.paragraphs[0].slice(0, 20))
  })
})
