import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { AnimeCard } from '@/components/AnimeCard'
import { Pagination } from '@/components/Pagination'
import { Faq } from '@/components/Faq'
import { JsonLd } from '@/components/JsonLd'
import { breadcrumbLd, pageMeta } from '@/lib/seo'
import { providerBySlug } from '@/lib/streaming'

export const dynamic = 'force-dynamic'
const PER_PAGE = 36

const SORTS: Record<string, string> = {
  popularity: '-popularity',
  score: '-averageScore',
  newest: '-seasonYear',
  title: 'titleRomaji',
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const provider = providerBySlug(slug)
  if (!provider) return {}
  return pageMeta({
    title: `Anime auf ${provider.name} streamen — komplette Liste & Tipps | OtakuPulse`,
    description:
      provider.blurb ||
      `Alle Anime, die du auf ${provider.name} streamen kannst — durchsuchbar, nach Beliebtheit sortiert, mit Infos zu Dub und Genres.`,
    path: `/plattform/${provider.slug}`,
    image: provider.logo,
  })
}

export default async function PlatformDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string; sort?: string }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const provider = providerBySlug(slug)
  if (!provider) notFound()

  const sortKey = sp.sort && SORTS[sp.sort] ? sp.sort : 'popularity'
  const page = Math.max(1, Number(sp.page) || 1)
  const isFirst = page === 1

  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'anime',
    where: { streamingProviders: { in: [provider.slug] } },
    sort: SORTS[sortKey],
    limit: PER_PAGE,
    page,
    depth: 0,
  })

  // Dynamische Inhalte nur auf Seite 1: Dub-Quote + Top-Genres dieses Anbieters.
  let deDub = 0
  let topGenres: { name: string; slug: string; n: number }[] = []
  if (isFirst) {
    const pool = (payload.db as any).pool
    const [dub, genres] = await Promise.all([
      pool.query(
        `SELECT count(DISTINCT al.parent_id)::int AS n
         FROM anime_available_languages al
         JOIN anime_streaming_providers sp ON sp.parent_id = al.parent_id
         WHERE sp.value = $1 AND al.value = 'de-dub'`,
        [provider.slug],
      ),
      pool.query(
        `SELECT g.name, g.slug, count(DISTINCT ar.parent_id)::int AS n
         FROM anime_streaming_providers sp
         JOIN anime_rels ar ON ar.parent_id = sp.parent_id AND ar.genres_id IS NOT NULL
         JOIN genres g ON g.id = ar.genres_id
         WHERE sp.value = $1
         GROUP BY g.id, g.name, g.slug
         ORDER BY n DESC LIMIT 8`,
        [provider.slug],
      ),
    ])
    deDub = dub.rows[0]?.n ?? 0
    topGenres = genres.rows
  }

  const total = result.totalDocs
  const totalStr = total.toLocaleString('de-DE')

  const faq = [
    {
      q: `Welche Anime kann ich auf ${provider.name} streamen?`,
      a: `In unserer Datenbank sind aktuell ${totalStr} Anime gelistet, die auf ${provider.name} verfügbar sind — von laufenden Simulcasts bis zu Klassikern.${topGenres.length ? ` Besonders stark vertreten sind die Genres ${topGenres.slice(0, 4).map((g) => g.name).join(', ')}.` : ''} Das Angebot kann sich je nach Region und Lizenzlaufzeit unterscheiden.`,
    },
    {
      q: `Gibt es die Anime auf ${provider.name} mit deutschem Dub?`,
      a: deDub > 0
        ? `Bei mindestens ${deDub.toLocaleString('de-DE')} dieser Titel ist eine deutsche Synchronfassung bekannt. Ob ein konkreter Titel deutschen Dub oder nur Untertitel bietet, steht auf der jeweiligen Anime-Detailseite — die genaue Sprachfassung prüfst du am besten direkt bei ${provider.name}.`
        : `Ob ein Titel deutschen Dub oder Sub hat, hängt vom jeweiligen Anime ab. Auf der Detailseite jedes Anime findest du die verfügbaren Sprachfassungen — die genaue Fassung prüfst du am besten direkt bei ${provider.name}.`,
    },
    {
      q: `Ist diese Liste vollständig?`,
      a: `Wir halten die Anbieter-Zuordnung laufend aktuell, können aber keine 100%ige Vollständigkeit garantieren: Streaming-Kataloge ändern sich ständig und unterscheiden sich je nach Land. Maßgeblich ist immer das aktuelle Angebot bei ${provider.name} selbst.`,
    },
  ]

  const sortLabel: Record<string, string> = {
    popularity: 'Beliebtheit',
    score: 'Bewertung',
    newest: 'Neuste',
    title: 'A–Z',
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <JsonLd
        data={breadcrumbLd([
          { name: 'Start', path: '/' },
          { name: 'Streaming-Anbieter', path: '/plattform' },
          { name: provider.name, path: `/plattform/${provider.slug}` },
        ])}
      />

      <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: provider.color || undefined }}>
        Streaming-Anbieter
      </p>
      <div className="mt-1 flex items-center gap-4">
        {provider.logo ? (
          <span className="flex h-14 shrink-0 items-center justify-center rounded-lg bg-white/90 px-3">
            <Image
              src={provider.logo}
              alt={provider.name}
              width={160}
              height={40}
              priority
              className="max-h-10 w-auto max-w-[160px] object-contain"
            />
          </span>
        ) : (
          <span
            className="h-10 w-2 rounded-full"
            style={{ backgroundColor: provider.color || '#888' }}
            aria-hidden
          />
        )}
        <h1 className="text-3xl font-extrabold text-white">Anime auf {provider.name}</h1>
      </div>

      <p className="mt-3 max-w-3xl leading-relaxed text-zinc-300">
        {provider.blurb ? `${provider.blurb} ` : ''}Hier findest du alle {totalStr} Titel aus unserer Datenbank, die bei{' '}
        {provider.name} verfügbar sind — sortier- und durchsuchbar. Tipp: Über die{' '}
        <Link href="/suche" className="text-accent hover:underline">
          Suche
        </Link>{' '}
        lässt sich zusätzlich nach Genre, Jahr und Sprachfassung filtern.
      </p>

      {/* Statistik-Leiste */}
      {isFirst ? (
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-3">
            <dt className="text-xs text-zinc-500">Titel verfügbar</dt>
            <dd className="text-lg font-bold text-white">{totalStr}</dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-3">
            <dt className="text-xs text-zinc-500">davon mit dt. Dub</dt>
            <dd className="text-lg font-bold text-white">{deDub > 0 ? deDub.toLocaleString('de-DE') : '–'}</dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-3">
            <dt className="text-xs text-zinc-500">Top-Genre</dt>
            <dd className="truncate text-lg font-bold text-white">{topGenres[0]?.name ?? '–'}</dd>
          </div>
        </dl>
      ) : null}

      {/* Sortierung */}
      <div className="mt-6 flex flex-wrap gap-2 text-sm">
        {Object.entries(sortLabel).map(([key, label]) => (
          <a
            key={key}
            href={`/plattform/${provider.slug}?sort=${key}`}
            className={`rounded-lg border px-3 py-1.5 transition ${
              key === sortKey
                ? 'border-accent bg-accent/15 text-white'
                : 'border-white/10 text-zinc-400 hover:border-accent/40 hover:text-white'
            }`}
          >
            {label}
          </a>
        ))}
      </div>

      {result.docs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Aktuell sind keine Titel für {provider.name} erfasst.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {result.docs.map((a: any) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </div>
      )}

      <Pagination basePath={`/plattform/${provider.slug}`} page={page} totalPages={result.totalPages} query={{ sort: sortKey }} />

      {isFirst ? (
        <>
          {/* Top-Genres auf dem Anbieter (dynamisch) */}
          {topGenres.length > 0 ? (
            <section className="mt-12">
              <h2 className="text-xl font-bold text-white">Beliebte Genres auf {provider.name}</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {topGenres.map((g) => (
                  <Link
                    key={g.slug}
                    href={`/genre/${g.slug}`}
                    className="rounded-full border border-white/10 bg-zinc-900/40 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-accent/40 hover:text-white"
                  >
                    {g.name} <span className="text-zinc-500">{g.n}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {/* Über den Anbieter */}
          {provider.about ? (
            <section className="mt-12 border-t border-white/10 pt-8">
              <h2 className="text-xl font-bold text-white">Über {provider.name}</h2>
              <p className="mt-3 max-w-3xl leading-relaxed text-zinc-300">{provider.about}</p>
              {provider.homepage ? (
                <a
                  href={provider.homepage}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  className="mt-3 inline-block text-sm text-accent hover:underline"
                >
                  Zur offiziellen Website von {provider.name} →
                </a>
              ) : null}
            </section>
          ) : null}

          {/* Aktualitäts-Hinweis */}
          <section className="mt-10 rounded-xl border border-white/10 bg-zinc-900/40 p-4 text-sm leading-relaxed text-zinc-400">
            <strong className="text-zinc-300">Hinweis zur Aktualität:</strong> Diese Übersicht wird laufend
            aktualisiert, kann aber keine 100%ige Vollständigkeit gewährleisten. Streaming-Kataloge ändern sich
            ständig, Lizenzen laufen aus und das Angebot unterscheidet sich je nach Land. Ob ein Titel aktuell bei{' '}
            {provider.name} läuft — und in welcher Sprachfassung — prüfst du am besten direkt beim Anbieter.
          </section>

          <Faq items={faq} />
        </>
      ) : null}
    </main>
  )
}
