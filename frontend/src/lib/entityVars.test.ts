import { describe, it, expect } from 'vitest'
import { animeVars, genreVars, tagVars, personVars } from './entityVars'
import { applyVars } from './vars'

describe('animeVars', () => {
  const anime = {
    titleGerman: 'Mein Anime',
    titleRomaji: 'Boku no Anime',
    slug: 'mein-anime',
    season: 'FALL',
    seasonYear: 2023,
    format: 'TV',
    episodes: 12,
    averageScore: 84,
    studios: [{ name: 'Studio A' }, { name: 'Studio B' }],
    genres: [{ name: 'Action' }, { name: 'Drama' }],
    streamingProviders: ['crunchyroll'],
    externalLinks: [],
  }
  it('liefert Titel, Studio(s), Genres, Plattformen, Season', () => {
    const v = animeVars(anime)
    expect(v.title).toBe('Mein Anime')
    expect(v.studio).toBe('Studio A')
    expect(v.studios).toBe('Studio A, Studio B')
    expect(v.genres).toBe('Action, Drama')
    expect(v.platforms).toBe('Crunchyroll')
    expect(v.season).toBe('Herbst 2023')
  })
  it('seasonYear bleibt ohne Tausendertrennzeichen', () => {
    expect(applyVars('{{seasonYear}}', animeVars(anime))).toBe('2023')
    expect(applyVars('{{episodes}} Folgen', animeVars(anime))).toBe('12 Folgen')
  })
})

describe('genreVars', () => {
  it('löst parentSlug/parentName aus aufgelöstem parentGenre', () => {
    const v = genreVars({ name: 'Isekai', slug: 'isekai', parentGenre: { name: 'Fantasy', slug: 'fantasy' } })
    expect(v.parentSlug).toBe('fantasy')
    expect(v.parentName).toBe('Fantasy')
    expect(v.name).toBe('Isekai')
  })
  it('lässt parentSlug leer, wenn parentGenre nur eine ID ist', () => {
    expect(genreVars({ name: 'X', slug: 'x', parentGenre: 5 }).parentSlug).toBe('')
  })
})

describe('tagVars / personVars', () => {
  it('tagVars mappt category-Label', () => {
    expect(tagVars({ name: 'Mecha', slug: 'mecha', category: 'theme' }).category).toBe('Thema')
  })
  it('personVars verbindet Rollen-Labels', () => {
    expect(personVars({ nameRomaji: 'Ada', slug: 'ada', roles: ['voice_actor', 'director'] }).roles).toBe(
      'Synchronsprecher, Regie',
    )
  })
})
