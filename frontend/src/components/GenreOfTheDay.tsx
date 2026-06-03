import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import { genreBlurb } from '@/lib/genre-info'

// Wählt deterministisch ein Genre pro Tag (gleicher Tag → gleiches Genre).
export async function GenreOfTheDay() {
  const payload = await getPayload({ config })
  const { docs, totalDocs } = await payload.find({ collection: 'genres', limit: 200, sort: 'name', depth: 0 })
  if (!docs.length) return null

  const now = new Date()
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86_400_000)
  const genre: any = docs[dayOfYear % docs.length]

  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-accent/10 to-accent-2/10 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-accent">Genre des Tages</p>
      <h3 className="mt-1 text-xl font-bold text-white">{genre.name}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">
        {genre.descriptionDe || genreBlurb(genre.slug, genre.name)}
      </p>
      <Link
        href={`/genre/${genre.slug}`}
        className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
      >
        Alle {genre.name}-Anime →
      </Link>
      <p className="mt-3 text-xs text-zinc-600">{totalDocs} Genres insgesamt</p>
    </div>
  )
}
