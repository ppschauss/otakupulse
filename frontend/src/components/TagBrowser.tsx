'use client'

import { useMemo, useState } from 'react'
import { Chip } from '@/components/Chip'

export type TagItem = { name: string; slug: string; n: number }
export type TagSection = { key: string; label: string; tags: TagItem[] }

export function TagBrowser({ sections, popular }: { sections: TagSection[]; popular: TagItem[] }) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()

  // Bei aktiver Suche: flache, gefilterte Trefferliste über alle Kategorien.
  const matches = useMemo(() => {
    if (!query) return null
    const seen = new Set<string>()
    const out: TagItem[] = []
    for (const s of sections) {
      for (const t of s.tags) {
        if (!seen.has(t.slug) && t.name.toLowerCase().includes(query)) {
          seen.add(t.slug)
          out.push(t)
        }
      }
    }
    return out.sort((a, b) => b.n - a.n)
  }, [query, sections])

  return (
    <>
      {/* Live-Suche */}
      <div className="mt-6">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tag suchen … (z. B. Zeitreise, Schule, Vampire)"
          className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent focus:outline-none"
        />
      </div>

      {matches ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-zinc-400">
            {matches.length} Treffer für „{q.trim()}"
          </h2>
          {matches.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-zinc-900/50 p-6 text-center text-zinc-400">
              Keine Tags gefunden.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {matches.map((t) => (
                <Chip key={t.slug} href={`/tag/${t.slug}`} count={t.n || undefined}>
                  {t.name}
                </Chip>
              ))}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Beliebteste Tags */}
          {popular.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent">Beliebteste Tags</h2>
              <div className="flex flex-wrap gap-2.5">
                {popular.map((t) => (
                  <Chip key={t.slug} href={`/tag/${t.slug}`} count={t.n || undefined}>
                    {t.name}
                  </Chip>
                ))}
              </div>
            </section>
          ) : null}

          {/* Kategorie-Sprungnav */}
          <nav className="sticky top-16 z-10 mt-8 flex flex-wrap gap-2 rounded-xl border border-white/10 bg-zinc-950/80 p-2 backdrop-blur">
            {sections.map((s) => (
              <a
                key={s.key}
                href={`#cat-${s.key}`}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-200 transition hover:bg-accent/20 hover:text-accent"
              >
                {s.label} <span className="text-xs text-zinc-500">{s.tags.length}</span>
              </a>
            ))}
          </nav>

          <div className="mt-8 space-y-10">
            {sections.map((s) => (
              <section key={s.key} id={`cat-${s.key}`} className="scroll-mt-28">
                <h2 className="mb-3 text-lg font-bold text-white">
                  <span className="mr-2 inline-block h-4 w-1 translate-y-0.5 rounded bg-gradient-to-b from-accent to-accent-2 align-middle" />
                  {s.label}
                </h2>
                <div className="flex flex-wrap gap-2.5">
                  {s.tags.map((t) => (
                    <Chip key={t.slug} href={`/tag/${t.slug}`} count={t.n || undefined}>
                      {t.name}
                    </Chip>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  )
}
