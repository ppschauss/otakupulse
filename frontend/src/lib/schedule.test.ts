import { describe, it, expect } from 'vitest'
import { monthGrid, berlinMidnightIso, shiftYmd, toScheduleEpisode } from './schedule'

describe('schedule', () => {
  it('Monatsraster beginnt montags und füllt volle Wochen', () => {
    const g = monthGrid('2026-09-14')
    expect(g.days[0]).toMatchObject({ date: '2026-08-31', weekday: 0, otherMonth: true })
    expect(g.days[g.days.length - 1]).toMatchObject({ date: '2026-10-04', weekday: 6, otherMonth: true })
    expect(g.days.length % 7).toBe(0)
    expect(g.days.filter((d) => !d.otherMonth)).toHaveLength(30)
  })
  it('Berliner Mitternacht: Sommer- und Winterzeit', () => {
    expect(berlinMidnightIso('2026-09-14')).toBe('2026-09-13T22:00:00.000Z')
    expect(berlinMidnightIso('2026-12-14')).toBe('2026-12-13T23:00:00.000Z')
    expect(shiftYmd('2026-09-30', 1)).toBe('2026-10-01')
  })
  it('DTO: Hentai raus, Anbieter aus Offers, Cover lokal', () => {
    expect(toScheduleEpisode({ id: 1, number: 3, airDate: '2026-09-14T14:30:00Z', anime: { slug: 'x', titleRomaji: 'X', isHentai: true } })).toBeNull()
    const e = toScheduleEpisode({
      id: 1, number: 3, airDate: '2026-09-14T14:30:00Z',
      anime: { slug: 'x', titleRomaji: 'X', episodes: 12, coverImageLocal: '/media/x.jpg', genres: [{ slug: 'action' }],
        streamingOffers: [{ provider: 'crunchyroll', url: 'https://cr/x', monetization: 'flatrate', audio: '', subs: '' }, { provider: 'amazon-video', url: 'https://a', monetization: 'buy', audio: '', subs: '' }] },
    })!
    expect(e.providers.map((p) => p.slug)).toEqual(['crunchyroll'])
    expect(e.cover).toBe('/media/x.jpg')
    expect(e.genres).toEqual(['action'])
    expect(e.episodesTotal).toBe(12)
  })
})
