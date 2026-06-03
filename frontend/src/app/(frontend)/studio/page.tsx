import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Anime-Studios — OtakuPulse',
  description: 'Alle Animationsstudios: MAPPA, ufotable, Kyoto Animation, Madhouse und mehr.',
}

export default async function StudioListPage() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({
    collection: 'studios',
    where: { isAnimationStudio: { equals: true } },
    limit: 500,
    sort: 'name',
  })

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Studios</h1>
      <p className="mt-1 text-zinc-400">{docs.length} Animationsstudios</p>

      {docs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Noch keine Studios.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {docs.map((s: any) => (
            <Link
              key={s.id}
              href={`/studio/${s.slug}`}
              className="rounded-xl border border-white/10 bg-zinc-900/40 p-4 text-center transition hover:border-accent/40 hover:bg-zinc-900/80"
            >
              <span className="text-sm font-medium text-zinc-100">{s.name}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
