// Platzhalter-Variablen für Admin-pflegbare Texte (Footer-Texte, Meta-Tags).
// Syntax im Text: {{variable}}. Unbekannte Platzhalter bleiben unverändert.
import { SITE_NAME, SITE_URL } from './site'

export type Vars = Record<string, string | number | null | undefined>

// Liste der verfügbaren Variablen (für Admin-Beschreibungen).
export const VARS_HELP =
  'Variablen: {{siteName}}, {{year}}, {{siteUrl}}, {{url}}, {{name}}, {{count}}, {{animeTotal}}.'

// Immer verfügbare Basis-Variablen. (year als String, damit es nicht mit
// Tausendertrennzeichen formatiert wird.)
export function baseVars(): Vars {
  return { siteName: SITE_NAME, siteUrl: SITE_URL, year: String(new Date().getFullYear()) }
}

// Ersetzt {{key}} in einem String. Zahlen werden lokalisiert (de-DE) ausgegeben.
export function applyVars(input: string | null | undefined, vars: Vars): string {
  if (!input) return ''
  const all = { ...baseVars(), ...vars }
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, key: string) => {
    const v = all[key]
    if (v === null || v === undefined) return m
    return typeof v === 'number' ? v.toLocaleString('de-DE') : String(v)
  })
}

// Für Meta-Tags: ersetzt Variablen und entfernt unaufgelöste {{platzhalter}},
// damit keine rohen Klammern in Title/Description leaken.
export function applyVarsMeta(input: string | null | undefined, vars: Vars): string {
  return applyVars(input, vars)
    .replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Tiefes Ersetzen in Payload-Lexical-Daten (nur Text-Knoten), unveränderlich.
export function applyVarsToLexical(data: any, vars: Vars): any {
  if (!data) return data
  const walk = (node: any): any => {
    if (Array.isArray(node)) return node.map(walk)
    if (node && typeof node === 'object') {
      const next: any = { ...node }
      if (typeof next.text === 'string') next.text = applyVars(next.text, vars)
      if (next.root) next.root = walk(next.root)
      if (Array.isArray(next.children)) next.children = next.children.map(walk)
      return next
    }
    return node
  }
  return walk(data)
}
