// JS-freies FAQ-Accordion (native <details>). Erzeugt zusätzlich FAQPage-
// Structured-Data (Schema.org) für SEO-Rich-Results.
export type FaqItem = { q: string; a: string }

export function Faq({ items, title = 'Häufige Fragen' }: { items: FaqItem[]; title?: string }) {
  if (!items.length) return null

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  }

  return (
    <section className="mt-12">
      <h2 className="mb-4 text-xl font-bold text-white">{title}</h2>
      <div className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40">
        {items.map((it, i) => (
          <details key={i} className="group px-5 [&_summary]:list-none">
            <summary className="flex cursor-pointer items-center justify-between gap-4 py-4 text-sm font-medium text-zinc-100">
              {it.q}
              <span className="shrink-0 text-zinc-500 transition group-open:rotate-45">+</span>
            </summary>
            <p className="pb-4 text-sm leading-relaxed text-zinc-400">{it.a}</p>
          </details>
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </section>
  )
}
