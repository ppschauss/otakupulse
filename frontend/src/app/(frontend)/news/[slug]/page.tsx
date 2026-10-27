import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound, permanentRedirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { RichText, splitAfterParagraphs } from '@/components/RichText'
import { AnimeCard } from '@/components/AnimeCard'
import { JsonLd } from '@/components/JsonLd'
import { ShareButtons } from '@/components/ShareButtons'
import { AdInArticle, AdMultiplex } from '@/components/AdSlot'
import { articleCategoryLabel, liveArticleFilters } from '@/lib/anime'
import { pageMeta } from '@/lib/seo'
import { ADULT_REDIRECT_TARGET, adsAllowedForArticle, isBlockedArticle } from '@/lib/adult'
import { url, SITE_NAME } from '@/lib/site'

export const dynamic = 'force-dynamic'

/** YouTube-Video-ID aus watch?v=… / youtu.be/… / embed/… extrahieren. */
function youtubeId(u?: string | null): string | null {
  if (!u) return null
  const m = String(u).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
}

/** Cover-URL absolut machen (lokale /media-Pfade → volle Domain). */
function coverUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined
  return raw.startsWith('http') ? raw : url(raw)
}

async function getArticle(slug: string) {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'articles',
    where: { and: [{ slug: { equals: slug } }, ...liveArticleFilters()] },
    limit: 1,
    depth: 1,
  })
  const article = docs[0] as any
  // Beiträge zu Titeln aus dem gesperrten Bestand (Hentai) sind nicht mehr öffentlich.
  if (article && isBlockedArticle(article)) permanentRedirect(ADULT_REDIRECT_TARGET)
  return article
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const a = await getArticle(slug)
  if (!a) return {}
  const author = a.author && typeof a.author === 'object' ? a.author : null
  const meta = pageMeta({
    title: a.seoTitle || `${a.title} — OtakuPulse`,
    description: a.seoDescription || a.excerpt || a.title,
    path: `/news/${a.slug}`,
    image: coverUrl(a.coverImageUrl),
    noindex: a.noindex,
    canonical: a.canonicalUrl || undefined,
  })
  // Für Beiträge den passenderen og:type „article" (+ Zeitstempel/Autor) setzen.
  meta.openGraph = {
    ...(meta.openGraph as any),
    type: 'article',
    publishedTime: a.publishDate || undefined,
    modifiedTime: a.updatedAt || a.publishDate || undefined,
    ...(author ? { authors: [author.name] } : {}),
    ...(a.category ? { section: articleCategoryLabel(a.category) } : {}),
  }
  return meta
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

  const adsAllowed = adsAllowedForArticle(article)
  // Google empfiehlt den In-Article-Block „idealerweise nach dem zweiten Absatz".
  // Für kurze Beiträge gibt es keinen sinnvollen Schnitt — dann steht er darunter.
  const adCut = splitAfterParagraphs(article.body)
  const articleImage = coverUrl(article.coverImageUrl)
  const ytId = youtubeId(article.trailerUrl)
  const shareUrl = url(`/news/${article.slug}`)
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    description: article.excerpt || article.seoDescription || undefined,
    image: articleImage ? [articleImage] : undefined,
    datePublished: article.publishDate || undefined,
    dateModified: article.updatedAt || article.publishDate || undefined,
    author: author
      ? { '@type': 'Person', name: author.name, url: url(`/autor/${author.slug}`) }
      : { '@type': 'Organization', name: SITE_NAME },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: url('/icon.svg') },
    },
    mainEntityOfPage: url(`/news/${article.slug}`),
    // Paywall-frei — sinnvolles SEO-Signal (unabhängig von Google-Diensten).
    isAccessibleForFree: true,
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <JsonLd data={articleLd} />
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

      <div className="mt-4">
        <ShareButtons url={shareUrl} title={article.title} message={`Schau dir diesen Beitrag auf OtakuPulse an: „${article.title}“ 👀`} />
      </div>

      {ytId ? (
        <div className="relative mt-6 aspect-video w-full overflow-hidden rounded-xl ring-1 ring-white/10">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${ytId}`}
            title={`${article.title} – Trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            className="absolute inset-0 h-full w-full"
          />
        </div>
      ) : article.coverImageUrl ? (
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
        {adCut === null ? (
          <RichText data={article.body} />
        ) : (
          <>
            <RichText data={article.body} to={adCut} />
            <AdInArticle allowed={adsAllowed} />
            <RichText data={article.body} from={adCut} />
          </>
        )}
      </article>

      {adCut === null ? <AdInArticle allowed={adsAllowed} /> : null}

      <div className="mt-8 border-t border-white/10 pt-6">
        <ShareButtons url={shareUrl} title={article.title} message={`Schau dir diesen Beitrag auf OtakuPulse an: „${article.title}“ 👀`} />
      </div>

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

      <AdMultiplex allowed={adsAllowed} />
    </main>
  )
}
