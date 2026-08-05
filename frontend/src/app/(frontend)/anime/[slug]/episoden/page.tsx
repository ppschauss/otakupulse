import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { pageMeta } from '@/lib/seo'
import { displayTitle } from '@/lib/anime'

// ISR statt force-dynamic: Detailseiten wurden bislang bei JEDEM Aufruf neu aus
// der DB gerendert und schickten `Cache-Control: no-store` — dadurch konnte weder
// Cloudflare noch ein Crawler-Cache greifen. Bei ~149k crawlbaren URLs auf einem
// Heim-NAS ist das der Flaschenhals: Googles Crawl-Kapazität ist site-weit
// gedeckelt und wird über alle Crawler geteilt, und langsame Antworten drücken
// sie zusätzlich. Die Daten hier ändern sich selten (der Sync fasst pro Nacht
// ~255 von 11k Anime an), deshalb ist ein Cache-Fenster von 1 Stunde unkritisch.
export const revalidate = 3600

// Leere Liste + dynamicParams: zur Build-Zeit wird NICHTS vorgerendert (bei ~149k
// URLs wäre das absurd), aber Next registriert das dynamische Segment überhaupt
// erst als ISR-fähig. Ohne generateStaticParams landet die Route nicht im
// prerender-manifest und `revalidate` bleibt wirkungslos — die Seite würde
// weiterhin bei jedem Aufruf neu gerendert und `no-store` ausliefern.
export const dynamicParams = true
export async function generateStaticParams() {
  return []
}


async function getAnime(slug: string) {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'anime', where: { slug: { equals: slug } }, limit: 1, depth: 0 })
  return docs[0] as any
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const anime = await getAnime(slug)
  if (!anime) return {}
  const title = displayTitle(anime)
  return pageMeta({
    title: `${title} — Episodenliste | OtakuPulse`,
    description: `Alle Episoden von ${title} mit Ausstrahlungsdaten in der Übersicht.`,
    path: `/anime/${slug}/episoden`,
  })
}

export default async function EpisodesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const anime = await getAnime(slug)
  if (!anime) notFound()

  const payload = await getPayload({ config })
  const episodes = await payload.find({
    collection: 'episodes',
    where: { anime: { equals: anime.id } },
    sort: 'number',
    limit: 2000,
    depth: 0,
  })

  const title = displayTitle(anime)

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Anime', path: '/anime' },
          { name: title, path: `/anime/${slug}` },
          { name: 'Episoden', path: `/anime/${slug}/episoden` },
        ]}
      />
      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">{title} — Episoden</h1>
      <p className="mt-1 text-zinc-400">{episodes.totalDocs} Episoden</p>

      {episodes.docs.length === 0 ? (
        <div className="mt-6 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Für diesen Anime sind noch keine einzelnen Episoden erfasst.
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-white/10 rounded-xl border border-white/10 bg-zinc-900/40">
          {episodes.docs.map((ep: any) => (
            <li key={ep.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <span className="text-zinc-200">
                <span className="mr-2 font-bold text-zinc-500">#{ep.number}</span>
                {ep.titleGerman || ep.titleEnglish || ep.titleRomaji || `Episode ${ep.number}`}
              </span>
              {ep.airDate ? (
                <span className="shrink-0 text-xs text-zinc-500">{new Date(ep.airDate).toLocaleDateString('de-DE')}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
