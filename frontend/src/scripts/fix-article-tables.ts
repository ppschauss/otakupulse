/**
 * Einmaliger Backfill für bestehende Artikel-Bodies (Lexical JSON):
 *  1) Literal-Markdown-Fett in Textknoten („**Titel:**") → echte Bold-Textknoten.
 *  2) Steckbrief-Listen (jedes Item beginnt mit fettem „Key:") → schöne Tabelle
 *     (gleiches Format wie die neuen Generator-Artikel).
 *
 * Idempotent: bereits konvertierte Artikel werden nicht erneut angefasst.
 * Aufruf: npx tsx src/scripts/fix-article-tables.ts [--dry]
 */
import { getPayload } from 'payload'
import config from '../payload.config'

const dry = process.argv.includes('--dry')

const textNode = (text: string, format = 0) => ({ type: 'text', version: 1, text, format, style: '', mode: 'normal', detail: 0 })
const cellNode = (children: any[], header: boolean) => ({
  type: 'tablecell',
  version: 1,
  headerState: header ? 1 : 0,
  colSpan: 1,
  rowSpan: 1,
  children: [{ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children }],
})

/** „**fett**"-Spans in einem Textknoten → mehrere Textknoten mit Bold-Format. */
function splitBold(node: any): any[] {
  if (node?.type !== 'text' || typeof node.text !== 'string' || !node.text.includes('**')) return [node]
  const re = /\*\*([^*]+)\*\*/g
  const out: any[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(node.text))) {
    if (m.index > last) out.push(textNode(node.text.slice(last, m.index), node.format || 0))
    out.push(textNode(m[1], (node.format || 0) | 1))
    last = re.lastIndex
  }
  if (last < node.text.length) out.push(textNode(node.text.slice(last), node.format || 0))
  return out.length ? out : [node]
}

/** Steckbrief-Liste → Tabelle, wenn JEDES Item mit „**Key:**" beginnt. */
function listToTable(list: any): any | null {
  const items = list?.children || []
  if (!items.length) return null
  const rows: any[] = []
  for (const item of items) {
    const kids = item?.children || []
    const c0 = kids[0]
    const m = c0?.type === 'text' && typeof c0.text === 'string' ? c0.text.match(/^\*\*([^*]+?):?\*\*\s*(.*)$/s) : null
    if (!m) return null
    const valueKids = [...(m[2] ? [textNode(m[2])] : []), ...kids.slice(1)].flatMap(splitBold)
    rows.push({
      type: 'tablerow',
      version: 1,
      children: [cellNode([textNode(m[1], 1)], false), cellNode(valueKids.length ? valueKids : [textNode('—')], false)],
    })
  }
  return { type: 'table', version: 1, children: rows }
}

/**
 * Überschrift, die fälschlich einen kompletten Listen-Block enthält („## Steckbrief\n- …"
 * wurde als EIN Block geparst) → echte Überschrift + Tabelle (bzw. Liste) auftrennen.
 */
function explodeHeading(h: any): any[] | null {
  const kids: any[] = h?.children || []
  if (!kids.some((c) => c?.type === 'text' && typeof c.text === 'string' && c.text.includes('\n'))) return null
  // Inline-Knoten an Zeilenumbrüchen in Segmente (Zeilen) zerlegen.
  const segs: any[][] = [[]]
  for (const c of kids) {
    if (c?.type === 'text' && typeof c.text === 'string' && c.text.includes('\n')) {
      c.text.split('\n').forEach((p: string, i: number) => {
        if (i > 0) segs.push([])
        if (p) segs[segs.length - 1].push(textNode(p, c.format || 0))
      })
    } else {
      segs[segs.length - 1].push(c)
    }
  }
  const headSeg = segs.shift() || []
  // Führendes "- " der Items entfernen, leere Segmente verwerfen.
  const items = segs
    .map((seg) => {
      if (seg[0]?.type === 'text') {
        const t = String(seg[0].text).replace(/^\s*-\s+/, '')
        if (t) seg = [{ ...seg[0], text: t }, ...seg.slice(1)]
        else seg = seg.slice(1)
      }
      return seg.flatMap(splitBold)
    })
    .filter((seg) => seg.length)
  const heading = { ...h, children: headSeg.flatMap(splitBold) }
  if (!items.length) return [heading]

  // Key-Value-Tabelle, wenn jedes Item mit fettem „Key:" beginnt.
  const isKey = (n: any) => n?.type === 'text' && ((n.format || 0) & 1) === 1 && /:$/.test(String(n.text).trim())
  if (items.every((seg) => isKey(seg[0]))) {
    const rows = items.map((seg) => {
      const key = String(seg[0].text).trim().replace(/:$/, '')
      let value = seg.slice(1)
      if (value[0]?.type === 'text' && !String(value[0].text).trim()) value = value.slice(1)
      return {
        type: 'tablerow',
        version: 1,
        children: [cellNode([textNode(key, 1)], false), cellNode(value.length ? value : [textNode('—')], false)],
      }
    })
    return [heading, { type: 'table', version: 1, children: rows }]
  }
  // Sonst: als echte Liste rekonstruieren.
  return [
    heading,
    {
      type: 'list',
      listType: 'bullet',
      tag: 'ul',
      start: 1,
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: items.map((seg, i) => ({
        type: 'listitem',
        version: 1,
        value: i + 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        children: seg,
      })),
    },
  ]
}

/** Rekursiv: kaputte Überschrift-Blöcke auftrennen, Listen ggf. zu Tabellen, **fett** auflösen. */
function transform(node: any): { node: any; changed: boolean } {
  let changed = false
  if (node?.type === 'list') {
    const table = listToTable(node)
    if (table) return { node: table, changed: true }
  }
  if (Array.isArray(node?.children)) {
    const next: any[] = []
    for (const child of node.children) {
      if (child?.type === 'heading') {
        const exploded = explodeHeading(child)
        if (exploded) {
          next.push(...exploded)
          changed = true
          continue
        }
      }
      if (child?.type === 'text' && typeof child.text === 'string' && /\*\*[^*]+\*\*/.test(child.text)) {
        next.push(...splitBold(child))
        changed = true
        continue
      }
      const r = transform(child)
      if (r.changed) changed = true
      next.push(r.node)
    }
    if (changed) return { node: { ...node, children: next }, changed }
  }
  return { node, changed }
}

async function main() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'articles', limit: 2000, depth: 0, sort: 'id' })
  console.log(`→ ${docs.length} Artikel prüfen`)

  let fixed = 0
  for (const a of docs as any[]) {
    const root = a?.body?.root
    if (!root) continue
    const { node, changed } = transform(root)
    if (!changed) continue
    fixed++
    if (dry) {
      console.log(`[~] würde fixen: ${a.slug}`)
      continue
    }
    await payload.update({
      collection: 'articles',
      id: a.id,
      data: { body: { root: node } } as any,
      ...(a._status === 'published' ? {} : { draft: true }),
    })
    console.log(`[✓] ${a.slug}`)
  }
  console.log(`\n✓ Fertig. Geändert: ${fixed} / ${docs.length}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
