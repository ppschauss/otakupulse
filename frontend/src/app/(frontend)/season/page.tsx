import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import { seasonLabel } from '@/lib/anime'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Anime-Seasons — OtakuPulse',
  description: 'Alle Anime-Seasons im Archiv — von den aktuellen Simulcasts bis zu vergangenen Jahren.',
}

export default async function SeasonListPage() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'anime-seasons', limit: 500, sort: '-year' })

  // Nach Jahr gruppieren
  const byYear = new Map<number, any[]>()
  for (const s of docs as any[]) {
    const y = s.year ?? 0
    if (!byYear.has(y)) byYear.set(y, [])
    byYear.get(y)!.push(s)
  }
  const years = [...byYear.keys()].sort((a, b) => b - a)
  const order: Record<string, number> = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Seasons</h1>
      <p className="mt-1 text-zinc-400">{docs.length} Seasons</p>

      {docs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Noch keine Seasons.
        </div>
      ) : (
        <div className="mt-8 space-y-8">
          {years.map((year) => (
            <section key={year}>
              <h2 className="mb-3 text-lg font-bold text-white">{year}</h2>
              <div className="flex flex-wrap gap-3">
                {byYear
                  .get(year)!
                  .sort((a, b) => (order[a.season] ?? 9) - (order[b.season] ?? 9))
                  .map((s: any) => (
                    <Link
                      key={s.id}
                      href={`/season/${s.slug}`}
                      className="rounded-lg border border-white/10 bg-zinc-900/40 px-4 py-2 text-sm text-zinc-200 transition hover:border-accent/40 hover:text-white"
                    >
                      {seasonLabel(s.season) || s.name}
                    </Link>
                  ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  )
}
