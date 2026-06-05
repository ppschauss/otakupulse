import { describe, it, expect } from 'vitest'
import { applyVars, applyVarsToLexical } from './vars'

describe('applyVars', () => {
  it('ersetzt bekannte Variablen', () => {
    expect(applyVars('Es gibt {{count}} Genres', { count: 42 })).toBe('Es gibt 42 Genres')
    expect(applyVars('{{name}} bei {{siteName}}', { name: 'Action' })).toBe('Action bei OtakuPulse')
  })
  it('lokalisiert Zahlen (de-DE)', () => {
    expect(applyVars('{{count}}', { count: 1234 })).toBe('1.234')
  })
  it('lässt unbekannte/leere Platzhalter unverändert', () => {
    expect(applyVars('{{unbekannt}}', {})).toBe('{{unbekannt}}')
    expect(applyVars('{{count}}', { count: null })).toBe('{{count}}')
  })
  it('toleriert Whitespace im Platzhalter und liefert "" bei leerem Input', () => {
    expect(applyVars('{{ name }}', { name: 'X' })).toBe('X')
    expect(applyVars('', { name: 'X' })).toBe('')
    expect(applyVars(null, {})).toBe('')
  })
  it('stellt year als Basis-Variable bereit', () => {
    expect(applyVars('© {{year}}', {})).toMatch(/^© \d{4}$/)
  })
})

describe('applyVarsToLexical', () => {
  it('ersetzt Variablen in Text-Knoten, Struktur bleibt erhalten', () => {
    const data = {
      root: {
        children: [
          { type: 'paragraph', children: [{ type: 'text', text: 'Hallo {{name}}', format: 0 }] },
        ],
      },
    }
    const out = applyVarsToLexical(data, { name: 'Welt' })
    expect(out.root.children[0].children[0].text).toBe('Hallo Welt')
    // Original unverändert (Immutabilität)
    expect(data.root.children[0].children[0].text).toBe('Hallo {{name}}')
  })
  it('gibt null/undefined unverändert zurück', () => {
    expect(applyVarsToLexical(null, {})).toBeNull()
    expect(applyVarsToLexical(undefined, {})).toBeUndefined()
  })
})
