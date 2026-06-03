import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Streaming-Plattformen — OtakuPulse',
  description: 'Wo du Anime legal streamen kannst: Crunchyroll, Netflix, ADN und mehr.',
}

export default async function PlatformListPage() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'platforms', limit: 200, sort: 'name' })

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Streaming-Plattformen</h1>
      <p className="mt-1 text-zinc-400">{docs.length} Plattformen</p>

      {docs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Noch keine Plattformen erfasst.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {docs.map((p: any) => (
            <Link
              key={p.id}
              href={`/plattform/${p.slug}`}
              className="rounded-xl border border-white/10 bg-zinc-900/40 p-4 text-center transition hover:border-accent/40 hover:bg-zinc-900/80"
              style={p.color ? { borderColor: `${p.color}40` } : undefined}
            >
              <span className="text-sm font-medium text-zinc-100">{p.name}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
