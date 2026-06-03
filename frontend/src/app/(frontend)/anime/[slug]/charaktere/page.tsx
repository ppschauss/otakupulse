import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PortraitCard } from '@/components/PortraitCard'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { pageMeta } from '@/lib/seo'
import { displayTitle, displayName, characterRoleLabel, localImage } from '@/lib/anime'

export const dynamic = 'force-dynamic'

async function getAnime(slug: string) {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'anime', where: { slug: { equals: slug } }, limit: 1, depth: 2 })
  return docs[0] as any
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const anime = await getAnime(slug)
  if (!anime) return {}
  const title = displayTitle(anime)
  return pageMeta({
    title: `${title} — Charaktere & Synchronsprecher | OtakuPulse`,
    description: `Alle Charaktere aus ${title} mit ihren Synchronsprechern.`,
    path: `/anime/${slug}/charaktere`,
  })
}

export default async function CharactersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const anime = await getAnime(slug)
  if (!anime) notFound()

  const characters = (Array.isArray(anime.characters) ? anime.characters : []).filter(
    (c: any) => c?.character && typeof c.character === 'object',
  )
  const title = displayTitle(anime)

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Anime', path: '/anime' },
          { name: title, path: `/anime/${slug}` },
          { name: 'Charaktere', path: `/anime/${slug}/charaktere` },
        ]}
      />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">{title} — Charaktere</h1>
      <p className="mt-1 text-zinc-400">{characters.length} Charaktere</p>

      {characters.length === 0 ? (
        <div className="mt-6 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Noch keine Charaktere erfasst.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
          {characters.map((c: any) => (
            <PortraitCard
              key={c.character.id}
              href={`/character/${c.character.slug}`}
              imageUrl={localImage(c.character)}
              title={displayName(c.character)}
              subtitle={characterRoleLabel(c.role)}
            />
          ))}
        </div>
      )}
    </main>
  )
}
