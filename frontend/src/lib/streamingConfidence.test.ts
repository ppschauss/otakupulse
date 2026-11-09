import { describe, it, expect } from 'vitest'
import { isConfirmed, isUnconfirmed, offerNote, UNCONFIRMED_LABEL, rejectedProviderSlugs, unconfirmedOnlyProviderSlugs, offerLanguageLabel, NO_LANGUAGE } from './streamingConfidence'

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

describe('unconfirmedOnlyProviderSlugs', () => {
  const o = (provider: string, confidence: string | null) => ({ provider, url: 'https://x', confidence })
  it('nennt Slugs, deren Angebote ausschließlich unbestätigt sind', () => {
    const s = unconfirmedOnlyProviderSlugs({ streamingOffers: [o('netflix', 'unconfirmed')] })
    expect([...s]).toEqual(['netflix'])
  })
  it('nennt einen Slug mit mindestens einem belegten Angebot nicht', () => {
    const s = unconfirmedOnlyProviderSlugs({
      streamingOffers: [o('netflix', 'unconfirmed'), o('netflix', 'confirmed')],
    })
    expect(s.size).toBe(0)
  })
  it('zählt Altbestand ohne confidence als belegt', () => {
    const s = unconfirmedOnlyProviderSlugs({ streamingOffers: [o('netflix', 'unconfirmed'), o('netflix', null)] })
    expect(s.size).toBe(0)
  })
  it('trennt die Slugs: A unbestätigt, B belegt', () => {
    const s = unconfirmedOnlyProviderSlugs({ streamingOffers: [o('netflix', 'unconfirmed'), o('crunchyroll', 'confirmed')] })
    expect([...s]).toEqual(['netflix'])
  })
  it('ist leer, wenn die Offers nicht geladen sind (nichts bekannt — tolerant wie rejectedProviderSlugs)', () => {
    expect(unconfirmedOnlyProviderSlugs({ streamingProviders: ['netflix'] }).size).toBe(0)
    expect(unconfirmedOnlyProviderSlugs({}).size).toBe(0)
    expect(unconfirmedOnlyProviderSlugs(null).size).toBe(0)
    expect(rejectedProviderSlugs(null).size).toBe(0)
  })
  it('ein verworfenes Angebot macht den Slug nicht „nur unbestätigt" (dafür gibt es das Veto)', () => {
    const s = unconfirmedOnlyProviderSlugs({ streamingOffers: [o('netflix', 'rejected')] })
    expect(s.size).toBe(0)
  })
})

describe('offerLanguageLabel', () => {
  it('nennt deutschen Dub vor deutschem Sub, sonst OmU (belegte Zeile, unverändert)', () => {
    expect(offerLanguageLabel('de,ja', 'de', 'confirmed')).toBe('Deutscher Dub')
    expect(offerLanguageLabel('ja', 'de,en', 'confirmed')).toBe('Deutscher Sub')
    expect(offerLanguageLabel('ja', 'en', 'confirmed')).toBe('Japanisch (OmU)')
  })
  it('belegte Zeile ohne Sprachdaten behält den Rückfall OmU (älter als dieser Branch)', () => {
    expect(offerLanguageLabel('', '', 'confirmed')).toBe('Japanisch (OmU)')
    expect(offerLanguageLabel(null, null, null)).toBe('Japanisch (OmU)')
  })
  it('unbestätigte Zeile OHNE Sprachdaten behauptet keine Sprachfassung', () => {
    // Geerbte Angebote tragen leeres audio/subs (Entscheidung 7). „Japanisch (OmU)"
    // stünde in der Tabelle direkt neben „Staffel nicht bestätigt".
    expect(offerLanguageLabel('', '', 'unconfirmed')).toBe(NO_LANGUAGE)
    expect(offerLanguageLabel(null, null, 'unconfirmed')).toBe(NO_LANGUAGE)
  })
  it('unbestätigte Zeile MIT Sprachdaten zeigt sie weiter', () => {
    expect(offerLanguageLabel('de', '', 'unconfirmed')).toBe('Deutscher Dub')
    expect(offerLanguageLabel('', 'de', 'unconfirmed')).toBe('Deutscher Sub')
    // Daten sind da, nur die Staffelzuordnung ist unbestätigt.
    expect(offerLanguageLabel('ja', '', 'unconfirmed')).toBe('Japanisch (OmU)')
  })
})
