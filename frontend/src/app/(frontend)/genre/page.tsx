import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { Chip } from '@/components/Chip'
import { Faq } from '@/components/Faq'
import { JsonLd } from '@/components/JsonLd'
import { pageMetaFor } from '@/lib/pageContent'
import { PageSeoFooter } from '@/components/SeoFooter'
import { url } from '@/lib/site'

export const dynamic = 'force-dynamic'

type SP = { sort?: string }

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  await searchParams
  const payload = await getPayload({ config })
  const count = await payload.count({ collection: 'genres' })
  return pageMetaFor(
    'genre',
    {
      title: 'Anime-Genres — alle Genres mit Anzahl & Ranking | OtakuPulse',
      description:
        'Alle Anime-Genres im Überblick: Action, Isekai, Romance, Mecha und mehr — mit Anzahl der Titel und den größten Genres auf einen Blick.',
      path: '/genre',
    },
    { count: count.totalDocs },
  )
}

export default async function GenreListPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const sortKey = sp.sort === 'name' ? 'name' : 'count'

  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'genres', limit: 300, sort: 'name', depth: 0 })

  // Anime-Anzahl pro Genre (eine Aggregation).
  const pool = (payload.db as any).pool
  const { rows } = await pool.query(
    `SELECT genres_id AS id, count(*)::int AS n FROM anime_rels WHERE genres_id IS NOT NULL GROUP BY genres_id`,
  )
  const countById = new Map<number, number>(rows.map((r: any) => [r.id, r.n]))

  const enriched = (docs as any[]).map((g) => ({ ...g, n: countById.get(g.id) ?? 0 }))
  const top = [...enriched].sort((a, b) => b.n - a.n).slice(0, 8)
  const list =
    sortKey === 'name'
      ? [...enriched].sort((a, b) => a.name.localeCompare(b.name, 'de'))
      : [...enriched].sort((a, b) => b.n - a.n)

  return (
    <>
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Genres</h1>
      <p className="mt-1 text-zinc-400">{docs.length} Genres · von Action bis Slice of Life</p>

      {docs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Noch keine Genres.
        </div>
      ) : (
        <>
          {/* Top-Genres-Highlight */}
          {top.length > 0 && top[0].n > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-accent">Größte Genres</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {top.map((g) => (
                  <Link
                    key={g.id}
                    href={`/genre/${g.slug}`}
                    className="group relative overflow-hidden rounded-xl border border-white/10 bg-zinc-900/60 p-4 transition hover:border-accent/40"
                  >
                    {g.imageUrl ? (
                      <Image
                        src={g.imageUrl}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                        className="object-cover opacity-20 transition group-hover:opacity-30"
                      />
                    ) : (
                      <span className="absolute inset-0 bg-gradient-to-br from-accent/20 to-accent-2/20" aria-hidden />
                    )}
                    <span className="relative block text-base font-bold text-white">{g.name}</span>
                    <span className="relative mt-1 block text-xs text-zinc-300">
                      {g.n.toLocaleString('de-DE')} Anime
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {/* Sortierung */}
          <div className="mt-10 flex items-center gap-2 text-sm">
            <span className="text-zinc-500">Sortieren:</span>
            <Link
              href="/genre"
              className={`rounded-lg border px-3 py-1.5 transition ${
                sortKey === 'count' ? 'border-accent bg-accent/15 text-white' : 'border-white/10 text-zinc-400 hover:text-white'
              }`}
            >
              Beliebtheit
            </Link>
            <Link
              href="/genre?sort=name"
              className={`rounded-lg border px-3 py-1.5 transition ${
                sortKey === 'name' ? 'border-accent bg-accent/15 text-white' : 'border-white/10 text-zinc-400 hover:text-white'
              }`}
            >
              A–Z
            </Link>
          </div>

          {/* Volle Liste */}
          <div className="mt-5 flex flex-wrap gap-3">
            {list.map((g) => (
              <Chip key={g.id} href={`/genre/${g.slug}`} count={g.n || undefined}>
                {g.name}
              </Chip>
            ))}
          </div>

          {/* SEO-Intro */}
          <section className="mt-12 border-t border-white/10 pt-8">
            <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-zinc-400">
              <p>
                Genres sind der schnellste Weg in die Anime-Datenbank: Ob actiongeladene Shōnen-Abenteuer, romantische
                Slice-of-Life-Serien, düstere Psycho-Thriller oder fantasievolle Isekai-Welten — über die Genre-Seiten
                findest du die passenden Titel, sortiert nach Beliebtheit, mit Top-Studios und thematischen Tags.
              </p>
              <p>
                Noch spezifischer wird&apos;s über die{' '}
                <Link href="/tag" className="text-accent hover:underline">
                  thematischen Tags
                </Link>{' '}
                oder die{' '}
                <Link href="/suche" className="text-accent hover:underline">
                  Suche
                </Link>
                , in der sich Genre, Jahr, Typ und Sprachfassung frei kombinieren lassen.
              </p>
            </div>
          </section>

          <Faq
            title="Häufige Fragen zu Anime-Genres"
            items={[
              {
                q: 'Welche Anime-Genres gibt es?',
                a: `OtakuPulse listet ${docs.length} Genres – von Action, Adventure, Comedy und Drama über Fantasy, Romance, Sci-Fi und Slice of Life bis zu Mecha, Mystery, Horror und Sports. Jedes Genre hat eine eigene Seite mit Bestenliste und Beschreibung.`,
              },
              {
                q: 'Was ist der Unterschied zwischen Genre und Tag?',
                a: 'Genres sind grobe Kategorien (z. B. Action, Fantasy). Tags beschreiben feinere Themen und Settings (z. B. Isekai, Time Travel, Schule). Über die Tag-Übersicht lässt sich noch gezielter filtern.',
              },
              {
                q: 'Welches ist das größte Anime-Genre?',
                a:
                  top[0] && top[0].n > 0
                    ? `Das größte Genre ist aktuell ${top[0].name} mit ${top[0].n.toLocaleString('de-DE')} Titeln in der Datenbank.`
                    : 'Die größten Genres siehst du oben im Bereich „Größte Genres", sortiert nach Titelanzahl.',
              },
            ]}
          />

          <JsonLd
            data={{
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: 'Anime-Genres',
              itemListElement: list.slice(0, 20).map((g, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                url: url(`/genre/${g.slug}`),
                name: g.name,
              })),
            }}
          />
        </>
      )}
    </main>
    <PageSeoFooter pageKey="genre" vars={{ count: docs.length }} maxW="max-w-5xl" />
    </>
  )
}
