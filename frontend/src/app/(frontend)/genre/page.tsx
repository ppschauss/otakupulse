import { getPayload } from 'payload'
import config from '@payload-config'
import { Chip } from '@/components/Chip'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Anime-Genres — OtakuPulse',
  description: 'Alle Anime-Genres im Überblick: Action, Isekai, Romance, Mecha und mehr.',
}

export default async function GenreListPage() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'genres', limit: 300, sort: 'name' })

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Genres</h1>
      <p className="mt-1 text-zinc-400">{docs.length} Genres</p>

      {docs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Noch keine Genres.
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap gap-3">
          {docs.map((g: any) => (
            <Chip key={g.id} href={`/genre/${g.slug}`}>
              {g.name}
            </Chip>
          ))}
        </div>
      )}
    </main>
  )
}
