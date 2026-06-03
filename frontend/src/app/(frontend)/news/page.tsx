import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import { Pagination } from '@/components/Pagination'
import { articleCategoryLabel } from '@/lib/anime'

export const dynamic = 'force-dynamic'
const PER_PAGE = 12

export const metadata = {
  title: 'Anime-News & Artikel — OtakuPulse',
  description: 'Aktuelle Anime-News, Reviews, Guides und Season-Vorschauen.',
}

function fmtDate(d?: string | null) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return ''
  }
}

export default async function NewsListPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)

  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'articles',
    where: { _status: { equals: 'published' } },
    sort: '-publishDate',
    limit: PER_PAGE,
    page,
    depth: 1,
  })

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">News & Artikel</h1>
      <p className="mt-1 text-zinc-400">{result.totalDocs} Beiträge</p>

      {result.docs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Noch keine Artikel veröffentlicht.
        </div>
      ) : (
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {result.docs.map((a: any) => (
            <Link
              key={a.id}
              href={`/news/${a.slug}`}
              className="group overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40 transition hover:border-accent/40"
            >
              {a.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.coverImageUrl} alt={a.title} className="h-44 w-full object-cover" loading="lazy" />
              ) : (
                <div className="h-44 w-full bg-gradient-to-br from-accent/20 to-accent-2/20" />
              )}
              <div className="p-4">
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  {a.category ? <span className="font-semibold text-accent">{articleCategoryLabel(a.category)}</span> : null}
                  {a.publishDate ? <span>· {fmtDate(a.publishDate)}</span> : null}
                </div>
                <h2 className="mt-1 text-lg font-bold text-white transition group-hover:text-accent">{a.title}</h2>
                {a.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{a.excerpt}</p> : null}
              </div>
            </Link>
          ))}
        </div>
      )}

      <Pagination basePath="/news" page={page} totalPages={result.totalPages} />
    </main>
  )
}
