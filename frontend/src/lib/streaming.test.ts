import { describe, it, expect } from 'vitest'
import {
  providerBySlug,
  providerByName,
  streamingProvidersOf,
  PROVIDER_SLUGS,
  DE_PROVIDER_SLUGS,
  streamingOffersOf,
  groupOffersByProvider,
  streamingSummary,
} from './streaming'

describe('providerBySlug', () => {
  it('findet einen Anbieter über seinen Slug', () => {
    expect(providerBySlug('crunchyroll')?.name).toBe('Crunchyroll')
  })
  it('liefert undefined bei unbekanntem Slug', () => {
    expect(providerBySlug('gibtsnicht')).toBeUndefined()
  })
})

describe('providerByName', () => {
  it('matcht über Name und Aliase (case-insensitiv)', () => {
    expect(providerByName('Crunchyroll')?.slug).toBe('crunchyroll')
    expect(providerByName('crunchyroll')?.slug).toBe('crunchyroll')
    expect(providerByName('Wakanim')?.slug).toBe('crunchyroll')
  })
  it('liefert undefined bei null/undefined/leer', () => {
    expect(providerByName(null)).toBeUndefined()
    expect(providerByName(undefined)).toBeUndefined()
    expect(providerByName('unbekannt-xyz')).toBeUndefined()
  })
})

describe('streamingProvidersOf', () => {
  it('mappt Slugs auf Anbieter und nutzt externalLink falls vorhanden', () => {
    const res = streamingProvidersOf({
      streamingProviders: ['crunchyroll'],
      externalLinks: [{ platform: 'Crunchyroll', url: 'https://cr.com/x' }],
    })
    expect(res).toHaveLength(1)
    expect(res[0].provider.slug).toBe('crunchyroll')
    expect(res[0].url).toBe('https://cr.com/x')
  })
  it('fällt auf die Homepage zurück, wenn kein externalLink passt', () => {
    const res = streamingProvidersOf({ streamingProviders: ['crunchyroll'], externalLinks: [] })
    expect(res[0].url).toBe(providerBySlug('crunchyroll')!.homepage)
  })
  it('ignoriert unbekannte Slugs und liefert [] bei fehlenden Daten', () => {
    expect(streamingProvidersOf({ streamingProviders: ['gibtsnicht'] })).toEqual([])
    expect(streamingProvidersOf({})).toEqual([])
    expect(streamingProvidersOf(null)).toEqual([])
  })
  it('sortiert nach Register-Reihenfolge (wichtigste zuerst)', () => {
    const a = PROVIDER_SLUGS[3]
    const b = PROVIDER_SLUGS[1]
    const res = streamingProvidersOf({ streamingProviders: [a, b] })
    expect(res.map((r) => r.provider.slug)).toEqual([b, a])
  })
})

describe('Register: DE-Anbieter', () => {
  it('kennt Aniverse, ADN und Toggo mit Homepage', () => {
    for (const s of ['aniverse', 'adn', 'toggo']) {
      const p = providerBySlug(s)
      expect(p?.homepage).toMatch(/^https:\/\//)
      expect(p?.region).toBe('DE')
    }
  })
  it('DE_PROVIDER_SLUGS enthält nur DE-Anbieter und keine US/Asien-Dienste', () => {
    expect(DE_PROVIDER_SLUGS).toContain('crunchyroll')
    expect(DE_PROVIDER_SLUGS).toContain('joyn')
    expect(DE_PROVIDER_SLUGS).not.toContain('hulu')
    expect(DE_PROVIDER_SLUGS).not.toContain('bilibili')
  })
  it('matcht JustWatch-Amazon-Channels auf die Marke', () => {
    expect(providerByName('Aniverse Amazon Channel')?.slug).toBe('aniverse')
    expect(providerByName('Anime Digital Network Amazon Channel')?.slug).toBe('adn')
    expect(providerByName('RTL+ Max Amazon Channel')?.slug).toBe('rtl-plus')
  })
})

const offersAnime = {
  streamingProviders: ['crunchyroll', 'joyn'],
  externalLinks: [{ platform: 'Crunchyroll', url: 'https://www.crunchyroll.com/naruto' }],
  availableLanguages: ['ja'],
  streamingCheckedAt: '2026-09-10T00:00:00.000Z',
  streamingOffers: [
    { id: 'a', provider: 'joyn', url: 'https://www.joyn.de/serien/naruto', monetization: 'ads', audio: 'de', subs: '', seasons: 5, episodes: 220, firstSeenAt: '2026-09-05T00:00:00.000Z' },
    { id: 'b', provider: 'crunchyroll', url: 'https://www.crunchyroll.com/watch/GYK5PJV7R', monetization: 'flatrate', audio: 'en,ja', subs: 'de,en', seasons: 5, episodes: 172, firstSeenAt: '2026-01-01T00:00:00.000Z' },
    { id: 'c', provider: 'gibtsnicht', url: 'https://x', monetization: 'flatrate', audio: '', subs: '' },
  ],
}

describe('streamingOffersOf', () => {
  it('liefert Offers in Register-Reihenfolge, parst CSV-Sprachen, ignoriert unbekannte Anbieter', () => {
    const v = streamingOffersOf(offersAnime)
    expect(v.map((x) => x.provider.slug)).toEqual(['crunchyroll', 'joyn'])
    expect(v[0].offer.subs).toEqual(['de', 'en'])
    expect(v[1].offer.audio).toEqual(['de'])
    expect(v[0].offer.legacy).toBeUndefined()
  })
  it('fällt ohne Offers auf die Legacy-Flags zurück (markiert als legacy)', () => {
    const v = streamingOffersOf({ ...offersAnime, streamingOffers: [] })
    expect(v.map((x) => x.provider.slug)).toEqual(['crunchyroll', 'joyn'])
    expect(v[0].offer.url).toBe('https://www.crunchyroll.com/naruto')
    expect(v[0].offer.legacy).toBe(true)
    expect(v[1].offer.url).toBe('https://www.joyn.de')
  })
})

describe('groupOffersByProvider', () => {
  it('bündelt mehrere Monetarisierungen desselben Anbieters', () => {
    const v = streamingOffersOf({
      streamingOffers: [
        { provider: 'crunchyroll', url: 'https://a', monetization: 'flatrate', audio: '', subs: '' },
        { provider: 'crunchyroll', url: 'https://b', monetization: 'free', audio: '', subs: '' },
      ],
    })
    const g = groupOffersByProvider(v)
    expect(g).toHaveLength(1)
    expect(g[0].offers.map((o) => o.monetization)).toEqual(['flatrate', 'free'])
  })
})

describe('streamingSummary', () => {
  it('leitet Dub/Sub, Kostenlos und Neu aus den Offers ab', () => {
    const s = streamingSummary(offersAnime, new Date('2026-09-10T12:00:00Z'))
    expect(s.hasStream).toBe(true)
    expect(s.providerNames).toEqual(['Crunchyroll', 'Joyn'])
    expect(s.hasDeDub).toBe(true) // Joyn audio=de
    expect(s.hasDeSub).toBe(true) // Crunchyroll subs=de
    expect(s.hasFree).toBe(true) // Joyn ads
    expect(s.isNew).toBe(true) // Joyn firstSeenAt 5 Tage alt
    expect(s.checkedAt).toBe('2026-09-10T00:00:00.000Z')
    expect(s.legacy).toBe(false)
  })
  it('nutzt im Legacy-Fall availableLanguages für Dub/Sub', () => {
    const s = streamingSummary({ streamingProviders: ['netflix'], availableLanguages: ['de-dub'] })
    expect(s.hasStream).toBe(true)
    expect(s.hasDeDub).toBe(true)
    expect(s.hasDeSub).toBe(false)
    expect(s.legacy).toBe(true)
  })
  it('ohne Anbieter: hasStream=false', () => {
    expect(streamingSummary({}).hasStream).toBe(false)
  })
})
