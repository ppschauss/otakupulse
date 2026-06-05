import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { AnimeCard } from '@/components/AnimeCard'
import { Pagination } from '@/components/Pagination'
import { Faq } from '@/components/Faq'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ChipSection, NewsSection } from '@/components/HubSections'
import { SeoFooter } from '@/components/SeoFooter'
import { pageMeta } from '@/lib/seo'
import { hubExtras } from '@/lib/hub'
import { studioVars } from '@/lib/entityVars'
import { applyVarsMeta } from '@/lib/vars'

export const dynamic = 'force-dynamic'
const PER_PAGE = 36

async function getStudio(slug: string) {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'studios', where: { slug: { equals: slug } }, limit: 1, depth: 0 })
  return docs[0] as any
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const s = await getStudio(slug)
  if (!s) return {}
  return pageMeta({
    title: applyVarsMeta(s.seoTitle, studioVars(s)) || `${s.name} — Anime des Studios & Produktionen | OtakuPulse`,
    description:
      applyVarsMeta(s.seoDescription, studioVars(s)) ||
      (s.descriptionDe ? s.descriptionDe.slice(0, 160) : `Alle Anime-Produktionen von ${s.name} im Überblick.`),
    path: `/studio/${slug}`,
    image: s.logoUrl,
    noindex: s.noindex || undefined,
    canonical: s.canonicalUrl || undefined,
  })
}

export default async function StudioDetail({
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

  const studio = await getStudio(slug)
  if (!studio) notFound()

  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'anime',
    where: { studios: { in: [studio.id] } },
    sort: '-popularity',
    limit: PER_PAGE,
    page,
    depth: 0,
  })

  const intro =
    studio.descriptionDe ||
    `${studio.name} ist eines der Studios im Anime-Kosmos. Hier findest du alle bei OtakuPulse erfassten Produktionen — von bekannten Hits bis zu Geheimtipps, sortiert nach Beliebtheit.`

  const extras = isFirst ? await hubExtras(payload, { studios: { in: [studio.id] } }) : null
  const otherStudios = isFirst
    ? (await payload.find({ collection: 'studios', where: { slug: { not_equals: slug } }, sort: 'name', limit: 24, depth: 0 })).docs
    : []

  // Statistik-Leiste (nur Seite 1): Ø-Bewertung + bestbewerteter Titel.
  let stats: { avg: number | null; best: any | null } | null = null
  if (isFirst) {
    const pool = (payload.db as any).pool
    const [agg, best] = await Promise.all([
      pool.query(
        `SELECT round(avg(a.average_score))::int AS avg FROM anime a
         JOIN anime_rels ar ON ar.parent_id = a.id
         WHERE ar.studios_id = $1 AND a.average_score IS NOT NULL`,
        [studio.id],
      ),
      pool.query(
        `SELECT a.slug, a.title_german AS de, a.title_english AS en, a.title_romaji AS ro, a.average_score AS score
         FROM anime a JOIN anime_rels ar ON ar.parent_id = a.id
         WHERE ar.studios_id = $1 AND a.average_score IS NOT NULL
         ORDER BY a.average_score DESC NULLS LAST LIMIT 1`,
        [studio.id],
      ),
    ])
    stats = { avg: agg.rows[0]?.avg ?? null, best: best.rows[0] ?? null }
  }
  const topGenre = extras?.topGenres?.[0]?.name ?? null

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Studios', path: '/studio' },
          { name: studio.name, path: `/studio/${slug}` },
        ]}
      />
      <p className="text-sm font-semibold uppercase tracking-widest text-accent">
        {studio.isAnimationStudio ? 'Animationsstudio' : 'Produktion & Vertrieb'}
      </p>
      <div className="mt-1 flex items-center gap-4">
        {studio.logoUrl ? (
          <span className="flex h-14 shrink-0 items-center justify-center rounded-lg bg-white/90 px-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={studio.logoUrl} alt={studio.name} className="max-h-10 max-w-[160px] object-contain" />
          </span>
        ) : null}
        <h1 className="text-3xl font-extrabold text-white">{studio.name}</h1>
      </div>

      {/* Statistik-Leiste */}
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-3">
          <dt className="text-xs text-zinc-500">Anime</dt>
          <dd className="text-lg font-bold text-white">{result.totalDocs}</dd>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-3">
          <dt className="text-xs text-zinc-500">Ø-Bewertung</dt>
          <dd className="text-lg font-bold text-white">{stats?.avg ? `${stats.avg}%` : '–'}</dd>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-3">
          <dt className="text-xs text-zinc-500">Top-Genre</dt>
          <dd className="truncate text-lg font-bold text-white">{topGenre || '–'}</dd>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-3">
          <dt className="text-xs text-zinc-500">Bestbewertet</dt>
          <dd className="truncate text-sm font-semibold text-white">
            {stats?.best ? (
              <Link href={`/anime/${stats.best.slug}`} className="hover:text-accent">
                {stats.best.de || stats.best.en || stats.best.ro}
              </Link>
            ) : (
              '–'
            )}
          </dd>
        </div>
      </dl>

      <p className="mt-5 max-w-3xl leading-relaxed text-zinc-300">{intro}</p>
      {studio.website ? (
        <a
          href={studio.website}
          target="_blank"
          rel="nofollow noopener noreferrer"
          className="mt-3 inline-block text-sm text-accent hover:underline"
        >
          Offizielle Website →
        </a>
      ) : null}

      <h2 className="mt-10 text-xl font-bold text-white">Anime von {studio.name}</h2>
      {result.docs.length === 0 ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Noch keine Anime von diesem Studio.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {result.docs.map((a: any) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </div>
      )}

      <Pagination basePath={`/studio/${slug}`} page={page} totalPages={result.totalPages} />

      {isFirst && extras ? (
        <>
          <ChipSection
            title={`Genres von ${studio.name}`}
            subtitle={`In diesen Genres ist ${studio.name} besonders aktiv:`}
            base="/genre"
            items={extras.topGenres}
            withCount
          />
          <ChipSection title="Häufige Themen" base="/tag" items={extras.topTags} />
          <NewsSection title={`News zu ${studio.name}`} entity={`${studio.name}-Produktionen`} items={extras.news} />
          <ChipSection title="Weitere Studios entdecken" base="/studio" items={otherStudios as any} />

          <Faq
            title={`Häufige Fragen zu ${studio.name}`}
            items={[
              {
                q: `Welche Anime hat ${studio.name} produziert?`,
                a: `Bei OtakuPulse sind aktuell ${result.totalDocs} Produktionen von ${studio.name} erfasst, nach Beliebtheit sortiert. Die Liste wächst mit jedem Import.`,
              },
              {
                q: `In welchen Genres ist ${studio.name} aktiv?`,
                a:
                  extras.topGenres.length > 0
                    ? `Schwerpunkte von ${studio.name} sind u. a. ${extras.topGenres.slice(0, 5).map((g) => g.name).join(', ')}.`
                    : `Die Genres findest du auf den jeweiligen Anime-Detailseiten verlinkt.`,
              },
              {
                q: `Ist ${studio.name} ein Animationsstudio?`,
                a: studio.isAnimationStudio
                  ? `Ja, ${studio.name} ist als Animationsstudio erfasst.`
                  : `${studio.name} ist als Produktionsfirma erfasst (nicht primär Animation).`,
              },
            ]}
          />

          <section className="mt-12 border-t border-white/10 pt-8">
            <h2 className="mb-3 text-lg font-bold text-white">{studio.name} auf OtakuPulse</h2>
            <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-zinc-400">
              <p>{intro}</p>
              <p>
                Entdecke alle {result.totalDocs} Produktionen von {studio.name}, stöbere durch{' '}
                <Link href="/studio" className="text-accent hover:underline">
                  weitere Studios
                </Link>{' '}
                oder finde über die{' '}
                <Link href="/genre" className="text-accent hover:underline">
                  Genre-Übersicht
                </Link>{' '}
                ähnliche Titel. Mit dem{' '}
                <Link href="/kalender" className="text-accent hover:underline">
                  Simulcast-Kalender
                </Link>{' '}
                verpasst du keine neue Episode.
              </p>
            </div>
          </section>
        </>
      ) : null}

      <SeoFooter data={studio.footerText} vars={{ ...studioVars(studio), count: result.totalDocs }} maxW="max-w-6xl" />
    </main>
  )
}
