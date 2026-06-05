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

export default async function KalenderPage() {
  return (
    <>
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Simulcast-Kalender</h1>
      <CalendarWeek weekStart={startOfWeek(new Date())} isCurrent />
    </main>
    <PageSeoFooter pageKey="kalender" maxW="max-w-6xl" />
    </>
  )
}
