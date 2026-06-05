import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Pagination } from '@/components/Pagination'
import { NewsListSidebar } from '@/components/NewsListSidebar'
import { ARTICLE_CATEGORY_LABELS, articleCategoryLabel } from '@/lib/anime'
import { pageMeta } from '@/lib/seo'
import { pageMetaFor } from '@/lib/pageContent'
import { PageSeoFooter } from '@/components/SeoFooter'

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

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>
}): Promise<Metadata> {
  const sp = await searchParams
  const cat = sp.category && ARTICLE_CATEGORY_LABELS[sp.category] ? sp.category : ''
  const q = (sp.q || '').trim()
  // Basisseite (ohne Kategorie): im Admin gepflegte Meta-Werte mergen.
  if (!cat) {
    const meta = await pageMetaFor('news', {
      title: 'Anime-News & Artikel — OtakuPulse',
      description: 'Aktuelle Anime-News, Reviews, Guides und Season-Vorschauen — durchsuchbar und nach Kategorie filterbar.',
      path: '/news',
    })
    // Reine Suchansicht nicht indexieren (Duplicate Content).
    if (q) meta.robots = { index: false, follow: true }
    return meta
  }
  const meta = pageMeta({
    title: `${articleCategoryLabel(cat)} — Anime-News | OtakuPulse`,
    description: 'Aktuelle Anime-News, Reviews, Guides und Season-Vorschauen — durchsuchbar und nach Kategorie filterbar.',
    path: '/news',
  })
  // Gefilterte/gesuchte Ansichten nicht indexieren (Duplicate Content; Kategorie-Hubs unter /news/kategorie sind kanonisch).
  if (q || cat) meta.robots = { index: false, follow: true }
  return meta
}

export default async function NewsListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; category?: string }>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const q = (sp.q || '').trim()
  const category = sp.category && ARTICLE_CATEGORY_LABELS[sp.category] ? sp.category : ''

  const payload = await getPayload({ config })

  const and: any[] = [{ _status: { equals: 'published' } }]
  if (category) and.push({ category: { equals: category } })
  if (q) and.push({ or: [{ title: { like: q } }, { excerpt: { like: q } }] })

  const result = await payload.find({
    collection: 'articles',
    where: { and },
    sort: '-publishDate',
    limit: PER_PAGE,
    page,
    depth: 1,
  })

  const heading = category ? articleCategoryLabel(category) : q ? `Suche: „${q}"` : 'News & Artikel'

  return (
    <>
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* Hauptspalte */}
        <div>
          <h1 className="text-2xl font-extrabold text-white">{heading}</h1>
          <p className="mt-1 text-zinc-400">
            {result.totalDocs} {result.totalDocs === 1 ? 'Beitrag' : 'Beiträge'}
            {q || category ? (
              <Link href="/news" className="ml-3 text-sm text-zinc-500 hover:text-accent">
                Filter zurücksetzen
              </Link>
            ) : null}
          </p>

          {result.docs.length === 0 ? (
            <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
              {q ? `Keine Beiträge für „${q}" gefunden.` : 'Noch keine Artikel veröffentlicht.'}
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
                      {a.category ? (
                        <span className="font-semibold text-accent">{articleCategoryLabel(a.category)}</span>
                      ) : null}
                      {a.publishDate ? <span>· {fmtDate(a.publishDate)}</span> : null}
                    </div>
                    <h2 className="mt-1 text-lg font-bold text-white transition group-hover:text-accent">{a.title}</h2>
                    {a.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-zinc-400">{a.excerpt}</p> : null}
                  </div>
                </Link>
              ))}
            </div>
          )}

          <Pagination basePath="/news" page={page} totalPages={result.totalPages} query={{ q, category }} />
        </div>

        {/* Sidebar */}
        <NewsListSidebar activeCategory={category} query={q} />
      </div>
    </main>
    <PageSeoFooter pageKey="news" maxW="max-w-6xl" />
    </>
  )
}
