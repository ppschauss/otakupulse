import { getPayload } from 'payload'
import config from '@payload-config'
import { ChipSection } from './HubSections'
import { seasonLabel } from '@/lib/anime'
import { STREAMING_PROVIDERS } from '@/lib/streaming'

// Async-Bereich der Startseite: Daten-getriebene Entdeckungs-Sektionen.
// Stats-Leiste (Autorität) + Genre-/Season-/Streaming-Chips (interne Verlinkung).
export async function HomeDiscover() {
  const payload = await getPayload({ config })

  const [anime, characters, persons, studios, genresCount, genres, seasons] = await Promise.all([
    payload.count({ collection: 'anime' }),
    payload.count({ collection: 'characters' }),
    payload.count({ collection: 'persons' }),
    payload.count({ collection: 'studios' }),
    payload.count({ collection: 'genres' }),
    payload.find({ collection: 'genres', sort: 'name', limit: 30, depth: 0 }),
    payload.find({ collection: 'anime-seasons', sort: '-year', limit: 12, depth: 0 }),
  ])

  const stats = [
    { n: anime.totalDocs, label: 'Anime' },
    { n: characters.totalDocs, label: 'Charaktere' },
    { n: persons.totalDocs, label: 'Personen' },
    { n: studios.totalDocs, label: 'Studios' },
    { n: genresCount.totalDocs, label: 'Genres' },
  ]

  const genreItems = (genres.docs as any[]).map((g) => ({ name: g.name as string, slug: g.slug as string })).filter((g) => g.slug)
  const seasonItems = (seasons.docs as any[])
    .map((s) => ({ name: s.season ? `${seasonLabel(s.season)} ${s.year}` : s.name, slug: s.slug as string }))
    .filter((s) => s.slug)
  const platformItems = STREAMING_PROVIDERS.slice(0, 10).map((p) => ({ name: p.name, slug: p.slug }))

  return (
    <>
      {/* Stats-Leiste */}
      <section className="mt-14 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-white/10 bg-zinc-900/40 p-4 text-center">
            <div className="text-2xl font-extrabold text-white">{s.n.toLocaleString('de-DE')}</div>
            <div className="mt-0.5 text-xs uppercase tracking-wide text-zinc-500">{s.label}</div>
          </div>
        ))}
      </section>

      <ChipSection title="Stöbern nach Genre" base="/genre" items={genreItems} />
      {seasonItems.length ? <ChipSection title="Nach Season & Jahr" base="/season" items={seasonItems} /> : null}
      <ChipSection title="Streaming-Plattformen" base="/plattform" items={platformItems} />
    </>
  )
}
