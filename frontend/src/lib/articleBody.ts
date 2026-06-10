/**
 * Wiederverwendbare Helfer, um KI-Fließtext mit internen Link-Bausteinen
 * ([[anime:slug|Label]], [[studio:…]], [[genre:…]], [[tag:…]]) in das
 * Lexical-Format der `articles.body`-RichText-Spalte zu wandeln.
 *
 * Wird von generate-anime-news.ts genutzt (generate-news.ts hat noch eine
 * eigene, identische Kopie — bewusst nicht angefasst, um Regressionen zu vermeiden).
 */

export type Valid = {
  anime: Set<string>
  genre: Set<string>
  studio: Set<string>
  tag: Set<string>
  /** Whitelist interner Seiten-Links: Marker-Slug → Pfad (z. B. 'kalender' → '/kalender'). */
  page?: Map<string, string>
}

const PATH: Record<string, string> = { anime: 'anime', genre: 'genre', studio: 'studio', tag: 'tag' }

const textNode = (text: string, format = 0) => ({ type: 'text', version: 1, text, format, style: '', mode: 'normal', detail: 0 })
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
function markers(text: string, valid: Valid, used: { anime: Set<string>; tag: Set<string> }, format = 0): any[] {
  const re = /\[\[(\w+):([a-z0-9-]+)\|([^\]]+)\]\]/g
  const nodes: any[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(textNode(text.slice(last, m.index), format))
    const [, type, slug, label] = m
    if (type === 'page' && valid.page?.has(slug)) {
      nodes.push(linkNode(valid.page.get(slug)!, label))
      last = re.lastIndex
      continue
    }
    const known = (valid as any)[type] as Set<string> | undefined
    if (PATH[type] && known?.has(slug)) {
      nodes.push(linkNode(`/${PATH[type]}/${slug}`, label))
      if (type === 'anime') used.anime.add(slug)
      if (type === 'tag') used.tag.add(slug)
    } else {
      nodes.push(textNode(label, format))
    }
    last = re.lastIndex
  }
  if (last < text.length) nodes.push(textNode(text.slice(last), format))
  return nodes.length ? nodes : [textNode(text, format)]
}

/** Wie markers(), aber löst zusätzlich **fett**-Spans in echte Bold-Textknoten auf. */
function inline(text: string, valid: Valid, used: { anime: Set<string>; tag: Set<string> }): any[] {
  const re = /\*\*([^*]+)\*\*/g
  const nodes: any[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(...markers(text.slice(last, m.index), valid, used))
    nodes.push(...markers(m[1], valid, used, 1)) // format 1 = bold
    last = re.lastIndex
  }
  if (last < text.length) nodes.push(...markers(text.slice(last), valid, used))
  return nodes.length ? nodes : [textNode(text)]
}

/** Wandelt [[typ:slug|Label]] → Label (für Felder ohne Links wie Titel/Teaser). */
export function stripMarkers(s: string): string {
  return s.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[[^\]]*\]\]/g, '').trim()
}

/** Lexical-Tabellenzelle (Inhalt als Absatz, damit Payloads Editor sie versteht). */
const cellNode = (children: any[], header: boolean) => ({
  type: 'tablecell',
  version: 1,
  headerState: header ? 1 : 0,
  colSpan: 1,
  rowSpan: 1,
  children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children }],
})

/** Markdown-Pipe-Tabelle (| a | b |) → Lexical-Table-Knoten. Erste Zeile wird nur
 *  zum Header, wenn eine Separator-Zeile (|---|---|) folgt — sonst reine Datentabelle. */
function tableNode(lines: string[], valid: Valid, used: { anime: Set<string>; tag: Set<string> }): any {
  const isSep = (s: string) => /^\|?[\s:|-]+\|?$/.test(s.trim()) && s.includes('-')
  // Zellen am Pipe trennen — aber NICHT innerhalb von [[typ:slug|Label]]-Markern.
  const splitCells = (s: string): string[] => {
    const out: string[] = []
    let cur = ''
    let depth = 0
    for (let i = 0; i < s.length; i++) {
      if (s.startsWith('[[', i)) depth++
      else if (s.startsWith(']]', i) && depth > 0) depth--
      if (s[i] === '|' && depth === 0) {
        out.push(cur)
        cur = ''
      } else {
        cur += s[i]
      }
    }
    out.push(cur)
    return out.map((c) => c.trim())
  }
  const rows: any[] = []
  let header = lines.length > 1 && isSep(lines[1])
  for (const line of lines) {
    const t = line.trim()
    if (isSep(t)) continue
    const cells = splitCells(t.replace(/^\|/, '').replace(/\|\s*$/, ''))
    rows.push({
      type: 'tablerow',
      version: 1,
      children: cells.map((c) => cellNode(inline(c, valid, used), header)),
    })
    header = false
  }
  return { type: 'table', version: 1, children: rows }
}

/** Baut aus Marker-Fließtext (## Überschrift, - Liste, | Tabelle |, Absätze) einen Lexical-Root. */
export function toLexical(body: string, valid: Valid): { root: any; usedAnime: Set<string>; usedTag: Set<string> } {
  const used = { anime: new Set<string>(), tag: new Set<string>() }
  const children: any[] = []
  // Überschrift-Zeilen immer als eigenen Block behandeln (auch ohne Leerzeile danach).
  const normalized = body.replace(/^(#{1,3} [^\n]+)\n(?!\n)/gm, '$1\n\n')
  for (const raw of normalized.split(/\n\n+/)) {
    const block = raw.trim()
    if (!block) continue
    const lines = block.split('\n')
    if (lines.length > 1 && lines.every((l) => l.trim().startsWith('|'))) {
      children.push(tableNode(lines, valid, used))
      continue
    }
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
