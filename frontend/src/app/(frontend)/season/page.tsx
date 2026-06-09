import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import type { Metadata } from 'next'
import { seasonLabel } from '@/lib/anime'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Faq } from '@/components/Faq'
import { JsonLd } from '@/components/JsonLd'
import { pageMetaFor } from '@/lib/pageContent'
import { PageSeoFooter } from '@/components/SeoFooter'
import { url } from '@/lib/site'

export const dynamic = 'force-dynamic'

const SEASON_ORDER: Record<string, number> = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 }
const MONTH_TO_SEASON = ['WINTER', 'WINTER', 'WINTER', 'SPRING', 'SPRING', 'SPRING', 'SUMMER', 'SUMMER', 'SUMMER', 'FALL', 'FALL', 'FALL']

export async function generateMetadata(): Promise<Metadata> {
  return pageMetaFor('season', {
    title: 'Anime-Seasons: alle Jahre & Quartale im Archiv | OtakuPulse',
    description:
      'Alle Anime-Seasons im Überblick — Winter, Frühling, Sommer, Herbst. Von der aktuellen Simulcast-Season bis zum Archiv vergangener Jahre, mit Titeln je Season.',
    path: '/season',
  })
}

export default async function SeasonListPage() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'anime-seasons', limit: 500, sort: '-year' })

  const now = new Date()
  const currentSlug = `${MONTH_TO_SEASON[now.getMonth()].toLowerCase()}-${now.getFullYear()}`
  const current = (docs as any[]).find((s) => s.slug === currentSlug)

  const byYear = new Map<number, any[]>()
  for (const s of docs as any[]) {
    const y = s.year ?? 0
    if (!byYear.has(y)) byYear.set(y, [])
    byYear.get(y)!.push(s)
  }
  const years = [...byYear.keys()].sort((a, b) => b - a)

  return (
    <>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Breadcrumbs items={[{ name: 'Start', path: '/' }, { name: 'Seasons', path: '/season' }]} />
        <h1 className="text-3xl font-extrabold text-white sm:text-4xl">Anime-Seasons</h1>
        <p className="mt-3 max-w-3xl leading-relaxed text-zinc-300">
          Anime erscheinen quartalsweise in vier Seasons: <strong className="text-white">Winter, Frühling, Sommer und
          Herbst</strong>. Hier findest du jede Season mit ihren Titeln — von der aktuellen{' '}
          <Link href="/kalender" className="text-accent hover:underline">Simulcast-Season</Link> bis ins Archiv
          vergangener Jahre. Insgesamt {docs.length} Seasons.
        </p>

        {current ? (
          <Link
            href={`/season/${current.slug}`}
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:bg-accent/90"
          >
            ▶ Aktuelle Season: {seasonLabel(current.season)} {current.year}
          </Link>
        ) : null}

        {docs.length === 0 ? (
          <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
            Noch keine Seasons.
          </div>
        ) : (
          <div className="mt-10 space-y-8">
            {years.map((year) => (
              <section key={year}>
                <h2 className="mb-3 text-lg font-bold text-white">{year}</h2>
                <div className="flex flex-wrap gap-3">
                  {byYear
                    .get(year)!
                    .sort((a, b) => (SEASON_ORDER[a.season] ?? 9) - (SEASON_ORDER[b.season] ?? 9))
                    .map((s: any) => {
                      const active = s.slug === currentSlug
                      return (
                        <Link
                          key={s.id}
                          href={`/season/${s.slug}`}
                          className={`rounded-lg border px-4 py-2 text-sm transition ${
                            active
                              ? 'border-accent bg-accent/15 text-white'
                              : 'border-white/10 bg-zinc-900/40 text-zinc-200 hover:border-accent/40 hover:text-white'
                          }`}
                        >
                          {seasonLabel(s.season) || s.name}
                        </Link>
                      )
                    })}
                </div>
              </section>
            ))}
          </div>
        )}

        <Faq
          title="Häufige Fragen zu Anime-Seasons"
          items={[
            {
              q: 'Was ist eine Anime-Season?',
              a: 'Anime werden in vier Jahres-Quartalen veröffentlicht: Winter (Januar–März), Frühling (April–Juni), Sommer (Juli–September) und Herbst (Oktober–Dezember). Jede Season bringt neue Titel sowie Fortsetzungen bestehender Serien.',
            },
            {
              q: 'Welche Anime laufen in der aktuellen Season?',
              a: 'Die aktuelle Season ist oben hervorgehoben. Welche Episoden wann erscheinen, zeigt zusätzlich der Simulcast-Kalender.',
            },
            {
              q: 'Wann startet die nächste Anime-Season?',
              a: 'Zum jeweiligen Quartalswechsel — also Anfang Januar, April, Juli und Oktober. Ankündigungen tauchen vorab in den News auf.',
            },
          ]}
        />

        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'Anime-Seasons',
            itemListElement: (docs as any[]).slice(0, 24).map((s, i) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: url(`/season/${s.slug}`),
              name: `${seasonLabel(s.season) || s.name} ${s.year ?? ''}`.trim(),
            })),
          }}
        />
      </main>
      <PageSeoFooter pageKey="season" vars={{ count: docs.length }} maxW="max-w-5xl" />
    </>
  )
}
