import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Pagination } from '@/components/Pagination'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { NewsListSidebar } from '@/components/NewsListSidebar'
import { pageMeta } from '@/lib/seo'
import { ARTICLE_CATEGORY_LABELS, articleCategoryLabel } from '@/lib/anime'

export const dynamic = 'force-dynamic'
const PER_PAGE = 12

function fmtDate(d?: string | null) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return ''
  }
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params
  if (!ARTICLE_CATEGORY_LABELS[category]) return {}
  const label = articleCategoryLabel(category)
  return pageMeta({
    title: `${label} — Anime-${label} | OtakuPulse`,
    description: `Alle Artikel der Kategorie ${label} auf OtakuPulse.`,
    path: `/news/kategorie/${category}`,
  })
}

export default async function NewsCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { category } = await params
  if (!ARTICLE_CATEGORY_LABELS[category]) notFound()
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const label = articleCategoryLabel(category)

  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'articles',
    where: { and: [{ category: { equals: category } }, { _status: { equals: 'published' } }] },
    sort: '-publishDate',
    limit: PER_PAGE,
    page,
    depth: 0,
  })

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <Breadcrumbs
            items={[
              { name: 'Start', path: '/' },
              { name: 'News', path: '/news' },
              { name: label, path: `/news/kategorie/${category}` },
            ]}
          />
          <h1 className="text-2xl font-extrabold text-white">{label}</h1>
          <p className="mt-1 text-zinc-400">{result.totalDocs} Beiträge</p>

          {result.docs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Noch keine Artikel in dieser Kategorie.
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
                <p className="text-xs text-zinc-500">{fmtDate(a.publishDate)}</p>
                <h2 className="mt-1 text-lg font-bold text-white transition group-hover:text-accent">{a.title}</h2>
                {a.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{a.excerpt}</p> : null}
              </div>
            </Link>
          ))}
        </div>
      )}

          <Pagination basePath={`/news/kategorie/${category}`} page={page} totalPages={result.totalPages} />
        </div>

        <NewsListSidebar activeCategory={category} />
      </div>
    </main>
  )
}
