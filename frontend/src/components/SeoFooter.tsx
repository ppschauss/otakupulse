import { RichText } from '@/components/RichText'
import { applyVarsToLexical, type Vars } from '@/lib/vars'
import { getPageContent } from '@/lib/pageContent'

/**
 * SEO-/Footer-Textblock am Seitenende (Übersichts- & Detailseiten). Erhält
 * Payload-Lexical-Daten und ersetzt {{variablen}} vor dem Rendern.
 */
export function SeoFooter({
  data,
  vars = {},
  maxW = 'max-w-6xl',
}: {
  data: any
  vars?: Vars
  maxW?: string
}) {
  if (!data?.root?.children?.length) return null
  const resolved = applyVarsToLexical(data, vars)
  return (
    <section className={`mx-auto ${maxW} px-4 py-10`}>
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-sm leading-relaxed text-zinc-400">
        <RichText data={resolved} />
      </div>
    </section>
  )
}

/**
 * Footer-Text einer Übersichtsseite: lädt das Global "page-content" selbst und
 * rendert den gepflegten Text (mit Variablen-Ersetzung). Eine Zeile pro Seite.
 */
export async function PageSeoFooter({
  pageKey,
  vars = {},
  maxW,
}: {
  pageKey: string
  vars?: Vars
  maxW?: string
}) {
  const entry = await getPageContent(pageKey)
  return <SeoFooter data={entry?.footerText} vars={vars} maxW={maxW} />
}
