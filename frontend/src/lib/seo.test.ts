import { describe, it, expect } from 'vitest'
import { pageMeta } from './seo'
import { url } from './site'

describe('pageMeta', () => {
  it('setzt canonical, OG-URL und Basisfelder', () => {
    const m = pageMeta({ title: 'Titel', description: 'Beschr.', path: '/anime' })
    expect(m.title).toBe('Titel')
    expect(m.description).toBe('Beschr.')
    expect(m.alternates?.canonical).toBe(url('/anime'))
    expect((m.openGraph as any)?.url).toBe(url('/anime'))
    expect((m.openGraph as any)?.locale).toBe('de_DE')
  })
  it('nutzt summary_large_image + Bild, wenn ein Bild übergeben wird', () => {
    const m = pageMeta({ title: 'T', path: '/x', image: 'http://img/cover.jpg' })
    expect((m.twitter as any)?.card).toBe('summary_large_image')
    expect((m.openGraph as any)?.images).toEqual([{ url: 'http://img/cover.jpg' }])
  })
  it('fällt ohne Bild auf summary zurück (keine Bilder)', () => {
    const m = pageMeta({ title: 'T', path: '/x' })
    expect((m.twitter as any)?.card).toBe('summary')
    expect((m.openGraph as any)?.images).toBeUndefined()
  })
})
