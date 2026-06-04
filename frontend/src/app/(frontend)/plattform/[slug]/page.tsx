import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
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
    title: `Anime auf ${provider.name} streamen — komplette Liste | OtakuPulse`,
    description:
      provider.blurb ||
      `Alle Anime, die du auf ${provider.name} streamen kannst — durchsuchbar und nach Beliebtheit sortiert.`,
    path: `/plattform/${provider.slug}`,
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

  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'anime',
    where: { streamingProviders: { in: [provider.slug] } },
    sort: SORTS[sortKey],
    limit: PER_PAGE,
    page,
    depth: 0,
  })

  const faq = [
    {
      q: `Welche Anime kann ich auf ${provider.name} streamen?`,
      a: `In unserer Datenbank sind ${result.totalDocs.toLocaleString('de-DE')} Anime gelistet, die auf ${provider.name} verfügbar sind — von aktuellen Simulcasts bis zu Klassikern. Das Angebot kann sich je nach Region unterscheiden.`,
    },
    {
      q: `Gibt es die Anime auf ${provider.name} mit deutschem Dub?`,
      a: `Ob ein Titel deutschen Dub oder Sub hat, hängt vom jeweiligen Anime ab. Auf der Detailseite jedes Anime findest du die verfügbaren Streaming-Anbieter — die genaue Sprachfassung prüfst du am besten direkt bei ${provider.name}.`,
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
      <h1 className="mt-1 text-3xl font-extrabold text-white">Anime auf {provider.name}</h1>
      <p className="mt-2 max-w-2xl text-zinc-400">
        {provider.blurb ? `${provider.blurb} ` : ''}
        {result.totalDocs.toLocaleString('de-DE')} Titel in unserer Datenbank.
      </p>

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

      <Faq items={faq} />
    </main>
  )
}
