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
import { pageMeta } from '@/lib/seo'
import { hubExtras } from '@/lib/hub'

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
    title: s.seoTitle || `${s.name} — Anime des Studios & Produktionen | OtakuPulse`,
    description: s.seoDescription || (s.descriptionDe ? s.descriptionDe.slice(0, 160) : `Alle Anime-Produktionen von ${s.name} im Überblick.`),
    path: `/studio/${slug}`,
    image: s.logoUrl,
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

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Studios', path: '/studio' },
          { name: studio.name, path: `/studio/${slug}` },
        ]}
      />
      <p className="text-sm font-semibold uppercase tracking-widest text-accent">Studio</p>
      <h1 className="mt-1 text-3xl font-extrabold text-white">{studio.name}</h1>
      <p className="mt-1 text-zinc-400">{result.totalDocs} Anime</p>

      <p className="mt-4 max-w-3xl leading-relaxed text-zinc-300">{intro}</p>
      {studio.website ? (
        <a href={studio.website} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-accent hover:underline">
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
    </main>
  )
}
