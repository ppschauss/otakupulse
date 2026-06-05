import { Suspense } from 'react'
import type { Metadata } from 'next'
import { HeroBlockAsync } from '@/components/HeroBlockAsync'
import { AnimeRowAsync } from '@/components/AnimeRowAsync'
import { NewsSidebar } from '@/components/NewsSidebar'
import { GenreOfTheDay } from '@/components/GenreOfTheDay'
import { Faq } from '@/components/Faq'
import { RowSkeleton, HeroSkeleton, BoxSkeleton } from '@/components/Skeletons'
import { pageMetaFor } from '@/lib/pageContent'
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

      {/* Crunchyroll-Style Reihen — jede streamt unabhängig nach */}
      <div className="mt-10 space-y-10">
        <Suspense fallback={<RowSkeleton title="Beliebt bei OtakuPulse" />}>
          <AnimeRowAsync title="Beliebt bei OtakuPulse" href="/anime" />
        </Suspense>
        <Suspense fallback={<RowSkeleton title="Top bewertet" />}>
          <AnimeRowAsync title="Top bewertet" href="/suche" where={{ averageScore: { greater_than: 0 } }} sort="-averageScore" />
        </Suspense>
        <Suspense fallback={<RowSkeleton title="Aktuell im Simulcast" />}>
          <AnimeRowAsync title="Aktuell im Simulcast" href="/kalender" where={{ status: { equals: 'RELEASING' } }} />
        </Suspense>
        {GENRE_ROWS.map((g) => (
          <Suspense key={g.slug} fallback={<RowSkeleton title={g.label} />}>
            <AnimeRowAsync title={g.label} href={`/genre/${g.slug}`} genreSlug={g.slug} />
          </Suspense>
        ))}
      </div>

      {/* Genre des Tages + Season-Vorschau */}
      <div className="mt-14 grid gap-6 md:grid-cols-2">
        <Suspense fallback={<BoxSkeleton />}>
          <GenreOfTheDay />
        </Suspense>
        <Suspense fallback={<BoxSkeleton />}>
          <NewsSidebar />
        </Suspense>
      </div>

      {/* Stil-Text */}
      <section className="mt-14 max-w-3xl">
        <h2 className="text-xl font-bold text-white">Willkommen in der OtakuPulse-Community</h2>
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
    </main>
    <PageSeoFooter pageKey="home" maxW="max-w-7xl" />
    </>
  )
}
