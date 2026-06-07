import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import type { Metadata } from 'next'
import { RankedList } from '@/components/RankedList'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Faq } from '@/components/Faq'
import { JsonLd } from '@/components/JsonLd'
import { pageMetaFor } from '@/lib/pageContent'
import { PageSeoFooter } from '@/components/SeoFooter'
import { displayTitle } from '@/lib/anime'
import { url } from '@/lib/site'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return await pageMetaFor('top-anime', {
    title: 'Die besten Anime aller Zeiten — Top-Ranking | OtakuPulse',
    description:
      'Die besten Anime aller Zeiten im Ranking – nach Community-Bewertung sortiert. Top-Anime nach Genre (Action, Fantasy, Romance …) und nach Jahr filtern.',
    path: '/top-anime',
  })
}

const POPULAR_GENRES = [
  'action', 'adventure', 'comedy', 'drama', 'fantasy', 'romance',
  'sci-fi', 'slice-of-life', 'mystery', 'supernatural', 'horror', 'sports',
]
const YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019]

export default async function TopAnimePage() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'anime',
    where: { averageScore: { greater_than: 0 } },
    sort: '-averageScore',
    limit: 50,
    depth: 0,
  })

  const top = docs as any[]
  const number1 = top[0] ? displayTitle(top[0]) : null

  const faqItems = [
    {
      q: 'Wie wird das Ranking der besten Anime berechnet?',
      a: 'Die Liste sortiert alle Anime nach ihrem Community-Score (durchschnittliche Bewertung). Je höher die Durchschnittsbewertung, desto weiter oben steht ein Titel – das Ranking aktualisiert sich automatisch mit neuen Bewertungen.',
    },
    {
      q: 'Welcher Anime gilt aktuell als der beste?',
      a: number1
        ? `Aktuell führt „${number1}" das OtakuPulse-Ranking nach Community-Bewertung an. Die Top-Plätze ändern sich, sobald neue Wertungen einfließen.`
        : 'Die Spitzenposition geht an den Titel mit der höchsten Durchschnittsbewertung und ändert sich mit neuen Wertungen.',
    },
    {
      q: 'Kann ich die besten Anime nach Genre filtern?',
      a: 'Ja. Über die Genre-Links findest du eigene Bestenlisten – z. B. die besten Action-, Fantasy- oder Romance-Anime. Zusätzlich gibt es Ranglisten pro Jahr.',
    },
    {
      q: 'Werden auch aktuelle und laufende Anime berücksichtigt?',
      a: 'Ja, sobald ein Titel genug Bewertungen hat, taucht er im Ranking auf – egal ob Klassiker oder aktuelle Simulcast-Season. Den Überblick über neue Episoden gibt der Simulcast-Kalender.',
    },
  ]

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Die besten Anime aller Zeiten',
    itemListElement: top.slice(0, 25).map((a, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: url(`/anime/${a.slug}`),
      name: displayTitle(a),
    })),
  }

  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-10">
        <Breadcrumbs items={[{ name: 'Start', path: '/' }, { name: 'Top-Anime', path: '/top-anime' }]} />
        <h1 className="text-3xl font-extrabold text-white sm:text-4xl">Die besten Anime aller Zeiten</h1>
        <p className="mt-3 max-w-3xl leading-relaxed text-zinc-300">
          Das OtakuPulse-Ranking der bestbewerteten Anime – sortiert nach Community-Score. Von zeitlosen Klassikern bis
          zu aktuellen Highlights: Hier findest du die <strong className="text-white">Top 50</strong> auf einen Blick und
          kannst die Bestenlisten gezielt nach{' '}
          <Link href="/genre" className="text-accent hover:underline">
            Genre
          </Link>{' '}
          und Jahr eingrenzen.
        </p>

        <div className="mt-8">
          <RankedList items={top} />
        </div>

        <section className="mt-12">
          <h2 className="mb-3 text-lg font-bold text-white">Beste Anime nach Genre</h2>
          <div className="flex flex-wrap gap-2">
            {POPULAR_GENRES.map((g) => (
              <Link
                key={g}
                href={`/top-anime/${g}`}
                className="rounded-full bg-white/5 px-4 py-1.5 text-sm capitalize text-zinc-200 ring-1 ring-white/10 transition hover:bg-accent hover:text-white hover:ring-accent"
              >
                Top {g.replace(/-/g, ' ')}
              </Link>
            ))}
          </div>

          <h2 className="mb-3 mt-8 text-lg font-bold text-white">Beste Anime nach Jahr</h2>
          <div className="flex flex-wrap gap-2">
            {YEARS.map((y) => (
              <Link
                key={y}
                href={`/top-anime/${y}`}
                className="rounded-full bg-white/5 px-4 py-1.5 text-sm text-zinc-200 ring-1 ring-white/10 transition hover:bg-accent hover:text-white hover:ring-accent"
              >
                Beste Anime {y}
              </Link>
            ))}
          </div>
        </section>

        <Faq items={faqItems} title="Häufige Fragen zu den besten Anime" />

        <JsonLd data={itemListLd} />
      </main>
      <PageSeoFooter pageKey="top-anime" vars={{ count: top.length }} maxW="max-w-4xl" />
    </>
  )
}
