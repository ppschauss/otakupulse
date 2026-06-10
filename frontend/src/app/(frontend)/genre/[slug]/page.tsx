import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { AnimeCard } from '@/components/AnimeCard'
import { Pagination } from '@/components/Pagination'
import { Faq } from '@/components/Faq'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Chip } from '@/components/Chip'
import { SeoFooter } from '@/components/SeoFooter'
import { pageMeta } from '@/lib/seo'
import { genreBlurb } from '@/lib/genre-info'
import { articleCategoryLabel, liveArticleFilters } from '@/lib/anime'
import { genreVars } from '@/lib/entityVars'
import { applyVarsMeta } from '@/lib/vars'

export const dynamic = 'force-dynamic'
const PER_PAGE = 36

async function getGenre(slug: string) {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'genres', where: { slug: { equals: slug } }, limit: 1, depth: 1 })
  return docs[0] as any
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const g = await getGenre(slug)
  if (!g) return {}
  const vars = genreVars(g)
  const meta = pageMeta({
    title: applyVarsMeta(g.seoTitle, vars) || `Die besten ${g.name}-Anime — Liste & Ranking | OtakuPulse`,
    description:
      applyVarsMeta(g.seoDescription, vars) ||
      (g.descriptionDe ? g.descriptionDe.slice(0, 160) : `Alle ${g.name}-Anime im Überblick: beliebteste Titel, Top-Studios, Tags und News. Sortiert und durchsuchbar.`),
    path: `/genre/${slug}`,
    image: g.imageUrl,
    noindex: g.noindex || undefined,
    canonical: g.canonicalUrl || undefined,
  })
  if (slug === 'hentai') meta.robots = { index: false, follow: true }
  meta.alternates = {
    ...meta.alternates,
    types: { 'application/rss+xml': [{ url: `/genre/${slug}/feed.xml`, title: `OtakuPulse — ${g.name}-Anime` }] },
  }
  return meta
}

// Aggregiert Top-Studios & häufige Tags aus den Genre-Anime und holt genre-relevante News.
async function getExtras(payload: any, genre: any) {
  const sample = await payload.find({
    collection: 'anime',
    where: { genres: { in: [genre.id] } },
    sort: '-popularity',
    limit: 80,
    depth: 1,
    select: { studios: true, tags: true },
  })

  const studioCount = new Map<any, { name: string; slug: string; n: number }>()
  const tagCount = new Map<any, { name: string; slug: string; n: number }>()
  const animeIds: any[] = []

  for (const a of sample.docs as any[]) {
    animeIds.push(a.id)
    for (const s of a.studios || []) {
      if (s && typeof s === 'object' && s.slug) {
        const e = studioCount.get(s.id) || { name: s.name, slug: s.slug, n: 0 }
        e.n++
        studioCount.set(s.id, e)
      }
    }
    for (const t of a.tags || []) {
      const tag = t?.tag
      if (tag && typeof tag === 'object' && tag.slug) {
        const e = tagCount.get(tag.id) || { name: tag.name, slug: tag.slug, n: 0 }
        e.n++
        tagCount.set(tag.id, e)
      }
    }
  }

  const topStudios = [...studioCount.values()].sort((a, b) => b.n - a.n).slice(0, 10)
  const topTags = [...tagCount.values()].sort((a, b) => b.n - a.n).slice(0, 15)

  const [related, news] = await Promise.all([
    payload.find({ collection: 'genres', where: { slug: { not_equals: genre.slug } }, sort: 'name', limit: 30, depth: 0 }),
    animeIds.length
      ? payload.find({
          collection: 'articles',
          where: { and: [{ relatedAnime: { in: animeIds } }, ...liveArticleFilters()] },
          sort: '-publishDate',
          limit: 6,
          depth: 0,
        })
      : Promise.resolve({ docs: [] } as any),
  ])

  return { topStudios, topTags, relatedGenres: related.docs as any[], news: news.docs as any[] }
}

function fmtDate(d?: string | null) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return ''
  }
}

export default async function GenreDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const isFirst = page === 1

  const genre = await getGenre(slug)
  if (!genre) notFound()

  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'anime',
    where: { genres: { in: [genre.id] } },
    sort: '-popularity',
    limit: PER_PAGE,
    page,
    depth: 0,
  })

  const extras = isFirst ? await getExtras(payload, genre) : null
  const intro = genre.descriptionDe || genreBlurb(genre.slug, genre.name)

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Genres', path: '/genre' },
          { name: genre.name, path: `/genre/${slug}` },
        ]}
      />
      <p className="text-sm font-semibold uppercase tracking-widest text-accent">Genre</p>
      <h1 className="mt-1 text-3xl font-extrabold text-white">{genre.name}-Anime</h1>
      <p className="mt-1 text-zinc-400">{result.totalDocs} Titel</p>

      <p className="mt-4 max-w-3xl leading-relaxed text-zinc-300">{intro}</p>

      {/* Quick-Links */}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={`/top-anime/${slug}`} className="rounded-lg bg-gradient-to-r from-accent to-accent-2 px-4 py-2 text-sm font-semibold text-white">
          🏆 Top {genre.name}-Ranking
        </Link>
        <Link href={`/suche?genre=${slug}&sort=newest`} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 transition hover:text-accent">
          Neueste
        </Link>
        <Link href={`/suche?genre=${slug}&sort=score`} className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 transition hover:text-accent">
          Bestbewertete
        </Link>
      </div>

      {/* Anime-Liste */}
      <h2 className="mt-10 text-xl font-bold text-white">Beliebte {genre.name}-Anime</h2>
      {result.docs.length === 0 ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Noch keine Anime in diesem Genre.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {result.docs.map((a: any) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </div>
      )}

      <Pagination basePath={`/genre/${slug}`} page={page} totalPages={result.totalPages} />

      {isFirst && extras ? (
        <>
          {/* Top-Studios */}
          {extras.topStudios.length ? (
            <section className="mt-12">
              <h2 className="mb-3 text-xl font-bold text-white">Top-Studios für {genre.name}-Anime</h2>
              <p className="mb-3 max-w-3xl text-sm text-zinc-400">
                Diese Studios produzieren besonders viele beliebte {genre.name}-Titel:
              </p>
              <div className="flex flex-wrap gap-2.5">
                {extras.topStudios.map((s) => (
                  <Link
                    key={s.slug}
                    href={`/studio/${s.slug}`}
                    className="rounded-lg border border-white/10 bg-zinc-900/40 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-accent/40 hover:text-white"
                  >
                    {s.name} <span className="text-xs text-zinc-500">{s.n}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {/* Häufige Tags */}
          {extras.topTags.length ? (
            <section className="mt-10">
              <h2 className="mb-3 text-xl font-bold text-white">Häufige Themen in {genre.name}-Anime</h2>
              <div className="flex flex-wrap gap-2.5">
                {extras.topTags.map((t) => (
                  <Chip key={t.slug} href={`/tag/${t.slug}`}>
                    {t.name}
                  </Chip>
                ))}
              </div>
            </section>
          ) : null}

          {/* News zum Genre */}
          <section className="mt-12">
            <div className="mb-3 flex items-end justify-between">
              <h2 className="text-xl font-bold text-white">News & Artikel zu {genre.name}</h2>
              <Link href="/news" className="text-sm text-zinc-400 hover:text-accent">
                Alle News →
              </Link>
            </div>
            {extras.news.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-5 text-sm text-zinc-400">
                Noch keine Artikel zu {genre.name}-Anime. Sobald News erscheinen, die {genre.name}-Titel behandeln,
                tauchen sie hier automatisch auf.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {extras.news.map((a: any) => (
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

          {/* Verwandte Genres */}
          {extras.relatedGenres.length ? (
            <section className="mt-12">
              <h2 className="mb-3 text-xl font-bold text-white">Weitere Genres entdecken</h2>
              <div className="flex flex-wrap gap-2.5">
                {extras.relatedGenres.map((g: any) => (
                  <Chip key={g.slug} href={`/genre/${g.slug}`}>
                    {g.name}
                  </Chip>
                ))}
              </div>
            </section>
          ) : null}

          {/* FAQ */}
          <Faq
            title={`Häufige Fragen zu ${genre.name}-Anime`}
            items={[
              { q: `Was macht ${genre.name}-Anime aus?`, a: genreBlurb(genre.slug, genre.name) },
              {
                q: `Welches sind die besten ${genre.name}-Anime?`,
                a: `Unser Ranking der bestbewerteten ${genre.name}-Anime findest du unter „Top ${genre.name}-Ranking". Es basiert auf der Community-Bewertung und wird laufend aktualisiert.`,
              },
              {
                q: `Wie viele ${genre.name}-Anime gibt es bei OtakuPulse?`,
                a: `Aktuell sind ${result.totalDocs} ${genre.name}-Anime erfasst, sortiert nach Beliebtheit. Die Datenbank wächst mit jedem Import.`,
              },
              {
                q: `Welche Studios sind für ${genre.name}-Anime bekannt?`,
                a:
                  extras.topStudios.length > 0
                    ? `Besonders aktiv im Genre ${genre.name} sind u. a. ${extras.topStudios.slice(0, 5).map((s) => s.name).join(', ')}.`
                    : `Auf den Anime-Detailseiten findest du das jeweils produzierende Studio verlinkt.`,
              },
              {
                q: `Wo kann ich ${genre.name}-Anime streamen?`,
                a: `Die Verfügbarkeit hängt vom Titel ab. Auf den jeweiligen Anime-Detailseiten findest du Plattform-Infos, sobald sie erfasst sind.`,
              },
            ]}
          />

          {/* SEO-Footer-Text */}
          <section className="mt-12 border-t border-white/10 pt-8">
            <h2 className="mb-3 text-lg font-bold text-white">{genre.name}-Anime auf OtakuPulse</h2>
            <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-zinc-400">
              <p>{intro}</p>
              <p>
                Auf OtakuPulse findest du {result.totalDocs} {genre.name}-Anime, sortiert nach Beliebtheit — von
                zeitlosen Klassikern bis zu den aktuellen Simulcasts der laufenden Season. Zu jedem Titel gibt es
                Charaktere, Synchronsprecher, Studios und Episoden, alles miteinander verlinkt. Stöbere durch das{' '}
                <Link href={`/top-anime/${slug}`} className="text-accent hover:underline">
                  {genre.name}-Ranking
                </Link>
                , entdecke{' '}
                <Link href="/genre" className="text-accent hover:underline">
                  weitere Genres
                </Link>{' '}
                oder behalte mit unserem{' '}
                <Link href="/kalender" className="text-accent hover:underline">
                  Simulcast-Kalender
                </Link>{' '}
                den Überblick über kommende {genre.name}-Episoden.
              </p>
            </div>
          </section>
        </>
      ) : null}

      <SeoFooter data={genre.footerText} vars={{ ...genreVars(genre), count: result.totalDocs }} maxW="max-w-6xl" />
    </main>
  )
}
