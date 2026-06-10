// Wandelt Payloads Lexical-RichText (articles.body) in einen HTML-String —
// für den Vollinhalts-RSS-Feed (content:encoded, z. B. für Flipboard). Deckt
// dieselben Knoten ab wie components/RichText.tsx, aber ohne Tailwind-Klassen
// (semantisches HTML für Feed-Reader). Relative Links werden absolut gemacht.
import { SITE_URL } from './site'

const esc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (s: string) => esc(s).replace(/"/g, '&quot;')

const FMT = { bold: 1, italic: 2, strikethrough: 4, underline: 8, code: 16 } as const

function renderText(node: any): string {
  let t = esc(node.text || '')
  const f = node.format || 0
  if (f & FMT.code) t = `<code>${t}</code>`
  if (f & FMT.bold) t = `<strong>${t}</strong>`
  if (f & FMT.italic) t = `<em>${t}</em>`
  if (f & FMT.underline) t = `<u>${t}</u>`
  if (f & FMT.strikethrough) t = `<s>${t}</s>`
  return t
}

function children(nodes: any[]): string {
  return (nodes || []).map(renderNode).join('')
}

function renderNode(node: any): string {
  if (!node) return ''
  switch (node.type) {
    case 'text':
      return renderText(node)
    case 'linebreak':
      return '<br/>'
    case 'paragraph':
      return `<p>${children(node.children)}</p>`
    case 'heading': {
      const tag = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(node.tag) ? node.tag : 'h2'
      return `<${tag}>${children(node.children)}</${tag}>`
    }
    case 'quote':
      return `<blockquote>${children(node.children)}</blockquote>`
    case 'list': {
      const tag = node.listType === 'number' ? 'ol' : 'ul'
      return `<${tag}>${children(node.children)}</${tag}>`
    }
    case 'listitem':
      return `<li>${children(node.children)}</li>`
    case 'table':
      return `<table><tbody>${children(node.children)}</tbody></table>`
    case 'tablerow':
      return `<tr>${children(node.children)}</tr>`
    case 'tablecell': {
      const inner = (node.children || [])
        .map((c: any) => (c?.type === 'paragraph' ? children(c.children) : renderNode(c)))
        .join('')
      return node.headerState ? `<th>${inner}</th>` : `<td>${inner}</td>`
    }
    case 'link': {
      const raw = String(node.fields?.url || node.url || '#')
      // Nur sichere Schemata (kein javascript:/data:), relative URLs absolut machen.
      const safe = /^(https?:|mailto:|\/|#)/i.test(raw) ? raw : '#'
      const abs = safe.startsWith('/') ? `${SITE_URL}${safe}` : safe
      return `<a href="${escAttr(abs)}">${children(node.children)}</a>`
    }
    default:
      return children(node.children)
  }
}

export function lexicalToHtml(data: any): string {
  const root = data?.root
  if (!root?.children?.length) return ''
  return children(root.children)
}
