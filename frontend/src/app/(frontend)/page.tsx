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
import { SITE_NAME, SITE_URL, DISCORD_INVITE } from '@/lib/site'
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
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-[#5865F2] px-5 py-2.5 text-sm font-bold text-white shadow transition hover:bg-[#4752c4]"
          >
            <svg viewBox="0 0 127.14 96.36" aria-hidden="true" className="h-4 w-4 fill-current">
              <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
            </svg>
            Discord beitreten
          </a>
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
          <p>
            Lust auf Austausch? Komm in unseren{' '}
            <Link href="/anime-discord-server" className="text-accent hover:underline">deutschen Anime-Discord-Server</Link>{' '}
            und quatsch mit anderen Fans über die laufende Season, Empfehlungen und Memes — oder abonniere unseren{' '}
            <Link href="/anime-telegram-kanal" className="text-accent hover:underline">Anime-Telegram-Kanal</Link>, wenn du
            News lieber direkt aufs Handy bekommst.
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
