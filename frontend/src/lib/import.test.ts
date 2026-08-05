import { describe, it, expect } from 'vitest'
import { __test } from './import'

const { sameValue, nextContentUpdatedAt, ANIME_CONTENT_FIELDS } = __test

const NOW = '2026-08-05T12:00:00.000Z'
const OLD = '2026-07-01T08:00:00.000Z'

describe('sameValue', () => {
  it('behandelt null/undefined/leer als gleich', () => {
    expect(sameValue(null, undefined)).toBe(true)
    expect(sameValue(undefined, '')).toBe(true)
  })
  it('vergleicht Skalare typtolerant (DB liefert teils Strings)', () => {
    expect(sameValue(12, '12')).toBe(true)
    expect(sameValue(12, 13)).toBe(false)
  })
  it('ignoriert die Reihenfolge in Relations-Arrays', () => {
    // AniList liefert Genres nicht stabil sortiert — sonst wäre jede Nacht eine
    // „Änderung" gemeldet, obwohl sich nichts geändert hat.
    expect(sameValue([3, 1, 2], [1, 2, 3])).toBe(true)
    expect(sameValue([1, 2], [1, 2, 3])).toBe(false)
  })
  it('vergleicht aufgelöste Relationen gegen reine IDs', () => {
    expect(sameValue([{ id: 5 }, { id: 7 }], [7, 5])).toBe(true)
  })
})

describe('nextContentUpdatedAt', () => {
  it('rührt den Zeitstempel bei reinen Popularitäts-Ticks nicht an', () => {
    // Genau der Alltagsfall: der Sync schreibt jeden laufenden Anime neu, aber
    // AniList hat nur den Score/Popularity-Zähler bewegt. Das ist KEINE
    // inhaltliche Änderung und darf nicht als lastmod an Google gehen.
    const existing = {
      titleRomaji: 'Frieren', status: 'RELEASING', episodes: 28,
      averageScore: 91, popularity: 500_000,
      contentUpdatedAt: OLD,
    }
    const next = { ...existing, averageScore: 92, popularity: 501_234 }
    expect(nextContentUpdatedAt(existing, next, ANIME_CONTENT_FIELDS, NOW)).toBe(OLD)
  })

  it('zieht den Zeitstempel bei echter Änderung nach', () => {
    const existing = { titleRomaji: 'Frieren', status: 'RELEASING', episodes: 28, contentUpdatedAt: OLD }
    const next = { ...existing, episodes: 29 }
    expect(nextContentUpdatedAt(existing, next, ANIME_CONTENT_FIELDS, NOW)).toBe(NOW)
  })

  it('erkennt eine geänderte Beschreibung', () => {
    const existing = { descriptionSource: 'alt', contentUpdatedAt: OLD }
    const next = { descriptionSource: 'neu' }
    expect(nextContentUpdatedAt(existing, next, ANIME_CONTENT_FIELDS, NOW)).toBe(NOW)
  })

  it('fällt ohne bisherigen Wert auf updatedAt zurück statt fälschlich zu erneuern', () => {
    // Dokumente aus der Zeit vor dem Feld: bestehendes updatedAt übernehmen,
    // damit nicht der gesamte Katalog einmalig als „heute geändert" gilt.
    const existing = { titleRomaji: 'Naruto', updatedAt: OLD }
    const next = { titleRomaji: 'Naruto' }
    expect(nextContentUpdatedAt(existing, next, ANIME_CONTENT_FIELDS, NOW)).toBe(OLD)
  })

  it('setzt now, wenn weder contentUpdatedAt noch updatedAt vorliegen', () => {
    expect(nextContentUpdatedAt({}, {}, ANIME_CONTENT_FIELDS, NOW)).toBe(NOW)
  })

  it('wertet Score/Popularity/Favorites bewusst NICHT als Inhalt', () => {
    for (const f of ['averageScore', 'popularity', 'favorites', 'lastSyncedAt']) {
      expect(ANIME_CONTENT_FIELDS as readonly string[]).not.toContain(f)
    }
  })
})
