import { describe, expect, it } from 'vitest'
import { toLexical, type Valid } from './articleBody'

const valid: Valid = {
  anime: new Set(['maomao-no-hitorigoto-3rd-season']),
  genre: new Set(['comedy']),
  studio: new Set(['toho']),
  tag: new Set(),
}

const links = (node: any): string[] =>
  node?.type === 'link' ? [node.fields.url] : (node?.children ?? []).flatMap(links)

describe('toLexical – Steckbrief-Tabelle', () => {
  it('verlinkt Studio- und Genre-Marker in Tabellenzellen (Pipe im Marker trennt keine Zelle)', () => {
    const body = [
      '## Steckbrief',
      '',
      '| **Titel** | [[anime:maomao-no-hitorigoto-3rd-season|Maomao no Hitorigoto 3rd Season]] |',
      '| **Studio** | [[studio:toho|Toho]] |',
      '| **Genres** | [[genre:comedy|Comedy]], [[genre:unbekannt|Unbekannt]] |',
    ].join('\n')
    const { root } = toLexical(body, valid)
    expect(links(root)).toEqual(['/anime/maomao-no-hitorigoto-3rd-season', '/studio/toho', '/genre/comedy'])
    expect(JSON.stringify(root)).not.toContain('[[')
  })

  it('erkennt Marker mit escaptem Trenner (∕) NICHT – genau der Altbug', () => {
    const { root } = toLexical('| **Studio** | [[studio:toho∕Toho]] |', valid)
    expect(links(root)).toEqual([])
    expect(JSON.stringify(root)).toContain('[[studio:toho∕Toho]]')
  })
})
