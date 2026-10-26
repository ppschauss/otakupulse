import { describe, it, expect } from 'vitest'
import { joinNames, formatDateDe, animeIndexable } from './anime'
import {
  displayTitle,
  displayName,
  genderLabel,
  languageLabel,
  formatLabel,
  statusLabel,
  seasonLabel,
  personRoleLabel,
  relationLabel,
  plainText,
} from './anime'

describe('displayTitle', () => {
  it('bevorzugt den deutschen Titel', () => {
    expect(displayTitle({ titleGerman: 'DE', titleEnglish: 'EN', titleRomaji: 'RO' })).toBe('DE')
  })
  it('fällt auf Englisch, dann Romaji zurück', () => {
    expect(displayTitle({ titleEnglish: 'EN', titleRomaji: 'RO' })).toBe('EN')
    expect(displayTitle({ titleRomaji: 'RO' })).toBe('RO')
  })
  it('liefert "Unbekannt" ohne Titel und bei null/undefined', () => {
    expect(displayTitle({})).toBe('Unbekannt')
    expect(displayTitle(null)).toBe('Unbekannt')
    expect(displayTitle(undefined)).toBe('Unbekannt')
  })
})

describe('displayName', () => {
  it('bevorzugt Romaji, dann EN, dann Native', () => {
    expect(displayName({ nameRomaji: 'R', nameEnglish: 'E', nameNative: 'N' })).toBe('R')
    expect(displayName({ nameEnglish: 'E', nameNative: 'N' })).toBe('E')
    expect(displayName({ nameNative: 'N' })).toBe('N')
  })
  it('liefert "Unbekannt" ohne Namen', () => {
    expect(displayName({})).toBe('Unbekannt')
    expect(displayName(null)).toBe('Unbekannt')
  })
})

describe('Label-Helfer', () => {
  it('genderLabel mappt bekannte Werte und gibt Unbekanntes durch', () => {
    expect(genderLabel('female')).toBe('weiblich')
    expect(genderLabel('male')).toBe('männlich')
    expect(genderLabel('xyz')).toBe('xyz')
    expect(genderLabel(null)).toBe('')
    expect(genderLabel(undefined)).toBe('')
  })
  it('languageLabel mappt Dub/Sub-Codes', () => {
    expect(languageLabel('de-dub')).toBe('Deutscher Dub')
    expect(languageLabel('ja')).toBe('Japanisch (OmU)')
    expect(languageLabel('')).toBe('')
  })
  it('formatLabel / statusLabel / seasonLabel', () => {
    expect(formatLabel('MOVIE')).toBe('Film')
    expect(statusLabel('RELEASING')).toBe('Läuft aktuell')
    expect(seasonLabel('FALL')).toBe('Herbst')
  })
  it('personRoleLabel / relationLabel', () => {
    expect(personRoleLabel('voice_actor')).toBe('Synchronsprecher')
    expect(relationLabel('SEQUEL')).toBe('Fortsetzung')
  })
})

describe('plainText', () => {
  it('strippt HTML-Tags und normalisiert Whitespace', () => {
    expect(plainText('<p>Hallo <b>Welt</b></p>')).toBe('Hallo Welt')
    expect(plainText('Zeile1\n\n  Zeile2')).toBe('Zeile1 Zeile2')
  })
  it('liefert leeren String bei null/undefined', () => {
    expect(plainText(null)).toBe('')
    expect(plainText(undefined)).toBe('')
    expect(plainText('')).toBe('')
  })
})

describe('joinNames', () => {
  it('zählt natürlich auf', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(['A'])).toBe('A')
    expect(joinNames(['A', 'B'])).toBe('A und B')
    expect(joinNames(['A', null, 'B', 'C'])).toBe('A, B und C')
  })
})
describe('formatDateDe', () => {
  it('formatiert ISO als dd.mm.yyyy, leer bei ungültig', () => {
    expect(formatDateDe('2026-09-10T00:00:00.000Z')).toBe('10.09.2026')
    expect(formatDateDe(null)).toBe('')
    expect(formatDateDe('kaputt')).toBe('')
  })
})

describe('animeIndexable', () => {
  const de = 'x'.repeat(120)
  it('indexiert mit Streaming immer (auch ohne Text)', () => {
    expect(animeIndexable({ streamingOffers: [{ provider: 'netflix', url: 'https://n' }] })).toBe(true)
    expect(animeIndexable({ streamingProviders: ['netflix'] })).toBe(true)
  })
  it('indexiert ohne Streaming nur mit deutschem Text ≥ 100 Zeichen und genug Nachfrage', () => {
    expect(animeIndexable({ descriptionDe: de, popularity: 50000 })).toBe(true)
    expect(animeIndexable({ descriptionSource: de, popularity: 50000 })).toBe(false) // englischer Quelltext zählt nicht
    expect(animeIndexable({ descriptionDe: 'kurz', popularity: 50000 })).toBe(false)
  })
  it('Musikvideos ohne Streaming nie; redaktionelles noindex gewinnt', () => {
    expect(animeIndexable({ format: 'MUSIC', descriptionDe: de, popularity: 50000 })).toBe(false)
    expect(animeIndexable({ noindex: true, streamingProviders: ['netflix'] })).toBe(false)
  })
})

describe('animeIndexable: Popularitätsschwelle', () => {
  const de = 'x'.repeat(120)
  it('ohne Stream zählt die Nachfrage', () => {
    expect(animeIndexable({ descriptionDe: de, popularity: 50000 })).toBe(true)
    expect(animeIndexable({ descriptionDe: de, popularity: 100 })).toBe(false)
    expect(animeIndexable({ descriptionDe: de })).toBe(false)
  })
  it('mit Stream immer, Adult-Bestand nie', () => {
    expect(animeIndexable({ popularity: 0, streamingProviders: ['netflix'] })).toBe(true)
    expect(animeIndexable({ isHentai: true, streamingProviders: ['netflix'] })).toBe(false)
  })
})
