import { cache } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { AnimeCard } from '@/components/AnimeCard'
import { JsonLd } from '@/components/JsonLd'
import { pageMeta, breadcrumbLd } from '@/lib/seo'
import { displayTitle } from '@/lib/anime'
import { url } from '@/lib/site'

export const dynamic = 'force-dynamic'

const getAnime = cache(async (slug: string) => {
  const payload = await getPayload({ config })
  const res = await payload.find({ collection: 'anime', where: { slug: { equals: slug } }, limit: 1, depth: 1 })
  return (res.docs[0] as any) || null
})

// Ähnliche Titel: Empfehlungen → Relationen → Genre-Fallback, dedupliziert, ohne sich selbst.
const getSimilar = cache(async (slug: string) => {
  const anime = await getAnime(slug)
  if (!anime) return { anime: null as any, similar: [] as any[] }
  const payload = await getPayload({ config })

  const seen = new Set<any>([anime.id])
  const out: any[] = []
  const push = (a: any) => {
    if (a && typeof a === 'object' && a.slug && !seen.has(a.id)) {
      seen.add(a.id)
      out.push(a)
    }
  }

  for (const r of Array.isArray(anime.recommendations) ? anime.recommendations : []) push(r)
  for (const r of Array.isArray(anime.relations) ? anime.relations : []) push(r?.anime)

  if (out.length < 24) {
    const genreIds = (Array.isArray(anime.genres) ? anime.genres : [])
      .map((g: any) => (g && typeof g === 'object' ? g.id : g))
      .filter(Boolean)
    if (genreIds.length) {
      const more = await payload.find({
        collection: 'anime',
        where: { and: [{ genres: { in: genreIds } }, { id: { not_equals: anime.id } }, { isHentai: { not_equals: true } }] },
        sort: '-popularity',
        limit: 40,
        depth: 0,
      })
      for (const a of more.docs as any[]) {
        if (out.length >= 24) break
        push(a)
      }
    }
  }

  return { anime, similar: out.slice(0, 24) }
})

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const { anime, similar } = await getSimilar(slug)
  if (!anime) return {}
  const title = displayTitle(anime)
  return pageMeta({
    title: `Anime ähnlich wie ${title} – Empfehlungen | OtakuPulse`,
    description: `Anime wie ${title} gesucht? Diese ${similar.length} ähnlichen Titel passen zu ${title} – nach Genre, Stil und Empfehlungen ausgewählt.`,
    path: `/aehnlich/${slug}`,
    // Zu wenige ähnliche Titel → dünn → nicht indexieren.
    noindex: similar.length < 4,
  })
}

export default async function AehnlichPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { anime, similar } = await getSimilar(slug)
  if (!anime) notFound()

  const title = displayTitle(anime)

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Anime', path: '/anime' },
          { name: title, path: `/anime/${slug}` },
          { name: 'Ähnliche Anime', path: `/aehnlich/${slug}` },
        ]}
      />
      <h1 className="text-3xl font-extrabold text-white sm:text-4xl">Anime ähnlich wie {title}</h1>
      <p className="mt-3 max-w-3xl leading-relaxed text-zinc-300">
        {similar.length
          ? `Du hast ${title} durch und suchst Nachschub? Diese Anime ähneln ${title} – ausgewählt nach Empfehlungen, verwandten Titeln und passendem Genre.`
          : `Für ${title} haben wir aktuell keine ähnlichen Titel gefunden. Stöbere stattdessen in der Anime-Datenbank.`}{' '}
        <Link href={`/anime/${slug}`} className="text-accent hover:underline">
          Alle Details zu {title}
        </Link>
        .
      </p>

      {similar.length ? (
        <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {similar.map((a: any) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </div>
      ) : (
        <div className="mt-8">
          <Link href="/anime" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:bg-accent/90">
            Anime-Datenbank durchstöbern
          </Link>
        </div>
      )}

      <JsonLd
        data={breadcrumbLd([
          { name: 'Start', path: '/' },
          { name: 'Anime', path: '/anime' },
          { name: title, path: `/anime/${slug}` },
          { name: 'Ähnliche Anime', path: `/aehnlich/${slug}` },
        ])}
      />
      {similar.length ? (
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: `Anime ähnlich wie ${title}`,
            itemListElement: similar.map((a: any, i: number) => ({
              '@type': 'ListItem',
              position: i + 1,
              url: url(`/anime/${a.slug}`),
              name: displayTitle(a),
            })),
          }}
        />
      ) : null}
    </main>
  )
}
