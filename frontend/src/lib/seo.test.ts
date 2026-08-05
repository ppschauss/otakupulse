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
  // Ohne explizites Bild setzen wir bewusst KEINE images-Liste, damit Next die
  // Datei-Konvention opengraph-image.tsx greifen lässt (gehashter Pfad, ändert
  // sich pro Build). Es gibt also trotzdem immer ein Vorschaubild — deshalb
  // bleibt die Card `summary_large_image`.
  it('setzt ohne explizites Bild keine images (Datei-Konvention greift)', () => {
    const m = pageMeta({ title: 'T', path: '/x' })
    expect((m.twitter as any)?.card).toBe('summary_large_image')
    expect((m.openGraph as any)?.images).toBeUndefined()
  })

  // max-image-preview:large ist die Eintrittskarte für Google Discover — ohne die
  // Direktive gibt es dort keine großformatigen Bildkarten und faktisch keine
  // Ausspielung. Deshalb hier festgenagelt.
  it('setzt auf indexierbaren Seiten die Discover-Direktiven', () => {
    const r = pageMeta({ title: 'T', path: '/x' }).robots as any
    expect(r.index).toBe(true)
    expect(r.follow).toBe(true)
    expect(r['max-image-preview']).toBe('large')
    expect(r['max-snippet']).toBe(-1)
    expect(r['max-video-preview']).toBe(-1)
  })

  it('setzt bei noindex weder index noch Preview-Direktiven', () => {
    const r = pageMeta({ title: 'T', path: '/x', noindex: true }).robots as any
    expect(r.index).toBe(false)
    expect(r.follow).toBe(false)
    expect(r['max-image-preview']).toBeUndefined()
  })
})
