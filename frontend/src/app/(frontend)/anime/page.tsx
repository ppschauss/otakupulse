import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import { AnimeCard } from '@/components/AnimeCard'

export const dynamic = 'force-dynamic'

const PER_PAGE = 36

export default async function AnimeListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'anime',
    limit: PER_PAGE,
    page,
    sort: '-popularity',
    depth: 0,
  })

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Anime-Datenbank</h1>
      <p className="mt-1 text-zinc-400">{result.totalDocs} Titel</p>

      {result.docs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Noch keine Daten.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {result.docs.map((a: any) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </div>
      )}

      {/* Paginierung */}
      {result.totalPages > 1 ? (
        <nav className="mt-10 flex items-center justify-center gap-3 text-sm">
          {result.hasPrevPage ? (
            <Link href={`/anime?page=${page - 1}`} className="rounded-md border border-white/10 px-4 py-2 hover:bg-white/5">
              ← Zurück
            </Link>
          ) : null}
          <span className="text-zinc-500">
            Seite {page} / {result.totalPages}
          </span>
          {result.hasNextPage ? (
            <Link href={`/anime?page=${page + 1}`} className="rounded-md border border-white/10 px-4 py-2 hover:bg-white/5">
              Weiter →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </main>
  )
}
