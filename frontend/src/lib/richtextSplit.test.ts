import { describe, it, expect } from 'vitest'
import { splitAfterParagraphs } from '@/components/RichText'

const doc = (...types: string[]) => ({ root: { children: types.map((type) => ({ type })) } })

describe('splitAfterParagraphs', () => {
  it('schneidet nach dem zweiten Absatz', () => {
    expect(splitAfterParagraphs(doc('paragraph', 'paragraph', 'paragraph', 'paragraph'))).toBe(2)
  })
  it('überspringt Nicht-Absätze beim Zählen, schneidet aber dahinter', () => {
    expect(splitAfterParagraphs(doc('heading', 'paragraph', 'heading', 'paragraph', 'paragraph', 'paragraph'))).toBe(4)
  })
  it('liefert null, wenn danach zu wenig Text folgt', () => {
    expect(splitAfterParagraphs(doc('paragraph', 'paragraph', 'paragraph'))).toBeNull()
    expect(splitAfterParagraphs(doc('paragraph'))).toBeNull()
  })
  it('verträgt leere Eingaben', () => {
    expect(splitAfterParagraphs(null)).toBeNull()
    expect(splitAfterParagraphs({ root: { children: [] } })).toBeNull()
  })
})
