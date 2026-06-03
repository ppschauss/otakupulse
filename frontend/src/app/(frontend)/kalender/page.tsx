import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import { displayTitle, animeCover } from '@/lib/anime'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Simulcast-Kalender — OtakuPulse',
  description: 'Welche Anime-Episoden wann erscheinen — der wöchentliche Simulcast-Kalender.',
}

const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

function startOfWeek(d: Date) {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7 // Montag = 0
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - day)
  return x
}

function fmtTime(d: string) {
  try {
    return new Date(d).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function EpisodeRow({ ep }: { ep: any }) {
  const anime = ep.anime && typeof ep.anime === 'object' ? ep.anime : null
  return (
    <Link
      href={anime ? `/anime/${anime.slug}` : '#'}
      className="flex items-center gap-3 rounded-lg border border-white/10 bg-zinc-900/40 p-2.5 transition hover:border-accent/40"
    >
      {animeCover(anime) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={animeCover(anime)!} alt="" className="h-14 w-10 shrink-0 rounded object-cover" loading="lazy" />
      ) : (
        <div className="h-14 w-10 shrink-0 rounded bg-zinc-800" />
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-100">{anime ? displayTitle(anime) : 'Unbekannt'}</p>
        <p className="text-xs text-zinc-500">
          Episode {ep.number}
          {ep.airDate ? ` · ${fmtTime(ep.airDate)}` : ''}
        </p>
      </div>
    </Link>
  )
}

export default async function KalenderPage() {
  const payload = await getPayload({ config })
  const now = new Date()
  const weekStart = startOfWeek(now)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const week = await payload.find({
    collection: 'episodes',
    where: {
      airDate: { greater_than_equal: weekStart.toISOString(), less_than: weekEnd.toISOString() },
    },
    sort: 'airDate',
    limit: 500,
    depth: 1,
  })

  const hasWeek = week.docs.length > 0

  // Episoden nach Wochentag gruppieren
  const byDay: any[][] = [[], [], [], [], [], [], []]
  for (const ep of week.docs as any[]) {
    if (!ep.airDate) continue
    const idx = (new Date(ep.airDate).getDay() + 6) % 7
    byDay[idx].push(ep)
  }

  // Fallback: kommende Episoden, falls diese Woche leer
  const upcoming = hasWeek
    ? null
    : await payload.find({
        collection: 'episodes',
        where: { airDate: { greater_than_equal: now.toISOString() } },
        sort: 'airDate',
        limit: 30,
        depth: 1,
      })

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Simulcast-Kalender</h1>
      <p className="mt-1 text-zinc-400">
        Woche vom {weekStart.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}
      </p>

      {hasWeek ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {WEEKDAYS.map((label, i) => (
            <div key={label}>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-400">{label}</h2>
              <div className="space-y-2">
                {byDay[i].length ? (
                  byDay[i].map((ep) => <EpisodeRow key={ep.id} ep={ep} />)
                ) : (
                  <p className="text-xs text-zinc-600">—</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <section className="mt-8">
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-5 text-sm text-zinc-400">
            Für diese Woche liegen keine Episoden-Termine vor. Stattdessen die nächsten geplanten Episoden:
          </div>
          {upcoming && upcoming.docs.length ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.docs.map((ep: any) => (
                <EpisodeRow key={ep.id} ep={ep} />
              ))}
            </div>
          ) : (
            <p className="mt-4 text-zinc-500">Keine geplanten Episoden in der Datenbank.</p>
          )}
        </section>
      )}
    </main>
  )
}
