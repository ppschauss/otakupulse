import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import { RankedList } from '@/components/RankedList'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { pageMeta } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export function generateMetadata() {
  return pageMeta({
    title: 'Die besten Anime aller Zeiten — Top-Ranking | OtakuPulse',
    description: 'Das OtakuPulse-Ranking der bestbewerteten Anime — nach Community-Score sortiert.',
    path: '/top-anime',
  })
}

const POPULAR_GENRES = ['action', 'drama', 'comedy', 'fantasy', 'romance', 'adventure']
const YEARS = [2026, 2025, 2024, 2023, 2022, 2021, 2020]

export default async function TopAnimePage() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'anime',
    where: { averageScore: { greater_than: 0 } },
    sort: '-averageScore',
    limit: 50,
    depth: 0,
  })

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Breadcrumbs items={[{ name: 'Start', path: '/' }, { name: 'Top-Anime', path: '/top-anime' }]} />
      <h1 className="text-3xl font-extrabold text-white">Die besten Anime</h1>
      <p className="mt-1 text-zinc-400">Top 50 nach Community-Bewertung</p>

      <div className="mt-6">
        <RankedList items={docs} />
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-bold text-white">Nach Genre</h2>
        <div className="flex flex-wrap gap-2">
          {POPULAR_GENRES.map((g) => (
            <Link
              key={g}
              href={`/top-anime/${g}`}
              className="rounded-full bg-white/5 px-4 py-1.5 text-sm capitalize text-zinc-200 ring-1 ring-white/10 transition hover:text-accent"
            >
              Top {g}
            </Link>
          ))}
        </div>
        <h2 className="mb-3 mt-6 text-lg font-bold text-white">Nach Jahr</h2>
        <div className="flex flex-wrap gap-2">
          {YEARS.map((y) => (
            <Link
              key={y}
              href={`/top-anime/${y}`}
              className="rounded-full bg-white/5 px-4 py-1.5 text-sm text-zinc-200 ring-1 ring-white/10 transition hover:text-accent"
            >
              Beste Anime {y}
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
