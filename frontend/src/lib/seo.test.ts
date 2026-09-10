import { describe, it, expect } from 'vitest'
import { pageMeta, watchActionsLd, animeLd } from './seo'
import { streamingOffersOf } from './streaming'
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

describe('watchActionsLd', () => {
  it('erzeugt pro Angebot eine WatchAction mit Region DE und Offer-Kategorie', () => {
    const views = streamingOffersOf({
      streamingOffers: [
        { provider: 'joyn', url: 'https://www.joyn.de/serien/x', monetization: 'ads', audio: 'de', subs: '' },
        { provider: 'netflix', url: 'https://www.netflix.com/title/1', monetization: 'flatrate', audio: '', subs: '' },
      ],
    })
    const actions = watchActionsLd(views)
    expect(actions).toHaveLength(2)
    expect(actions[0]['@type']).toBe('WatchAction')
    expect(actions[0].target.urlTemplate).toBe('https://www.netflix.com/title/1')
    expect(actions[0].expectsAcceptanceOf.category).toBe('subscription')
    expect(actions[1].expectsAcceptanceOf.category).toBe('free')
    expect(actions[1].expectsAcceptanceOf.eligibleRegion.name).toBe('DE')
  })
  it('animeLd hängt potentialAction nur mit Angeboten an', () => {
    expect(animeLd({ slug: 'x', titleRomaji: 'X' }).potentialAction).toBeUndefined()
    const withOffers = animeLd({ slug: 'x', titleRomaji: 'X', streamingOffers: [{ provider: 'netflix', url: 'https://n', monetization: 'flatrate' }] })
    expect(withOffers.potentialAction).toHaveLength(1)
  })
})
