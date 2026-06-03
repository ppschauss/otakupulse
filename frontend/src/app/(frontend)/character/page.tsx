import { getPayload } from 'payload'
import config from '@payload-config'
import { PortraitCard } from '@/components/PortraitCard'
import { Pagination } from '@/components/Pagination'
import { displayName, localImage } from '@/lib/anime'

export const dynamic = 'force-dynamic'
const PER_PAGE = 42

export const metadata = {
  title: 'Anime-Charaktere — OtakuPulse',
  description: 'Die beliebtesten Anime-Charaktere — mit Synchronsprechern und Auftritten.',
}

export default async function CharacterListPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)

  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'characters',
    sort: '-favorites',
    limit: PER_PAGE,
    page,
    depth: 0,
  })

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Charaktere</h1>
      <p className="mt-1 text-zinc-400">{result.totalDocs} Charaktere · beliebteste zuerst</p>

      {result.docs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Noch keine Charaktere.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
          {result.docs.map((c: any) => (
            <PortraitCard
              key={c.id}
              href={`/character/${c.slug}`}
              imageUrl={localImage(c)}
              title={displayName(c)}
              subtitle={c.favorites ? `♥ ${c.favorites.toLocaleString('de-DE')}` : null}
            />
          ))}
        </div>
      )}

      <Pagination basePath="/character" page={page} totalPages={result.totalPages} />
    </main>
  )
}
