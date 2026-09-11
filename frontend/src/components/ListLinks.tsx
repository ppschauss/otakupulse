import Link from 'next/link'
import type { ListLink } from '@/lib/platformLists'

// Interne Links auf Streaming-Listen (nur indexierbare, ≥ 10 Titel). Kompakte Chip-Leiste.
export function ListLinks({ title, links }: { title: string; links: ListLink[] }) {
  if (!links.length) return null
  return (
    <section className="mt-8">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-400">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-full border border-white/10 bg-zinc-900/40 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-accent/40 hover:text-white"
          >
            {l.label} <span className="text-zinc-500">{l.n}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
