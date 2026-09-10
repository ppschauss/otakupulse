import { describe, it, expect } from 'vitest'
import {
  providerBySlug,
  providerByName,
  streamingProvidersOf,
  PROVIDER_SLUGS,
  DE_PROVIDER_SLUGS,
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
