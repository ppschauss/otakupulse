import { describe, it, expect } from 'vitest'
import { staticFilter, filterCondition, platformListCounts } from './platformLists'

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
  it('schliesst unbestaetigte Angebote aus dem Gratis-Filter aus', () => {
    const sql = filterCondition(staticFilter('kostenlos')!).sql
    expect(sql).toContain("('ads','free')")
    expect(sql).toContain("o.confidence IS DISTINCT FROM 'unconfirmed'")
  })
  it('schliesst unbestaetigte Angebote aus den Sprach-Filtern aus', () => {
    for (const key of ['deutscher-dub', 'deutscher-sub']) {
      expect(filterCondition(staticFilter(key)!).sql).toContain("o.confidence IS DISTINCT FROM 'unconfirmed'")
    }
  })
  it('laesst unbestaetigte Angebote in den uebrigen Filtern zu', () => {
    expect(filterCondition(staticFilter('filme')!).sql).not.toContain('unconfirmed')
    expect(filterCondition(staticFilter('neu')!).sql).not.toContain('unconfirmed')
  })
  it('schliesst verworfene Angebote ueberall aus', () => {
    expect(filterCondition(staticFilter('filme')!).sql).toContain("o.confidence IS DISTINCT FROM 'rejected'")
  })
  it('schliesst verworfene Angebote auch aus der Genre-Zaehlung aus, unbestaetigte zaehlen mit', async () => {
    const sqls: string[] = []
    const payload = { db: { pool: { query: async (sql: string) => (sqls.push(sql), { rows: [] }) } } }
    await platformListCounts(payload)
    const genre = sqls.find((q) => q.includes('JOIN genres g'))!
    expect(genre).toContain("o.confidence IS DISTINCT FROM 'rejected'")
    expect(genre).not.toContain('unconfirmed')
  })
})
