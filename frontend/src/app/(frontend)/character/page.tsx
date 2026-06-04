import { getPayload } from 'payload'
import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PortraitCard } from '@/components/PortraitCard'
import { Pagination } from '@/components/Pagination'
import { pageMeta } from '@/lib/seo'
import { displayName, localImage } from '@/lib/anime'

export const dynamic = 'force-dynamic'
const PER_PAGE = 42

const GENDERS = [
  { value: '', label: 'Alle' },
  { value: 'female', label: 'Weiblich' },
  { value: 'male', label: 'Männlich' },
  { value: 'non_binary', label: 'Divers' },
]

const SORTS: Record<string, { label: string; sort: string }> = {
  favorites: { label: 'Beliebtheit', sort: '-favorites' },
  name: { label: 'A–Z', sort: 'nameRomaji' },
  newest: { label: 'Neuste', sort: '-createdAt' },
}

type SP = { page?: string; q?: string; gender?: string; sort?: string }

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams
  const filtered = !!(sp.q || sp.gender)
  const meta = pageMeta({
    title: 'Anime-Charaktere — Datenbank, Suche & Synchronsprecher | OtakuPulse',
    description:
      'Durchstöbere und durchsuche tausende Anime-Charaktere — nach Beliebtheit, A–Z oder Geschlecht gefiltert, jeweils mit Synchronsprechern und Auftritten.',
    path: '/character',
  })
  // Gefilterte/durchsuchte Ansichten nicht indexieren (Duplicate Content).
  if (filtered) meta.robots = { index: false, follow: true }
  return meta
}

export default async function CharacterListPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const q = (sp.q || '').trim()
  const gender = sp.gender && GENDERS.some((g) => g.value === sp.gender) ? sp.gender : ''
  const sortKey = sp.sort && SORTS[sp.sort] ? sp.sort : 'favorites'

  const and: any[] = []
  if (q) {
    and.push({
      or: [
        { nameRomaji: { like: q } },
        { nameEnglish: { like: q } },
        { nameNative: { like: q } },
        { aliases: { like: q } },
      ],
    })
  }
  if (gender) and.push({ gender: { equals: gender } })
  const where: any = and.length ? { and } : {}

  const payload = await getPayload({ config })
  const isClean = !q && !gender && page === 1 && sortKey === 'favorites'

  const [result, highlight] = await Promise.all([
    payload.find({ collection: 'characters', where, sort: SORTS[sortKey].sort, limit: PER_PAGE, page, depth: 0 }),
    // Top-Highlight nur in der „cleanen" Standardansicht.
    isClean
      ? payload.find({ collection: 'characters', sort: '-favorites', limit: 7, depth: 0 })
      : Promise.resolve(null),
  ])

  // Highlight-IDs aus dem Hauptraster ausblenden, damit nichts doppelt erscheint.
  const highlightIds = new Set((highlight?.docs ?? []).map((c: any) => c.id))
  const gridDocs = highlight ? (result.docs as any[]).filter((c) => !highlightIds.has(c.id)) : (result.docs as any[])

  const queryForPagination = { q: q || undefined, gender: gender || undefined, sort: sortKey !== 'favorites' ? sortKey : undefined }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Charaktere</h1>
      <p className="mt-1 text-zinc-400">
        {result.totalDocs.toLocaleString('de-DE')} Charaktere
        {q ? <> · Suche „{q}"</> : null}
        {gender ? <> · {GENDERS.find((g) => g.value === gender)?.label}</> : null}
      </p>

      {/* Filterleiste */}
      <form method="get" className="mt-5 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs text-zinc-500">Suche</label>
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Name oder Alias …"
            className="w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Geschlecht</label>
          <select
            name="gender"
            defaultValue={gender}
            className="rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
          >
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Sortierung</label>
          <select
            name="sort"
            defaultValue={sortKey}
            className="rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
          >
            {Object.entries(SORTS).map(([key, s]) => (
              <option key={key} value={key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Anwenden
        </button>
        {q || gender || sortKey !== 'favorites' ? (
          <Link href="/character" className="px-2 py-2 text-sm text-zinc-400 hover:text-white">
            Zurücksetzen
          </Link>
        ) : null}
      </form>

      {/* Top-Charaktere-Highlight (nur Standardansicht) */}
      {highlight && highlight.docs.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent">Beliebteste Charaktere</h2>
          <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 md:grid-cols-7">
            {(highlight.docs as any[]).map((c) => (
              <PortraitCard
                key={c.id}
                href={`/character/${c.slug}`}
                imageUrl={localImage(c)}
                title={displayName(c)}
                subtitle={c.favorites ? `♥ ${c.favorites.toLocaleString('de-DE')}` : null}
              />
            ))}
          </div>
        </section>
      ) : null}

      {gridDocs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          {q || gender ? 'Keine Charaktere für diese Filter gefunden.' : 'Noch keine Charaktere.'}
        </div>
      ) : (
        <>
          {highlight ? <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-widest text-zinc-400">Alle Charaktere</h2> : null}
          <div className="mt-6 grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
            {gridDocs.map((c: any) => (
              <PortraitCard
                key={c.id}
                href={`/character/${c.slug}`}
                imageUrl={localImage(c)}
                title={displayName(c)}
                subtitle={c.favorites ? `♥ ${c.favorites.toLocaleString('de-DE')}` : null}
              />
            ))}
          </div>
        </>
      )}

      <Pagination basePath="/character" page={page} totalPages={result.totalPages} query={queryForPagination} />
    </main>
  )
}
