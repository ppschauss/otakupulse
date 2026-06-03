import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

async function getPlatform(slug: string) {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'platforms', where: { slug: { equals: slug } }, limit: 1 })
  return docs[0] as any
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const p = await getPlatform(slug)
  if (!p) return {}
  return {
    title: p.seoTitle || `${p.name} — Anime-Streaming | OtakuPulse`,
    description: p.seoDescription || p.descriptionDe || `Anime auf ${p.name} streamen.`,
  }
}

export default async function PlatformDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const platform = await getPlatform(slug)
  if (!platform) notFound()

  const regions: string[] = Array.isArray(platform.availableRegions) ? platform.availableRegions : []

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-widest text-accent">Streaming-Plattform</p>
      <h1 className="mt-1 text-3xl font-extrabold text-white">{platform.name}</h1>

      {platform.descriptionDe ? (
        <p className="mt-4 leading-relaxed text-zinc-300">{platform.descriptionDe}</p>
      ) : null}

      <dl className="mt-6 space-y-2 text-sm">
        {regions.length ? (
          <div className="flex gap-4">
            <dt className="w-32 text-zinc-500">Verfügbar in</dt>
            <dd className="text-zinc-200">{regions.join(', ')}</dd>
          </div>
        ) : null}
        {platform.website ? (
          <div className="flex gap-4">
            <dt className="w-32 text-zinc-500">Website</dt>
            <dd>
              <a href={platform.website} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                {platform.website}
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
    </main>
  )
}
