import React from 'react'

/**
 * Minimaler, abhängigkeitsfreier Renderer für Payloads Lexical-RichText.
 * Deckt die gängigen Knoten ab (Absatz, Überschrift, Liste, Zitat, Link,
 * Zeilenumbruch, Text-Formatierung). Unbekannte Knoten rendern ihre Kinder.
 */

const FORMAT = { bold: 1, italic: 2, strikethrough: 4, underline: 8, code: 16 } as const

function renderText(node: any, key: React.Key) {
  let el: React.ReactNode = node.text
  const f = node.format || 0
  if (f & FORMAT.code) el = <code className="rounded bg-white/10 px-1 py-0.5 text-sm">{el}</code>
  if (f & FORMAT.bold) el = <strong>{el}</strong>
  if (f & FORMAT.italic) el = <em>{el}</em>
  if (f & FORMAT.underline) el = <u>{el}</u>
  if (f & FORMAT.strikethrough) el = <s>{el}</s>
  return <React.Fragment key={key}>{el}</React.Fragment>
}

function renderChildren(children: any[]): React.ReactNode {
  return (children || []).map((c, i) => renderNode(c, i))
}

function renderNode(node: any, key: React.Key): React.ReactNode {
  if (!node) return null
  switch (node.type) {
    case 'text':
      return renderText(node, key)
    case 'linebreak':
      return <br key={key} />
    case 'paragraph':
      return (
        <p key={key} className="mb-4 leading-relaxed text-zinc-300">
          {renderChildren(node.children)}
        </p>
      )
    case 'heading': {
      const Tag = (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(node.tag) ? node.tag : 'h2') as keyof React.JSX.IntrinsicElements
      return (
        <Tag key={key} className="mb-3 mt-6 text-xl font-bold text-white">
          {renderChildren(node.children)}
        </Tag>
      )
    }
    case 'quote':
      return (
        <blockquote key={key} className="my-4 border-l-2 border-accent/60 pl-4 italic text-zinc-400">
          {renderChildren(node.children)}
        </blockquote>
      )
    case 'list': {
      const Tag = node.listType === 'number' ? 'ol' : 'ul'
      return (
        <Tag key={key} className={`mb-4 ml-6 space-y-1 text-zinc-300 ${Tag === 'ol' ? 'list-decimal' : 'list-disc'}`}>
          {renderChildren(node.children)}
        </Tag>
      )
    }
    case 'listitem':
      return <li key={key}>{renderChildren(node.children)}</li>
    case 'table':
      return (
        <div key={key} className="my-5 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full border-collapse text-sm">
            <tbody>{renderChildren(node.children)}</tbody>
          </table>
        </div>
      )
    case 'tablerow':
      return (
        <tr key={key} className="border-b border-white/5 last:border-0 even:bg-white/[0.02] hover:bg-white/[0.04]">
          {renderChildren(node.children)}
        </tr>
      )
    case 'tablecell': {
      // Absätze in Zellen ohne Margin inline rendern.
      const inner = (node.children || []).map((c: any, i: number) =>
        c?.type === 'paragraph' ? <React.Fragment key={i}>{renderChildren(c.children)}</React.Fragment> : renderNode(c, i),
      )
      return node.headerState ? (
        <th key={key} className="bg-white/[0.06] px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-300">
          {inner}
        </th>
      ) : (
        <td key={key} className="px-3 py-2 align-top text-zinc-300">
          {inner}
        </td>
      )
    }
    case 'link': {
      const raw = node.fields?.url || node.url || '#'
      // Nur sichere Schemata (verhindert javascript:-/data:-XSS in Link-Knoten).
      const url = /^(https?:|mailto:|\/|#)/i.test(String(raw)) ? raw : '#'
      return (
        <a key={key} href={url} className="text-accent hover:underline" target="_blank" rel="noopener noreferrer">
          {renderChildren(node.children)}
        </a>
      )
    }
    default:
      return <React.Fragment key={key}>{renderChildren(node.children)}</React.Fragment>
  }
}

export function RichText({ data }: { data: any }) {
  const root = data?.root
  if (!root?.children?.length) return null
  return <div>{renderChildren(root.children)}</div>
}
