import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import Image from 'next/image'
import { articleCategoryLabel, liveArticleFilters } from '@/lib/anime'

function fmtDate(d?: string | null) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

// „Aktuelle News" auf der Startseite: die neuesten veröffentlichten Artikel
// über ALLE Kategorien hinweg (Simulcast, Episoden, Ankündigungen, Spotlights …),
// damit die täglich frisch generierten Beiträge auch auf der Home auftauchen.
export async function LatestNews({ limit = 6 }: { limit?: number }) {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'articles',
    where: { and: [...liveArticleFilters()] },
    sort: '-publishDate',
    limit,
    depth: 0,
  })

  if (docs.length === 0) return null

  return (
    <section className="mt-14">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="text-xl font-bold text-white">Aktuelle News</h2>
        <Link href="/news" className="text-sm text-zinc-400 transition hover:text-accent">
          Alle News →
        </Link>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {docs.map((a: any) => (
          <Link
            key={a.id}
            href={`/news/${a.slug}`}
            className="group overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40 transition hover:border-accent/40"
          >
            {a.coverImageUrl ? (
              <div className="relative h-40 w-full">
                <Image
                  src={a.coverImageUrl}
                  alt={a.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="h-40 w-full bg-gradient-to-br from-accent/20 to-accent-2/20" />
            )}
            <div className="p-4">
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                {a.category ? (
                  <span className="font-semibold text-accent">{articleCategoryLabel(a.category)}</span>
                ) : null}
                {a.publishDate ? <span>· {fmtDate(a.publishDate)}</span> : null}
              </div>
              <h3 className="mt-1 line-clamp-2 text-base font-bold text-white transition group-hover:text-accent">
                {a.title}
              </h3>
              {a.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{a.excerpt}</p> : null}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
