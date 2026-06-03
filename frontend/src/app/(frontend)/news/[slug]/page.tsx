import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { RichText } from '@/components/RichText'
import { AnimeCard } from '@/components/AnimeCard'
import { articleCategoryLabel } from '@/lib/anime'

export const dynamic = 'force-dynamic'

async function getArticle(slug: string) {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'articles',
    where: { slug: { equals: slug }, _status: { equals: 'published' } },
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
        // eslint-disable-next-line @next/next/no-img-element
        <img src={article.coverImageUrl} alt={article.title} className="mt-6 w-full rounded-xl ring-1 ring-white/10" />
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
    </main>
  )
}
