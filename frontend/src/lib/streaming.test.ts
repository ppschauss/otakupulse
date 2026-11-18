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
  offerContradictsEntry,
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

// QA-Gate: eine falsche Titel-Zuordnung verrät sich durch die Folgenzahl beim
// Anbieter. Grenze identisch zu episodes_implausible in justwatch-streaming.py.
describe('offerContradictsEntry', () => {
  it('verwirft Beiwerk mit dem Katalog der Hauptserie', () => {
    // „Haikyuu!!: Lev Kenzan!" — 1 Folge, Angebot über 87
    expect(offerContradictsEntry({ episodes: 1, format: 'OVA' }, { episodes: 87 })).toBe(true)
    expect(offerContradictsEntry({ episodes: 3, format: 'SPECIAL' }, { episodes: 18 })).toBe(true)
    expect(offerContradictsEntry({ episodes: 6, format: 'SPECIAL' }, { episodes: 37 })).toBe(true)
  })
  it('lässt Season-1-Einträge die Angebote der ganzen Serie behalten', () => {
    expect(offerContradictsEntry({ episodes: 12, format: 'TV' }, { episodes: 36 })).toBe(false)
    expect(offerContradictsEntry({ episodes: 12, format: 'TV_SHORT' }, { episodes: 36 })).toBe(false)
  })
  it('ONA zählt als Serie — Streaming-Originals sind nach Cours geteilt', () => {
    // Cyberpunk: Edgerunners (10 Folgen) bei Netflix mit 20, JoJo Stone Ocean (12) mit 38
    expect(offerContradictsEntry({ episodes: 10, format: 'ONA' }, { episodes: 20 })).toBe(false)
    expect(offerContradictsEntry({ episodes: 12, format: 'ONA' }, { episodes: 38 })).toBe(false)
    // Die harte Grenze gilt trotzdem
    expect(offerContradictsEntry({ episodes: 1, format: 'ONA' }, { episodes: 12 })).toBe(true)
  })
  it('die harte Grenze gilt auch für TV: ≤ 3 Folgen sind nie ein Angebot mit 3 mehr', () => {
    expect(offerContradictsEntry({ episodes: 1, format: 'TV' }, { episodes: 24 })).toBe(true)
  })
  it('kleine Abweichungen und unbekannte Zahlen sind kein Verdacht', () => {
    expect(offerContradictsEntry({ episodes: 12, format: 'OVA' }, { episodes: 13 })).toBe(false)
    expect(offerContradictsEntry({ episodes: 0, format: 'OVA' }, { episodes: 24 })).toBe(false)
    expect(offerContradictsEntry({ episodes: 24, format: 'MOVIE' }, { episodes: null })).toBe(false)
  })
  it('streamingOffersOf gibt widersprüchliche Angebote nicht aus', () => {
    const a = {
      episodes: 1,
      format: 'OVA' as string,
      streamingOffers: [
        { provider: 'crunchyroll', url: 'https://cr/x', monetization: 'flatrate', audio: 'de', subs: 'de', episodes: 85 },
        { provider: 'joyn', url: 'https://joyn/x', monetization: 'ads', audio: 'de', subs: '', episodes: 1 },
      ],
    }
    expect(streamingOffersOf(a).map((v) => v.provider.slug)).toEqual(['joyn'])
    expect(streamingSummary(a).providerNames).toEqual(['Joyn'])
  })
  it('kein Legacy-Fallback, wenn das Gate alle Angebote verwirft', () => {
    // Der Anbieter-Index stammt aus derselben falschen Zuordnung — sonst behauptet
    // die Seite den Anbieter weiter, nur ohne Sprache und Folgenzahl.
    const a = {
      episodes: 5,
      format: 'OVA' as string,
      streamingProviders: ['crunchyroll'],
      externalLinks: [{ platform: 'Crunchyroll', url: 'https://cr/x' }],
      streamingOffers: [{ provider: 'crunchyroll', url: 'https://cr/x', monetization: 'flatrate', audio: 'de', subs: '', episodes: 28 }],
    }
    expect(streamingOffersOf(a)).toEqual([])
    expect(streamingSummary(a).hasStream).toBe(false)
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
