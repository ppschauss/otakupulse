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
import { seasonLabel } from '@/lib/anime'

export const dynamic = 'force-dynamic'
const PER_PAGE = 36

async function getSeason(slug: string) {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'anime-seasons', where: { slug: { equals: slug } }, limit: 1, depth: 0 })
  return docs[0] as any
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const s = await getSeason(slug)
  if (!s) return {}
  const label = `${seasonLabel(s.season)} ${s.year}`
  return pageMeta({
    title: s.seoTitle || `Anime ${label} — alle Titel der Season | OtakuPulse`,
    description: s.seoDescription || (s.descriptionDe ? s.descriptionDe.slice(0, 160) : `Alle Anime der Season ${label} — beliebteste Titel, Genres und Studios.`),
    path: `/season/${slug}`,
  })
}

export default async function SeasonDetail({
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

  const season = await getSeason(slug)
  if (!season) notFound()

  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'anime',
    where: { animeSeason: { equals: season.id } },
    sort: '-popularity',
    limit: PER_PAGE,
    page,
    depth: 0,
  })

  const label = `${seasonLabel(season.season)} ${season.year}`
  const intro =
    season.descriptionDe ||
    `Alle Anime der Season ${label} im Überblick — von den meistdiskutierten Simulcasts bis zu den Geheimtipps, sortiert nach Beliebtheit.`

  const extras = isFirst ? await hubExtras(payload, { animeSeason: { equals: season.id } }) : null
  const otherSeasons = isFirst
    ? (await payload.find({ collection: 'anime-seasons', where: { slug: { not_equals: slug } }, sort: '-year', limit: 16, depth: 0 })).docs.map(
        (s: any) => ({ name: `${seasonLabel(s.season)} ${s.year}`, slug: s.slug }),
      )
    : []

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Seasons', path: '/season' },
          { name: label, path: `/season/${slug}` },
        ]}
      />
      <p className="text-sm font-semibold uppercase tracking-widest text-accent">Season</p>
      <h1 className="mt-1 text-3xl font-extrabold text-white">Anime {label}</h1>
      <p className="mt-1 text-zinc-400">{result.totalDocs} Titel</p>

      <p className="mt-4 max-w-3xl leading-relaxed text-zinc-300">{intro}</p>

      <h2 className="mt-10 text-xl font-bold text-white">Anime der Season {label}</h2>
      {result.docs.length === 0 ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Noch keine Anime in dieser Season.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {result.docs.map((a: any) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </div>
      )}

      <Pagination basePath={`/season/${slug}`} page={page} totalPages={result.totalPages} />

      {isFirst && extras ? (
        <>
          <ChipSection title={`Genres in ${label}`} base="/genre" items={extras.topGenres} withCount />
          <ChipSection title={`Studios in ${label}`} base="/studio" items={extras.topStudios} withCount />
          <NewsSection title={`News zur Season ${label}`} entity={`Anime aus ${label}`} items={extras.news} />
          <ChipSection title="Weitere Seasons" base="/season" items={otherSeasons as any} />

          <Faq
            title={`Häufige Fragen zur Season ${label}`}
            items={[
              {
                q: `Welche Anime laufen in ${label}?`,
                a: `In ${label} sind ${result.totalDocs} Anime erfasst, oben nach Beliebtheit sortiert.`,
              },
              {
                q: `Welche Genres prägen ${label}?`,
                a:
                  extras.topGenres.length > 0
                    ? `Die Season ${label} ist v. a. von ${extras.topGenres.slice(0, 5).map((g) => g.name).join(', ')} geprägt.`
                    : `Die Genres findest du auf den Anime-Detailseiten.`,
              },
              {
                q: `Wann erscheinen die Episoden?`,
                a: `Die Ausstrahlungstermine laufender Titel findest du im Simulcast-Kalender.`,
              },
            ]}
          />

          <section className="mt-12 border-t border-white/10 pt-8">
            <h2 className="mb-3 text-lg font-bold text-white">Anime-Season {label}</h2>
            <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-zinc-400">
              <p>{intro}</p>
              <p>
                Stöbere durch{' '}
                <Link href="/season" className="text-accent hover:underline">
                  weitere Seasons
                </Link>
                , entdecke die{' '}
                <Link href="/genre" className="text-accent hover:underline">
                  Genres
                </Link>{' '}
                dieser Season und verfolge laufende Titel im{' '}
                <Link href="/kalender" className="text-accent hover:underline">
                  Simulcast-Kalender
                </Link>
                .
              </p>
            </div>
          </section>
        </>
      ) : null}
    </main>
  )
}
