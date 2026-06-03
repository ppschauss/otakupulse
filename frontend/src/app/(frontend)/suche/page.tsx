import { getPayload } from 'payload'
import config from '@payload-config'
import { AnimeCard } from '@/components/AnimeCard'
import { Pagination } from '@/components/Pagination'
import { FORMAT_LABELS, STATUS_LABELS } from '@/lib/anime'

export const dynamic = 'force-dynamic'
const PER_PAGE = 36

export const metadata = {
  title: 'Anime-Suche & Filter — OtakuPulse',
  description: 'Durchsuche die Anime-Datenbank nach Titel, Genre, Status, Format und Jahr.',
}

const SORTS: Record<string, { label: string; sort: string }> = {
  popularity: { label: 'Beliebtheit', sort: '-popularity' },
  score: { label: 'Bewertung', sort: '-averageScore' },
  newest: { label: 'Neuste zuerst', sort: '-createdAt' },
  title: { label: 'Titel (A–Z)', sort: 'titleRomaji' },
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    genre?: string
    status?: string
    format?: string
    year?: string
    sort?: string
    page?: string
  }>
}) {
  const sp = await searchParams
  const q = (sp.q || '').trim()
  const genre = sp.genre || ''
  const status = sp.status || ''
  const format = sp.format || ''
  const year = sp.year || ''
  const sortKey = sp.sort && SORTS[sp.sort] ? sp.sort : 'popularity'
  const page = Math.max(1, Number(sp.page) || 1)

  const hasQuery = Boolean(q || genre || status || format || year)

  const payload = await getPayload({ config })
  const genreList = await payload.find({ collection: 'genres', limit: 300, sort: 'name', depth: 0 })
  const genreId = genre ? (genreList.docs.find((g: any) => g.slug === genre) as any)?.id : undefined

  const and: any[] = []
  if (q) {
    and.push({
      or: [
        { titleRomaji: { like: q } },
        { titleEnglish: { like: q } },
        { titleNative: { like: q } },
        { titleGerman: { like: q } },
      ],
    })
  }
  if (genreId) and.push({ genres: { in: [genreId] } })
  if (status) and.push({ status: { equals: status } })
  if (format) and.push({ format: { equals: format } })
  if (year) and.push({ seasonYear: { equals: Number(year) } })

  const result = hasQuery
    ? await payload.find({
        collection: 'anime',
        where: and.length ? { and } : {},
        sort: SORTS[sortKey].sort,
        limit: PER_PAGE,
        page,
        depth: 0,
      })
    : null

  const inputCls =
    'w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Suche & Filter</h1>

      <form method="get" action="/suche" className="mt-6 rounded-xl border border-white/10 bg-zinc-900/40 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs text-zinc-500">Titel</label>
            <input type="text" name="q" defaultValue={q} placeholder="z.B. One Piece" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Genre</label>
            <select name="genre" defaultValue={genre} className={inputCls}>
              <option value="">Alle Genres</option>
              {genreList.docs.map((g: any) => (
                <option key={g.id} value={g.slug}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Status</label>
            <select name="status" defaultValue={status} className={inputCls}>
              <option value="">Alle</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Format</label>
            <select name="format" defaultValue={format} className={inputCls}>
              <option value="">Alle</option>
              {Object.entries(FORMAT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Jahr</label>
              <input type="number" name="year" defaultValue={year} placeholder="2026" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Sortierung</label>
              <select name="sort" defaultValue={sortKey} className={inputCls}>
                {Object.entries(SORTS).map(([key, { label }]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-gradient-to-r from-accent to-accent-2 px-6 py-2 text-sm font-semibold text-white"
          >
            Suchen
          </button>
          {hasQuery ? (
            <a href="/suche" className="text-sm text-zinc-400 hover:text-accent">
              Filter zurücksetzen
            </a>
          ) : null}
        </div>
      </form>

      {result ? (
        <>
          <p className="mt-6 text-zinc-400">
            {result.totalDocs} {result.totalDocs === 1 ? 'Treffer' : 'Treffer'}
          </p>
          {result.docs.length === 0 ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
              Keine Anime gefunden. Tipp: Bei unbekannten Titeln kannst du direkt{' '}
              <span className="text-zinc-300">/anime/&lt;titel&gt;</span> aufrufen — fehlende Titel werden live importiert.
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {result.docs.map((a: any) => (
                <AnimeCard key={a.id} anime={a} />
              ))}
            </div>
          )}
          <Pagination
            basePath="/suche"
            page={page}
            totalPages={result.totalPages}
            query={{ q, genre, status, format, year, sort: sortKey }}
          />
        </>
      ) : (
        <p className="mt-8 text-zinc-500">Gib einen Suchbegriff ein oder kombiniere die Filter oben.</p>
      )}
    </main>
  )
}
