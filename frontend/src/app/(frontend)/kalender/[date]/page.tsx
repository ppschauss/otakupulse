import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { pageMeta } from '@/lib/seo'
import { isYmd } from '@/lib/schedule'
import { ScheduleView } from '@/components/ScheduleView'

// Dynamisch (kein ISR): die Seite liest `searchParams` (Genre) — ISR + searchParams
// endet in DYNAMIC_SERVER_USAGE (500). Jeder Tag ist eine eigene, teilbare URL.
export const dynamic = 'force-dynamic'

const label = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { date } = await params
  if (!isYmd(date)) notFound()
  return pageMeta({
    title: `Anime-Episoden am ${label(date)} – Simulcast-Kalender | OtakuPulse`,
    description: `Welche Anime-Episoden am ${label(date)} erscheinen – mit Uhrzeit, Countdown und Streaming-Anbieter.`,
    path: `/kalender/${date}`,
  })
}

export default async function KalenderDate({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>
  searchParams: Promise<{ genre?: string }>
}) {
  const { date } = await params
  const { genre } = await searchParams
  if (!isYmd(date)) notFound()
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Simulcast-Kalender</h1>
      <p className="mt-1 text-sm text-zinc-400">Anime-Episoden am {label(date)} – mit Countdown und Streaming-Anbieter.</p>
      <ScheduleView selected={date} genre={genre} path={`/kalender/${date}`} />
    </main>
  )
}
