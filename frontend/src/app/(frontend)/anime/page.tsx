import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import type { Metadata } from 'next'
import { AnimeCard } from '@/components/AnimeCard'
import { MediaRow } from '@/components/MediaRow'
import { ChipSection, NewsSection } from '@/components/HubSections'
import { Faq } from '@/components/Faq'
import { JsonLd } from '@/components/JsonLd'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { PageSeoFooter } from '@/components/SeoFooter'
import { pageMetaFor } from '@/lib/pageContent'
import { pageMeta, breadcrumbLd } from '@/lib/seo'
import { hubExtras } from '@/lib/hub'
import { displayTitle, seasonLabel } from '@/lib/anime'
import { STREAMING_PROVIDERS } from '@/lib/streaming'
import { SITE_NAME, SITE_URL, url } from '@/lib/site'

export const dynamic = 'force-dynamic'

const PER_PAGE = 36
const ROW = 14 // Titel pro Entdecken-Reihe

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}): Promise<Metadata> {
  const page = Math.max(1, Number((await searchParams).page) || 1)
  if (page > 1) {
    return pageMeta({
      title: `Anime-Datenbank – Seite ${page} | ${SITE_NAME}`,
      description:
        'Alle Anime in der OtakuPulse-Datenbank durchstöbern – nach Beliebtheit sortiert, mit Cover, Bewertung und Streaming-Infos.',
      path: `/anime?page=${page}`,
    })
  }
  return pageMetaFor('anime', {
    title: 'Anime-Datenbank: Alle Anime nach Genre, Jahr & Stream | OtakuPulse',
    description:
      'Die deutschsprachige Anime-Datenbank: nach Genre, Jahr, Studio und Sprachfassung (Sub & Dub) filtern, Bewertungen vergleichen, Simulcast-Kalender checken und Streaming-Infos finden. Beliebte, neue und beste Anime entdecken.',
    path: '/anime',
  })
}

// Pill-Link für die Entdecken-Navigation.
function Facet({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-full bg-white/5 px-4 py-1.5 text-sm font-medium text-zinc-200 ring-1 ring-white/10 transition hover:bg-accent hover:text-white hover:ring-accent"
    >
      {label}
    </Link>
  )
}

export default async function AnimeListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const isLanding = page === 1
  const payload = await getPayload({ config })

  // Browse-Grid (alle Seiten): nach Beliebtheit.
  const result = await payload.find({
    collection: 'anime',
    limit: PER_PAGE,
    page,
    sort: '-popularity',
    depth: 0,
  })
  const total = result.totalDocs

  // --- Ab Seite 2: nur das durchblätterbare Grid (kein Landing-Inhalt). ---
  if (!isLanding) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <Breadcrumbs items={[{ name: 'Start', path: '/' }, { name: 'Anime', path: '/anime' }]} />
        <h1 className="text-2xl font-extrabold text-white">Anime-Datenbank · Seite {page}</h1>
        <p className="mt-1 text-zinc-400">{total} Titel</p>
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {result.docs.map((a: any) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </div>
        <Pagination page={page} result={result} />
      </main>
    )
  }

  // --- Seite 1: SEO-Landingpage. Alle Datenquellen parallel. ---
  const [simulcast, topRated, freshest, extras, seasons] = await Promise.all([
    payload.find({
      collection: 'anime',
      where: { status: { equals: 'RELEASING' } },
      sort: '-popularity',
      limit: ROW,
      depth: 0,
    }),
    payload.find({
      collection: 'anime',
      where: { and: [{ averageScore: { greater_than_equal: 1 } }, { popularity: { greater_than_equal: 5000 } }] },
      sort: '-averageScore',
      limit: ROW,
      depth: 0,
    }),
    payload.find({
      collection: 'anime',
      where: { isHentai: { not_equals: true } },
      sort: '-createdAt',
      limit: ROW,
      depth: 0,
    }),
    hubExtras(payload, {}),
    payload.find({ collection: 'anime-seasons', sort: '-year', limit: 12, depth: 0 }),
  ])

  const seasonItems = (seasons.docs as any[])
    .map((s) => ({ name: s.season ? `${seasonLabel(s.season)} ${s.year}` : s.name, slug: s.slug as string }))
    .filter((s) => s.slug)
  // Streaming-Anbieter aus der kuratierten Provider-Liste (Top-DE zuerst).
  const platformItems = STREAMING_PROVIDERS.slice(0, 10).map((p) => ({ name: p.name, slug: p.slug }))

  const faqItems = [
    {
      q: 'Wie viele Anime umfasst die OtakuPulse-Datenbank?',
      a: `Aktuell sind ${total} Anime-Titel erfasst – mit Cover, Beschreibung, Genres, Studios, Bewertung, Charakteren und Streaming-Infos. Die Datenbank wächst täglich und wird automatisch um neue und angekündigte Titel ergänzt.`,
    },
    {
      q: 'Wo kann ich Anime auf Deutsch streamen?',
      a: 'Wir verlinken pro Titel die verfügbaren Streaming-Plattformen wie Crunchyroll, ADN, aniverse und Netflix – inklusive Hinweis auf deutsche Untertitel (Sub) oder Synchronisation (Dub). Eine Übersicht aller Anbieter findest du unter „Streaming".',
    },
    {
      q: 'Was bedeutet Simulcast?',
      a: 'Beim Simulcast erscheint eine Anime-Episode (fast) zeitgleich zur japanischen TV-Ausstrahlung legal im Stream. Welche Episoden wann erscheinen, zeigt unser wöchentlicher Simulcast-Kalender.',
    },
    {
      q: 'Wie finde ich Anime nach Genre?',
      a: 'Über die Genre-Übersicht kannst du gezielt nach Action, Isekai, Romance, Fantasy, Slice of Life und vielen weiteren Genres stöbern – jeweils mit eigener Bestenliste und Beschreibung.',
    },
    {
      q: 'Welche sind die besten Anime?',
      a: 'Unsere Top-Anime-Liste sortiert alle Titel nach Community-Bewertung – von zeitlosen Klassikern bis zu aktuellen Highlights. Du kannst zusätzlich nach Genre und Jahr eingrenzen.',
    },
  ]

  const collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Anime-Datenbank',
    description: `Deutschsprachige Anime-Datenbank mit ${total} Titeln – nach Genre, Jahr, Studio und Streaming filterbar.`,
    url: url('/anime'),
    isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
  }
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Beliebte Anime',
    itemListElement: (result.docs as any[]).slice(0, 12).map((a, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: url(`/anime/${a.slug}`),
      name: displayTitle(a),
    })),
  }

  return (
    <>
      <main className="mx-auto max-w-6xl px-4 py-10">
        <Breadcrumbs items={[{ name: 'Start', path: '/' }, { name: 'Anime', path: '/anime' }]} />

        {/* Hero / Intro */}
        <header>
          <h1 className="text-3xl font-extrabold text-white sm:text-4xl">Anime-Datenbank</h1>
          <p className="mt-3 max-w-3xl leading-relaxed text-zinc-300">
            Willkommen in der OtakuPulse-Anime-Datenbank – deinem deutschsprachigen Nachschlagewerk für aktuell{' '}
            <strong className="text-white">{total} Anime</strong>. Stöbere durch alle Titel, filtere nach{' '}
            <Link href="/genre" className="text-accent hover:underline">
              Genre
            </Link>
            ,{' '}
            <Link href="/season" className="text-accent hover:underline">
              Jahr &amp; Season
            </Link>
            ,{' '}
            <Link href="/studio" className="text-accent hover:underline">
              Studio
            </Link>{' '}
            und Sprachfassung (Sub &amp; Dub), vergleiche Bewertungen und sieh im{' '}
            <Link href="/kalender" className="text-accent hover:underline">
              Simulcast-Kalender
            </Link>
            , welche neuen Anime gerade laufen. Von zeitlosen Klassikern bis zu den besten Anime der aktuellen Season –
            hier findest du deinen nächsten Lieblingsanime.
          </p>
        </header>

        {/* Entdecken-Navigation */}
        <nav aria-label="Anime entdecken" className="mt-6 flex flex-wrap gap-2.5">
          <Facet href="/top-anime" label="★ Top-Anime" />
          <Facet href="/kalender" label="Simulcast-Kalender" />
          <Facet href="/genre" label="Nach Genre" />
          <Facet href="/season" label="Seasons & Jahre" />
          <Facet href="/studio" label="Studios" />
          <Facet href="/plattform" label="Streaming" />
          <Facet href="/suche" label="🔍 Suche" />
        </nav>

        {/* Entdecken-Reihen */}
        <div className="mt-10 space-y-10">
          <MediaRow title="Aktuell im Simulcast" href="/kalender" items={simulcast.docs} />
          <MediaRow title="Am besten bewertet" href="/top-anime" items={topRated.docs} />
          <MediaRow title="Frisch im Katalog" items={freshest.docs} />
        </div>

        {/* Genres */}
        <ChipSection
          title="Anime nach Genre"
          subtitle="Finde gezielt Action, Isekai, Romance, Fantasy, Slice of Life und mehr – jedes Genre mit eigener Bestenliste."
          base="/genre"
          items={extras.topGenres}
          withCount
        />

        {/* Seasons / Jahre */}
        {seasonItems.length ? (
          <ChipSection
            title="Nach Season & Jahr"
            subtitle="Neue Anime der aktuellen Season und Archiv vergangener Jahre – Winter, Frühling, Sommer, Herbst."
            base="/season"
            items={seasonItems}
          />
        ) : null}

        {/* Studios */}
        <ChipSection
          title="Beliebte Studios"
          subtitle="Anime von MAPPA, ufotable, Wit Studio, Kyoto Animation und weiteren Top-Studios."
          base="/studio"
          items={extras.topStudios}
          withCount
        />

        {/* Streaming */}
        {platformItems.length ? (
          <ChipSection
            title="Wo Anime schauen – Streaming-Plattformen"
            subtitle="Legal streamen: pro Titel zeigen wir die verfügbaren Anbieter mit deutschem Sub oder Dub."
            base="/plattform"
            items={platformItems}
          />
        ) : null}

        {/* Aktuelle News */}
        {extras.news.length ? <NewsSection title="Aktuelle Anime-News" entity="Anime" items={extras.news} /> : null}

        {/* Vollständiges Browse-Grid */}
        <section className="mt-14">
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-xl font-bold text-white">Alle Anime durchstöbern</h2>
            <span className="text-sm text-zinc-500">{total} Titel</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {result.docs.map((a: any) => (
              <AnimeCard key={a.id} anime={a} />
            ))}
          </div>
          <Pagination page={page} result={result} />
        </section>

        {/* FAQ (Rich Snippets) */}
        <Faq items={faqItems} title="Häufige Fragen zur Anime-Datenbank" />

        <JsonLd data={collectionLd} />
        <JsonLd data={itemListLd} />
        <JsonLd data={breadcrumbLd([{ name: 'Start', path: '/' }, { name: 'Anime', path: '/anime' }])} />
      </main>
      <PageSeoFooter pageKey="anime" maxW="max-w-6xl" />
    </>
  )
}

// Geteilte Paginierung.
function Pagination({ page, result }: { page: number; result: any }) {
  if (result.totalPages <= 1) return null
  return (
    <nav className="mt-10 flex items-center justify-center gap-3 text-sm">
      {result.hasPrevPage ? (
        <Link href={`/anime?page=${page - 1}`} className="rounded-md border border-white/10 px-4 py-2 hover:bg-white/5">
          ← Zurück
        </Link>
      ) : null}
      <span className="text-zinc-500">
        Seite {page} / {result.totalPages}
      </span>
      {result.hasNextPage ? (
        <Link href={`/anime?page=${page + 1}`} className="rounded-md border border-white/10 px-4 py-2 hover:bg-white/5">
          Weiter →
        </Link>
      ) : null}
    </nav>
  )
}
