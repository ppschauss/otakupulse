import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { HeroBlockAsync } from '@/components/HeroBlockAsync'
import { AnimeRowAsync } from '@/components/AnimeRowAsync'
import { NewsSidebar } from '@/components/NewsSidebar'
import { GenreOfTheDay } from '@/components/GenreOfTheDay'
import { SiteHubGrid } from '@/components/SiteHubGrid'
import { HomeDiscover } from '@/components/HomeDiscover'
import { Faq } from '@/components/Faq'
import { JsonLd } from '@/components/JsonLd'
import { RowSkeleton, HeroSkeleton, BoxSkeleton } from '@/components/Skeletons'
import { pageMetaFor } from '@/lib/pageContent'
import { organizationLd } from '@/lib/seo'
import { SITE_NAME, SITE_URL } from '@/lib/site'
import { PageSeoFooter } from '@/components/SeoFooter'

export async function generateMetadata(): Promise<Metadata> {
  return pageMetaFor('home', {
    title: 'OtakuPulse — Anime-Datenbank & News',
    description:
      'Die deutschsprachige Anime-Datenbank: Anime, Charaktere, Synchronsprecher, Studios, Genres, Seasons, Kalender und News.',
    path: '/',
  })
}

// ISR: Startseite alle 10 Min neu generieren (im Prod-Build → instant aus dem Cache).
export const revalidate = 600

const GENRE_ROWS = [
  { slug: 'action', label: 'Action' },
  { slug: 'drama', label: 'Drama' },
  { slug: 'comedy', label: 'Comedy' },
  { slug: 'fantasy', label: 'Fantasy' },
]

const FAQ_ITEMS = [
  {
    q: 'Was ist OtakuPulse?',
    a: 'OtakuPulse ist eine deutschsprachige Anime-Datenbank: Anime, Charaktere, Synchronsprecher, Studios, Genres, Seasons und News — alles miteinander verlinkt und durchsuchbar.',
  },
  {
    q: 'Woher stammen die Daten?',
    a: 'Die Metadaten werden u. a. von AniList importiert und laufend aktualisiert. Ist ein Titel noch nicht erfasst, wird er beim ersten Aufruf automatisch nachgeladen.',
  },
  {
    q: 'Kostet die Nutzung etwas?',
    a: 'Nein. OtakuPulse ist frei zugänglich — stöbere so viel du möchtest in der Datenbank, im Kalender und in den News.',
  },
  {
    q: 'Wie finde ich einen bestimmten Anime?',
    a: 'Nutze die Suche oben oder stöbere über Genres, Tags, Studios und Seasons. Jede Entität hat eine eigene Seite mit allen Verknüpfungen.',
  },
]

export default function HomePage() {
  return (
    <>
    <main className="mx-auto max-w-7xl px-4 py-6">
      <Suspense fallback={<HeroSkeleton />}>
        <HeroBlockAsync />
      </Suspense>

      {/* Lead / Value-Proposition — direkt im ersten Scroll */}
      <section className="mt-8 max-w-3xl">
        <p className="text-lg leading-relaxed text-zinc-200">
          <strong className="text-white">OtakuPulse</strong> ist die deutschsprachige Anime-Datenbank: Stöbere durch
          tausende Anime, finde Titel nach{' '}
          <Link href="/genre" className="text-accent hover:underline">Genre</Link>,{' '}
          <Link href="/season" className="text-accent hover:underline">Season</Link> und{' '}
          <Link href="/plattform" className="text-accent hover:underline">Streaming-Anbieter</Link>, behalte mit dem{' '}
          <Link href="/kalender" className="text-accent hover:underline">Simulcast-Kalender</Link> den Überblick und
          entdecke Charaktere, Studios &amp; Synchronsprecher — alles verlinkt, durchsuchbar und immer aktuell.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/anime"
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-white shadow transition hover:bg-accent/90"
          >
            Anime-Datenbank durchstöbern
          </Link>
          <Link
            href="/kalender"
            className="rounded-lg bg-white/10 px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/20"
          >
            Simulcast-Kalender
          </Link>
          <Link
            href="/top-anime"
            className="rounded-lg bg-white/10 px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/20"
          >
            ★ Top-Anime
          </Link>
        </div>
      </section>

      {/* Schlüssel-Reihen */}
      <div className="mt-12 space-y-10">
        <Suspense fallback={<RowSkeleton title="Beliebt bei OtakuPulse" />}>
          <AnimeRowAsync title="Beliebt bei OtakuPulse" href="/anime" />
        </Suspense>
        <Suspense fallback={<RowSkeleton title="Aktuell im Simulcast" />}>
          <AnimeRowAsync title="Aktuell im Simulcast" href="/kalender" where={{ status: { equals: 'RELEASING' } }} />
        </Suspense>
        <Suspense fallback={<RowSkeleton title="Top bewertet" />}>
          <AnimeRowAsync title="Top bewertet" href="/suche" where={{ averageScore: { greater_than: 0 } }} sort="-averageScore" />
        </Suspense>
      </div>

      {/* Alle Bereiche der Seite (Orientierung) */}
      <SiteHubGrid />

      {/* Genre-Reihen */}
      <div className="mt-12 space-y-10">
        {GENRE_ROWS.map((g) => (
          <Suspense key={g.slug} fallback={<RowSkeleton title={g.label} />}>
            <AnimeRowAsync title={g.label} href={`/genre/${g.slug}`} genreSlug={g.slug} />
          </Suspense>
        ))}
      </div>

      {/* Genre des Tages + News */}
      <div className="mt-14 grid gap-6 md:grid-cols-2">
        <Suspense fallback={<BoxSkeleton />}>
          <GenreOfTheDay />
        </Suspense>
        <Suspense fallback={<BoxSkeleton />}>
          <NewsSidebar />
        </Suspense>
      </div>

      {/* Stats + Entdecken-Chips (Genre/Season/Streaming) */}
      <Suspense fallback={<BoxSkeleton />}>
        <HomeDiscover />
      </Suspense>

      {/* Über OtakuPulse — vertiefender Text (Closing) */}
      <section className="mt-14 max-w-3xl">
        <h2 className="text-xl font-bold text-white">Über OtakuPulse</h2>
        <div className="mt-3 space-y-3 leading-relaxed text-zinc-400">
          <p>
            Ob du gerade deinen ersten Isekai entdeckst oder seit Jahren jede Simulcast-Season verschlingst —
            OtakuPulse ist dein Kompass durch das Anime-Universum. Von kultigen Shounen-Klassikern über
            herzzerreißende Slice-of-Life-Perlen bis zu den heißesten Titeln der laufenden Season findest du hier
            alles an einem Ort.
          </p>
          <p>
            Stöbere durch Studios wie MAPPA, ufotable oder Kyoto Animation, verfolge deine Lieblings-Synchronsprecher,
            grabe dich durch Charakter-Profile und behalte mit unserem Simulcast-Kalender den Überblick, wann die
            nächste Episode droppt. Jede Seite ist mit allem Drumherum verknüpft — ein Klick und du fällst ins nächste
            Kaninchenloch. Stay weeb. 🌸
          </p>
        </div>
      </section>

      <Faq items={FAQ_ITEMS} />

      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: SITE_NAME,
          url: SITE_URL,
          potentialAction: {
            '@type': 'SearchAction',
            target: `${SITE_URL}/suche?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        }}
      />
      <JsonLd data={organizationLd()} />
    </main>
    <PageSeoFooter pageKey="home" maxW="max-w-7xl" />
    </>
  )
}
