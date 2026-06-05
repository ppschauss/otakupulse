import Link from 'next/link'
import Image from 'next/image'
import { articleCategoryLabel } from '@/lib/anime'
import type { Agg } from '@/lib/hub'

// Chip-Reihe mit internen Links (Genres/Studios/Tags/Seasons …).
export function ChipSection({
  title,
  subtitle,
  base,
  items,
  withCount,
}: {
  title: string
  subtitle?: string
  base: string
  items: Agg[] | { name: string; slug: string; n?: number }[]
  withCount?: boolean
}) {
  if (!items?.length) return null
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-xl font-bold text-white">{title}</h2>
      {subtitle ? <p className="mb-3 max-w-3xl text-sm text-zinc-400">{subtitle}</p> : null}
      <div className="flex flex-wrap gap-2.5">
        {items.map((it) => (
          <Link
            key={it.slug}
            href={`${base}/${it.slug}`}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-accent/15 to-accent-2/15 px-4 py-1.5 text-sm text-zinc-200 ring-1 ring-white/10 transition hover:from-accent/30 hover:to-accent-2/30 hover:text-white"
          >
            {it.name}
            {withCount && (it as Agg).n ? <span className="text-xs text-zinc-400">{(it as Agg).n}</span> : null}
          </Link>
        ))}
      </div>
    </section>
  )
}

function fmtDate(d?: string | null) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return ''
  }
}

// News-Bereich mit entitätsrelevanten Artikeln (oder Platzhalter).
export function NewsSection({ title, entity, items }: { title: string; entity: string; items: any[] }) {
  return (
    <section className="mt-12">
      <div className="mb-3 flex items-end justify-between">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <Link href="/news" className="text-sm text-zinc-400 hover:text-accent">
          Alle News →
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-5 text-sm text-zinc-400">
          Noch keine Artikel zu {entity}. Sobald passende News erscheinen, tauchen sie hier automatisch auf.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((a: any) => (
            <Link
              key={a.id}
              href={`/news/${a.slug}`}
              className="group overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40 transition hover:border-accent/40"
            >
              {a.coverImageUrl ? (
                <div className="relative h-36 w-full">
                  <Image
                    src={a.coverImageUrl}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="h-36 w-full bg-gradient-to-br from-accent/20 to-accent-2/20" />
              )}
              <div className="p-4">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  {a.category ? <span className="font-semibold text-accent">{articleCategoryLabel(a.category)}</span> : null}
                  {a.publishDate ? <span>· {fmtDate(a.publishDate)}</span> : null}
                </div>
                <h3 className="mt-1 line-clamp-2 font-bold text-white transition group-hover:text-accent">{a.title}</h3>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
