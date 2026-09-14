import type { Metadata } from 'next'
import { ScheduleView } from '@/components/ScheduleView'
import { pageMetaFor } from '@/lib/pageContent'
import { PageSeoFooter } from '@/components/SeoFooter'
import { berlinYmd } from '@/lib/schedule'

// ISR: Kalender alle 10 Min neu (der Countdown selbst läuft im Browser).
export const revalidate = 600

export async function generateMetadata(): Promise<Metadata> {
  const meta = await pageMetaFor('kalender', {
    title: 'Anime-Kalender: Alle Simulcast-Episoden mit Countdown | OtakuPulse',
    description:
      'Welche Anime-Episode erscheint wann? Der Simulcast-Kalender zeigt jeden Sendetermin mit Live-Countdown, Uhrzeit in deiner Zeitzone und dem Anbieter, bei dem die Folge läuft.',
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

export default async function KalenderPage({ searchParams }: { searchParams: Promise<{ genre?: string }> }) {
  const { genre } = await searchParams
  const today = berlinYmd(new Date())
  return (
    <>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <h1 className="text-2xl font-extrabold text-white">Simulcast-Kalender</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Jede Anime-Episode nach Tag, mit Live-Countdown bis zur Veröffentlichung und dem Anbieter, bei dem sie läuft.
        </p>
        <ScheduleView selected={today} genre={genre} path="/kalender" />
      </main>
      <PageSeoFooter pageKey="kalender" maxW="max-w-5xl" />
    </>
  )
}
