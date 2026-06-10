import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { RichText } from '@/components/RichText'
import { AnimeCard } from '@/components/AnimeCard'
import { articleCategoryLabel, liveArticleFilters } from '@/lib/anime'

export const dynamic = 'force-dynamic'

async function getArticle(slug: string) {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'articles',
    where: { and: [{ slug: { equals: slug } }, ...liveArticleFilters()] },
    limit: 1,
    depth: 1,
  })
  return docs[0] as any
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const a = await getArticle(slug)
  if (!a) return {}
  return {
    title: a.seoTitle || `${a.title} — OtakuPulse`,
    description: a.seoDescription || a.excerpt || a.title,
  }
}

function fmtDate(d?: string | null) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return ''
  }
}

export default async function ArticleDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const article = await getArticle(slug)
  if (!article) notFound()

  const author = article.author && typeof article.author === 'object' ? article.author : null
  const relatedAnime: any[] = Array.isArray(article.relatedAnime)
    ? article.relatedAnime.filter((a: any) => typeof a === 'object')
    : []

  // Ähnliche Artikel: gleiche Kategorie, veröffentlicht, ohne diesen Artikel
  const payload = await getPayload({ config })
  const related = (
    await payload.find({
      collection: 'articles',
      where: {
        and: [
          { category: { equals: article.category } },
          { id: { not_equals: article.id } },
          ...liveArticleFilters(),
        ],
      },
      sort: '-publishDate',
      limit: 4,
      depth: 0,
    })
  ).docs as any[]

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        {article.category ? <span className="font-semibold text-accent">{articleCategoryLabel(article.category)}</span> : null}
        {article.publishDate ? <span>· {fmtDate(article.publishDate)}</span> : null}
      </div>
      <h1 className="mt-2 text-3xl font-extrabold leading-tight text-white sm:text-4xl">{article.title}</h1>

      {author ? (
        <p className="mt-3 text-sm text-zinc-400">
          von{' '}
          <Link href={`/autor/${author.slug}`} className="text-accent hover:underline">
            {author.name}
          </Link>
        </p>
      ) : null}

      {article.coverImageUrl ? (
        <div className="relative mt-6 aspect-video w-full overflow-hidden rounded-xl ring-1 ring-white/10">
          <Image
            src={article.coverImageUrl}
            alt={article.title}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
        </div>
      ) : null}

      <article className="mt-8">
        <RichText data={article.body} />
      </article>

      {relatedAnime.length ? (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-bold text-white">Erwähnte Anime</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4">
            {relatedAnime.map((a: any) => (
              <AnimeCard key={a.id} anime={a} />
            ))}
          </div>
        </section>
      ) : null}

      {related.length ? (
        <section className="mt-12 border-t border-white/10 pt-8">
          <h2 className="mb-4 text-lg font-bold text-white">Ähnliche Artikel</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {related.map((a: any) => (
              <Link
                key={a.id}
                href={`/news/${a.slug}`}
                className="group flex gap-3 rounded-xl border border-white/10 bg-zinc-900/40 p-3 transition hover:border-accent/40"
              >
                {a.coverImageUrl ? (
                  <Image
                    src={a.coverImageUrl}
                    alt=""
                    width={96}
                    height={64}
                    sizes="96px"
                    className="h-16 w-24 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="h-16 w-24 shrink-0 rounded bg-gradient-to-br from-accent/20 to-accent-2/20" />
                )}
                <div className="min-w-0">
                  <p className="text-xs text-zinc-500">
                    {articleCategoryLabel(a.category)}
                    {a.publishDate ? ` · ${fmtDate(a.publishDate)}` : ''}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm font-medium text-zinc-100 transition group-hover:text-accent">
                    {a.title}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  )
}
