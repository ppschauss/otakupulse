import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { RankedList } from '@/components/RankedList'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { pageMeta } from '@/lib/seo'
import { publicAnimeFilter } from '@/lib/adult'

export const dynamic = 'force-dynamic'

const isYear = (s: string) => /^\d{4}$/.test(s)

async function resolve(filter: string) {
  if (isYear(filter)) return { kind: 'year' as const, year: Number(filter), label: `${filter}` }
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'genres', where: { slug: { equals: filter } }, limit: 1, depth: 0 })
  if (!docs.length) return null
  return { kind: 'genre' as const, genre: docs[0] as any, label: (docs[0] as any).name }
}

export async function generateMetadata({ params }: { params: Promise<{ filter: string }> }): Promise<Metadata> {
  const { filter } = await params
  const r = await resolve(filter)
  if (!r) return {}
  const title =
    r.kind === 'year' ? `Die besten Anime ${r.label}` : `Die besten ${r.label}-Anime aller Zeiten`
  return pageMeta({
    title: `${title} | OtakuPulse`,
    description: `${title} — sortiert nach Community-Bewertung.`,
    path: `/top-anime/${filter}`,
  })
}

export default async function TopAnimeFilterPage({ params }: { params: Promise<{ filter: string }> }) {
  const { filter } = await params
  const r = await resolve(filter)
  if (!r) notFound()

  const payload = await getPayload({ config })
  const where: any = { and: [{ averageScore: { greater_than: 0 } }, publicAnimeFilter] }
  if (r.kind === 'year') where.and.push({ seasonYear: { equals: r.year } })
  else where.and.push({ genres: { in: [r.genre.id] } })

  const { docs } = await payload.find({ collection: 'anime', where, sort: '-averageScore', limit: 50, depth: 0 })

  const heading = r.kind === 'year' ? `Die besten Anime ${r.label}` : `Die besten ${r.label}-Anime`

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Top-Anime', path: '/top-anime' },
          { name: r.label, path: `/top-anime/${filter}` },
        ]}
      />
      <h1 className="text-3xl font-extrabold text-white">{heading}</h1>
      <p className="mt-1 text-zinc-400">Nach Community-Bewertung · {docs.length} Titel</p>

      {docs.length === 0 ? (
        <div className="mt-6 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Noch keine bewerteten Anime in dieser Auswahl.
        </div>
      ) : (
        <div className="mt-6">
          <RankedList items={docs} />
        </div>
      )}
    </main>
  )
}
