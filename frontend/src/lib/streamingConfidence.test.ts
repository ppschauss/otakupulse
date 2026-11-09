import { describe, it, expect } from 'vitest'
import { isConfirmed, isUnconfirmed, offerNote, UNCONFIRMED_LABEL } from './streamingConfidence'

describe('isConfirmed', () => {
  it('behandelt fehlende confidence als belegt (Altbestand ohne Feld)', () => {
    expect(isConfirmed({})).toBe(true)
    expect(isConfirmed({ confidence: null })).toBe(true)
    expect(isConfirmed({ confidence: 'confirmed' })).toBe(true)
  })
  it('erkennt unbestätigt und verworfen als nicht belegt', () => {
    expect(isConfirmed({ confidence: 'unconfirmed' })).toBe(false)
    expect(isConfirmed({ confidence: 'rejected' })).toBe(false)
  })
})

describe('isUnconfirmed', () => {
  it('ist nur für unconfirmed wahr', () => {
    expect(isUnconfirmed({ confidence: 'unconfirmed' })).toBe(true)
    expect(isUnconfirmed({ confidence: 'rejected' })).toBe(false)
    expect(isUnconfirmed({})).toBe(false)
  })
})

describe('UNCONFIRMED_LABEL', () => {
  it('ist der Text, den Box und News verwenden', () => {
    expect(UNCONFIRMED_LABEL).toBe('Staffel nicht bestätigt')
  })
})

describe('offerNote', () => {
  it('ist leer für belegte Angebote', () => {
    expect(offerNote(null)).toBe('')
    expect(offerNote('confirmed')).toBe('')
  })
  it('kennzeichnet unbestätigte Angebote für den Artikeltext', () => {
    expect(offerNote('unconfirmed')).toBe(' (Staffel nicht bestätigt)')
  })
})
