import { cache } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { MediaRow } from '@/components/MediaRow'
import { JsonLd } from '@/components/JsonLd'
import { pageMeta, breadcrumbLd } from '@/lib/seo'
import { displayTitle, languageLabel, statusLabel, seasonLabel, plainText, LANGUAGE_ORDER } from '@/lib/anime'
import { streamingProvidersOf } from '@/lib/streaming'

export const dynamic = 'force-dynamic'

const getAnime = cache(async (slug: string) => {
  const payload = await getPayload({ config })
  const res = await payload.find({ collection: 'anime', where: { slug: { equals: slug } }, limit: 1, depth: 1 })
  return (res.docs[0] as any) || null
})

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const anime = await getAnime(slug)
  if (!anime) return {}
  const title = displayTitle(anime)
  const hasStream = streamingProvidersOf(anime).length > 0
  return pageMeta({
    title: `${title} streamen – wo läuft ${title}? | OtakuPulse`,
    description: `Wo kann man ${title} legal im Stream schauen? Alle verfügbaren Streaming-Anbieter, Sprachfassungen (Sub & Dub) und Verfügbarkeit auf einen Blick.`,
    path: `/streamen/${slug}`,
    // Ohne erfasste Anbieter ist die Seite dünn → nicht indexieren.
    noindex: !hasStream,
  })
}

export default async function StreamenPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const anime = await getAnime(slug)
  if (!anime) notFound()

  const title = displayTitle(anime)
  const streaming = streamingProvidersOf(anime)
  const languages: string[] = (Array.isArray(anime.availableLanguages) ? anime.availableLanguages : [])
    .slice()
    .sort((a: string, b: string) => LANGUAGE_ORDER.indexOf(a) - LANGUAGE_ORDER.indexOf(b))
  const recommendations = (Array.isArray(anime.recommendations) ? anime.recommendations : []).filter(
    (r: any) => typeof r === 'object',
  )
  const desc = plainText(anime.descriptionDe || anime.descriptionSource).slice(0, 280)

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Anime', path: '/anime' },
          { name: title, path: `/anime/${slug}` },
          { name: 'Streamen', path: `/streamen/${slug}` },
        ]}
      />
      <h1 className="text-3xl font-extrabold text-white sm:text-4xl">Wo läuft {title} im Stream?</h1>
      <p className="mt-3 max-w-3xl leading-relaxed text-zinc-300">
        {streaming.length
          ? `${title} kannst du bei den folgenden Anbietern legal streamen. Wir zeigen dir die verfügbaren Plattformen und Sprachfassungen.`
          : `Für ${title} ist aktuell kein Streaming-Anbieter in unserer Datenbank erfasst. Schau im Simulcast-Kalender vorbei oder entdecke alle Streaming-Anbieter.`}
      </p>

      {streaming.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-white">Verfügbare Streaming-Anbieter</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {streaming.map(({ provider, url }) => (
              <a
                key={provider.slug}
                href={url}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="group flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-zinc-900/50 p-4 transition hover:border-accent/50 hover:bg-zinc-900"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: provider.color || '#7c3aed' }}
                      aria-hidden
                    />
                    <span className="font-bold text-white group-hover:text-accent">{provider.name}</span>
                  </div>
                  {provider.blurb ? <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{provider.blurb}</p> : null}
                </div>
                <span className="shrink-0 text-sm font-semibold text-accent">Zum Anbieter →</span>
              </a>
            ))}
          </div>
        </section>
      ) : (
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/kalender" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:bg-accent/90">
            Simulcast-Kalender
          </Link>
          <Link href="/plattform" className="rounded-lg bg-white/10 px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/20">
            Alle Streaming-Anbieter
          </Link>
        </div>
      )}

      {languages.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-white">Sprachfassungen</h2>
          <div className="flex flex-wrap gap-2">
            {languages.map((l) => (
              <span key={l} className="rounded-full bg-white/5 px-3 py-1 text-sm text-zinc-200 ring-1 ring-white/10">
                {languageLabel(l)}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {desc ? (
        <section className="mt-8 max-w-3xl">
          <h2 className="mb-2 text-lg font-bold text-white">Worum geht es in {title}?</h2>
          <p className="leading-relaxed text-zinc-400">
            {desc}…{' '}
            <Link href={`/anime/${slug}`} className="text-accent hover:underline">
              Alle Details zu {title}
            </Link>
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            {anime.status ? statusLabel(anime.status) : ''}
            {anime.season && anime.seasonYear ? ` · ${seasonLabel(anime.season)} ${anime.seasonYear}` : ''}
            {anime.episodes ? ` · ${anime.episodes} Episoden` : ''}
          </p>
        </section>
      ) : null}

      {recommendations.length ? (
        <div className="mt-12">
          <MediaRow title={`Ähnlich wie ${title}`} href={`/aehnlich/${slug}`} items={recommendations} />
        </div>
      ) : null}

      <JsonLd
        data={breadcrumbLd([
          { name: 'Start', path: '/' },
          { name: 'Anime', path: '/anime' },
          { name: title, path: `/anime/${slug}` },
          { name: 'Streamen', path: `/streamen/${slug}` },
        ])}
      />
    </main>
  )
}
