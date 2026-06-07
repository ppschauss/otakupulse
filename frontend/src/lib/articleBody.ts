/**
 * Wiederverwendbare Helfer, um KI-Fließtext mit internen Link-Bausteinen
 * ([[anime:slug|Label]], [[studio:…]], [[genre:…]], [[tag:…]]) in das
 * Lexical-Format der `articles.body`-RichText-Spalte zu wandeln.
 *
 * Wird von generate-anime-news.ts genutzt (generate-news.ts hat noch eine
 * eigene, identische Kopie — bewusst nicht angefasst, um Regressionen zu vermeiden).
 */

export type Valid = { anime: Set<string>; genre: Set<string>; studio: Set<string>; tag: Set<string> }

const PATH: Record<string, string> = { anime: 'anime', genre: 'genre', studio: 'studio', tag: 'tag' }

const textNode = (text: string) => ({ type: 'text', version: 1, text, format: 0, style: '', mode: 'normal', detail: 0 })
const linkNode = (url: string, label: string) => ({
  type: 'link',
  version: 3,
  fields: { linkType: 'custom', newTab: false, url },
  direction: 'ltr',
  format: '',
  indent: 0,
  children: [textNode(label)],
})

/** Ersetzt [[typ:slug|Label]] durch Link- bzw. Textknoten (nur bekannte Slugs werden verlinkt). */
function inline(text: string, valid: Valid, used: { anime: Set<string>; tag: Set<string> }): any[] {
  const re = /\[\[(\w+):([a-z0-9-]+)\|([^\]]+)\]\]/g
  const nodes: any[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(textNode(text.slice(last, m.index)))
    const [, type, slug, label] = m
    const known = (valid as any)[type] as Set<string> | undefined
    if (PATH[type] && known?.has(slug)) {
      nodes.push(linkNode(`/${PATH[type]}/${slug}`, label))
      if (type === 'anime') used.anime.add(slug)
      if (type === 'tag') used.tag.add(slug)
    } else {
      nodes.push(textNode(label))
    }
    last = re.lastIndex
  }
  if (last < text.length) nodes.push(textNode(text.slice(last)))
  return nodes.length ? nodes : [textNode(text)]
}

/** Wandelt [[typ:slug|Label]] → Label (für Felder ohne Links wie Titel/Teaser). */
export function stripMarkers(s: string): string {
  return s.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[[^\]]*\]\]/g, '').trim()
}

/** Baut aus Marker-Fließtext (## Überschrift, - Liste, Absätze) einen Lexical-Root. */
export function toLexical(body: string, valid: Valid): { root: any; usedAnime: Set<string>; usedTag: Set<string> } {
  const used = { anime: new Set<string>(), tag: new Set<string>() }
  const children: any[] = []
  for (const raw of body.split(/\n\n+/)) {
    const block = raw.trim()
    if (!block) continue
    const lines = block.split('\n')
    if (block.startsWith('## ') || block.startsWith('# ')) {
      children.push({
        type: 'heading',
        tag: 'h2',
        version: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        children: inline(block.replace(/^#+\s*/, ''), valid, used),
      })
    } else if (lines.every((l) => l.trim().startsWith('- '))) {
      children.push({
        type: 'list',
        listType: 'bullet',
        tag: 'ul',
        start: 1,
        version: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        children: lines.map((l, i) => ({
          type: 'listitem',
          version: 1,
          value: i + 1,
          direction: 'ltr',
          format: '',
          indent: 0,
          children: inline(l.trim().slice(2), valid, used),
        })),
      })
    } else {
      children.push({
        type: 'paragraph',
        version: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        children: inline(block.replace(/\n/g, ' '), valid, used),
      })
    }
  }
  return { root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children }, usedAnime: used.anime, usedTag: used.tag }
}

/** AniList-Beschreibungs-HTML (<br>, <i>, <b>, Quellen-Fußnoten) zu sauberem Text. */
export function stripHtml(s?: string | null): string {
  if (!s) return ''
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\(Source:.*?\)/gis, '')
    .replace(/\(Quelle:.*?\)/gis, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
