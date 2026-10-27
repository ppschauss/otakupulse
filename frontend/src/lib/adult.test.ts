import { describe, it, expect } from 'vitest'
import {
  adsAllowedForAnime,
  adsAllowedForArticle,
  adsAllowedForGenre,
  adsAllowedForTag,
  isBlockedAnime,
  isBlockedArticle,
} from './adult'

describe('Adult-Policy', () => {
  it('erkennt gesperrte Titel über Flag und Genre', () => {
    expect(isBlockedAnime({ isHentai: true })).toBe(true)
    expect(isBlockedAnime({ genres: [{ slug: 'hentai' }] })).toBe(true)
    expect(isBlockedAnime({ genres: [{ slug: 'ecchi' }] })).toBe(false)
    expect(isBlockedAnime(null)).toBe(false)
  })
  it('erkennt Artikel zu gesperrten Titeln', () => {
    expect(isBlockedArticle({ relatedAnime: [{ isHentai: true }] })).toBe(true)
    expect(isBlockedArticle({ title: 'Neue Hentai-OVA angekündigt' })).toBe(true)
    expect(isBlockedArticle({ title: 'Frieren Staffel 3', relatedAnime: [{ isHentai: false }] })).toBe(false)
  })
  it('liefert auf Adult-nahen Seiten keine Anzeigen aus', () => {
    expect(adsAllowedForAnime({ genres: [{ slug: 'action' }] })).toBe(true)
    expect(adsAllowedForAnime({ genres: [{ slug: 'ecchi' }] })).toBe(false)
    expect(adsAllowedForAnime({ isHentai: true })).toBe(false)
    expect(adsAllowedForGenre('action')).toBe(true)
    expect(adsAllowedForGenre('ecchi')).toBe(false)
    expect(adsAllowedForGenre('hentai')).toBe(false)
    expect(adsAllowedForTag('ninja')).toBe(true)
    expect(adsAllowedForTag('nudity')).toBe(false)
  })
  it('vererbt die Anzeigen-Entscheidung vom Artikel auf die behandelten Titel', () => {
    expect(adsAllowedForArticle({ title: 'Frieren Staffel 3', relatedAnime: [{ genres: [{ slug: 'action' }] }] })).toBe(true)
    expect(adsAllowedForArticle({ title: 'Strandfolge', relatedAnime: [{ genres: [{ slug: 'ecchi' }] }] })).toBe(false)
    expect(adsAllowedForArticle({ title: 'Neue Hentai-OVA angekündigt' })).toBe(false)
    expect(adsAllowedForArticle({ title: 'Branchenzahlen 2026' })).toBe(true)
  })
})
