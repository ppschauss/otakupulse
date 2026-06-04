import { CalendarWeek, startOfWeek } from '@/components/CalendarWeek'

// ISR: Kalender alle 10 Min neu (Wochenansicht ändert sich nicht minütlich).
export const revalidate = 600

export const metadata = {
  title: 'Simulcast-Kalender — OtakuPulse',
  description: 'Welche Anime-Episoden wann erscheinen — der wöchentliche Simulcast-Kalender.',
  alternates: {
    types: { 'application/rss+xml': [{ url: '/kalender/feed.xml', title: 'OtakuPulse — Simulcast-Kalender' }] },
  },
}

export default async function KalenderPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Simulcast-Kalender</h1>
      <CalendarWeek weekStart={startOfWeek(new Date())} isCurrent />
    </main>
  )
}
