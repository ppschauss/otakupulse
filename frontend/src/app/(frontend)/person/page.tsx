import { getPayload } from 'payload'
import config from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PortraitCard } from '@/components/PortraitCard'
import { Pagination } from '@/components/Pagination'
import { pageMeta } from '@/lib/seo'
import { displayName, personRoleLabel, localImage } from '@/lib/anime'

export const dynamic = 'force-dynamic'
const PER_PAGE = 42

const ROLES = [
  { value: '', label: 'Alle Rollen' },
  { value: 'voice_actor', label: 'Synchronsprecher' },
  { value: 'director', label: 'Regie' },
  { value: 'writer', label: 'Drehbuch' },
  { value: 'mangaka', label: 'Mangaka' },
  { value: 'illustrator', label: 'Illustration' },
  { value: 'composer', label: 'Musik' },
  { value: 'producer', label: 'Produktion' },
]

const SORTS: Record<string, { label: string; sort: string }> = {
  favorites: { label: 'Beliebtheit', sort: '-favorites' },
  name: { label: 'A–Z', sort: 'nameRomaji' },
  newest: { label: 'Neuste', sort: '-createdAt' },
}

type SP = { page?: string; q?: string; role?: string; sort?: string }

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams
  const filtered = !!(sp.q || sp.role)
  const meta = pageMeta({
    title: 'Personen — Synchronsprecher, Regie & Staff | OtakuPulse',
    description:
      'Durchsuche Synchronsprecher, Regisseure, Mangaka und Komponisten der Anime-Branche — nach Beliebtheit, A–Z oder Rolle gefiltert.',
    path: '/person',
  })
  if (filtered) meta.robots = { index: false, follow: true }
  return meta
}

export default async function PersonListPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const q = (sp.q || '').trim()
  const role = sp.role && ROLES.some((r) => r.value === sp.role) ? sp.role : ''
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
  if (role) and.push({ roles: { in: [role] } })
  const where: any = and.length ? { and } : {}

  const payload = await getPayload({ config })
  const isClean = !q && !role && page === 1 && sortKey === 'favorites'

  const [result, highlight] = await Promise.all([
    payload.find({ collection: 'persons', where, sort: SORTS[sortKey].sort, limit: PER_PAGE, page, depth: 0 }),
    isClean
      ? payload.find({ collection: 'persons', sort: '-favorites', limit: 7, depth: 0 })
      : Promise.resolve(null),
  ])

  const highlightIds = new Set((highlight?.docs ?? []).map((p: any) => p.id))
  const gridDocs = highlight ? (result.docs as any[]).filter((p) => !highlightIds.has(p.id)) : (result.docs as any[])

  const queryForPagination = {
    q: q || undefined,
    role: role || undefined,
    sort: sortKey !== 'favorites' ? sortKey : undefined,
  }

  const cardSubtitle = (p: any) => (Array.isArray(p.roles) && p.roles.length ? personRoleLabel(p.roles[0]) : null)

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Personen</h1>
      <p className="mt-1 text-zinc-400">
        {result.totalDocs.toLocaleString('de-DE')} Personen
        {q ? <> · Suche „{q}"</> : null}
        {role ? <> · {ROLES.find((r) => r.value === role)?.label}</> : null}
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
          <label className="mb-1 block text-xs text-zinc-500">Rolle</label>
          <select
            name="role"
            defaultValue={role}
            className="rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
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
        {q || role || sortKey !== 'favorites' ? (
          <Link href="/person" className="px-2 py-2 text-sm text-zinc-400 hover:text-white">
            Zurücksetzen
          </Link>
        ) : null}
      </form>

      {/* Top-Personen-Highlight (nur Standardansicht) */}
      {highlight && highlight.docs.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent">Bekannteste Personen</h2>
          <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 md:grid-cols-7">
            {(highlight.docs as any[]).map((p) => (
              <PortraitCard
                key={p.id}
                href={`/person/${p.slug}`}
                imageUrl={localImage(p)}
                title={displayName(p)}
                subtitle={cardSubtitle(p)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {gridDocs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          {q || role ? 'Keine Personen für diese Filter gefunden.' : 'Noch keine Personen.'}
        </div>
      ) : (
        <>
          {highlight ? <h2 className="mt-10 mb-3 text-sm font-semibold uppercase tracking-widest text-zinc-400">Alle Personen</h2> : null}
          <div className="mt-6 grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
            {gridDocs.map((p: any) => (
              <PortraitCard
                key={p.id}
                href={`/person/${p.slug}`}
                imageUrl={localImage(p)}
                title={displayName(p)}
                subtitle={cardSubtitle(p)}
              />
            ))}
          </div>
        </>
      )}

      <Pagination basePath="/person" page={page} totalPages={result.totalPages} query={queryForPagination} />
    </main>
  )
}
