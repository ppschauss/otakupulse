import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { CalendarWeek, startOfWeek } from '@/components/CalendarWeek'
import { pageMeta } from '@/lib/seo'

export const dynamic = 'force-dynamic'

function parseDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { date } = await params
  const d = parseDate(date)
  if (!d) return {}
  const label = startOfWeek(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
  return pageMeta({
    title: `Simulcast-Kalender — Woche ab ${label} | OtakuPulse`,
    description: `Welche Anime-Episoden in der Woche ab ${label} erscheinen.`,
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
  const d = parseDate(date)
  if (!d) notFound()

  const ws = startOfWeek(d)
  const isCurrent = ws.getTime() === startOfWeek(new Date()).getTime()

  return (
    <main className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Simulcast-Kalender</h1>
      <CalendarWeek weekStart={ws} isCurrent={isCurrent} genreSlug={genre} basePath={`/kalender/${date}`} />
    </main>
  )
}
