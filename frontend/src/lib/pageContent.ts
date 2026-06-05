// Lädt das Global "page-content" und liefert pro Übersichtsseite die gepflegten
// Footer-Texte und Meta-Überschreibungen. Pro Request gecached.
import { cache } from 'react'
import type { Metadata } from 'next'
import { getPayload } from 'payload'
import config from '@payload-config'
import { pageMeta } from './seo'
import { applyVars, type Vars } from './vars'

export type PageEntry = {
  key: string
  metaTitle?: string | null
  metaDescription?: string | null
  noindex?: boolean | null
  footerText?: any
}

const loadAll = cache(async (): Promise<Record<string, PageEntry>> => {
  try {
    const payload = await getPayload({ config })
    const g: any = await payload.findGlobal({ slug: 'page-content' })
    const map: Record<string, PageEntry> = {}
    for (const p of Array.isArray(g?.pages) ? g.pages : []) {
      if (p?.key) map[p.key] = p
    }
    return map
  } catch {
    return {}
  }
})

export async function getPageContent(key: string): Promise<PageEntry | null> {
  const all = await loadAll()
  return all[key] ?? null
}

// Baut Metadata für eine Übersichtsseite: gepflegte Werte (mit {{variablen}})
// überschreiben die übergebenen Standardwerte.
export async function pageMetaFor(
  key: string,
  fallback: { title: string; description?: string; path: string; image?: string | null },
  vars: Vars = {},
): Promise<Metadata> {
  const e = await getPageContent(key)
  // In Meta-Tags dürfen keine rohen {{platzhalter}} leaken → unaufgelöste entfernen.
  const clean = (s: string) =>
    applyVars(s, vars).replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, '').replace(/\s{2,}/g, ' ').trim()
  return pageMeta({
    title: e?.metaTitle ? clean(e.metaTitle) : fallback.title,
    description: e?.metaDescription ? clean(e.metaDescription) : fallback.description,
    path: fallback.path,
    image: fallback.image,
    noindex: e?.noindex || undefined,
  })
}
