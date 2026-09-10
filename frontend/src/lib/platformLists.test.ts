import { describe, it, expect } from 'vitest'
import { staticFilter, filterCondition } from './platformLists'

describe('platformLists', () => {
  it('kennt die statischen Filter mit deutschem Title', () => {
    expect(staticFilter('deutscher-dub')?.title('Netflix')).toBe('Anime mit deutschem Dub auf Netflix')
    expect(staticFilter('kostenlos')?.title('Joyn')).toBe('Kostenlose Anime auf Joyn')
    expect(staticFilter('neu')?.title('Crunchyroll')).toBe('Neu auf Crunchyroll: Anime der letzten 30 Tage')
    expect(staticFilter('filme')?.title('Netflix')).toBe('Anime-Filme auf Netflix')
    expect(staticFilter('gibtsnicht')).toBeUndefined()
  })
  it('baut SQL-Bedingungen mit Platzhaltern ab $2', () => {
    expect(filterCondition(staticFilter('deutscher-dub')!).sql).toContain('%,de,%')
    expect(filterCondition(staticFilter('kostenlos')!).sql).toContain("('ads','free')")
    const g = filterCondition({ key: 'isekai', kind: 'genre', label: 'Isekai', genreSlug: 'isekai', genreName: 'Isekai', title: () => '', intro: () => '' })
    expect(g.sql).toContain('$2')
    expect(g.params).toEqual(['isekai'])
  })
})
