import type { Metadata } from 'next'
import { CalendarWeek, startOfWeek } from '@/components/CalendarWeek'
import { pageMetaFor } from '@/lib/pageContent'
import { PageSeoFooter } from '@/components/SeoFooter'

// ISR: Kalender alle 10 Min neu (Wochenansicht ändert sich nicht minütlich).
export const revalidate = 600

export async function generateMetadata(): Promise<Metadata> {
  const meta = await pageMetaFor('kalender', {
    title: 'Simulcast-Kalender — OtakuPulse',
    description: 'Welche Anime-Episoden wann erscheinen — der wöchentliche Simulcast-Kalender.',
    path: '/kalender',
  })
  return {
    ...meta,
    alternates: {
      ...meta.alternates,
      types: { 'application/rss+xml': [{ url: '/kalender/feed.xml', title: 'OtakuPulse — Simulcast-Kalender' }] },
    },
  }
}

export default async function KalenderPage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string }>
}) {
  const { genre } = await searchParams
  return (
    <>
    <main className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Simulcast-Kalender</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Welche Anime-Episoden wann erscheinen — Woche für Woche, filterbar nach Genre.
      </p>
      <CalendarWeek weekStart={startOfWeek(new Date())} isCurrent genreSlug={genre} basePath="/kalender" />
    </main>
    <PageSeoFooter pageKey="kalender" maxW="max-w-7xl" />
    </>
  )
}
