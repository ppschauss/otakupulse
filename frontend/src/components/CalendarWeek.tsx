import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import Image from 'next/image'
import { displayTitle, animeCover } from '@/lib/anime'

const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

export function startOfWeek(d: Date) {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7 // Montag = 0
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - day)
  return x
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)

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
        <Image src={animeCover(anime)!} alt="" width={40} height={56} className="h-14 w-10 shrink-0 rounded object-cover" />
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

// Rendert eine Kalenderwoche (Mo–So) ab `weekStart` + Vor/Zurück-Navigation.
export async function CalendarWeek({ weekStart, isCurrent }: { weekStart: Date; isCurrent?: boolean }) {
  const payload = await getPayload({ config })
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)

  const week = await payload.find({
    collection: 'episodes',
    where: { airDate: { greater_than_equal: weekStart.toISOString(), less_than: weekEnd.toISOString() } },
    sort: 'airDate',
    limit: 500,
    depth: 1,
  })

  const byDay: any[][] = [[], [], [], [], [], [], []]
  for (const ep of week.docs as any[]) {
    if (!ep.airDate) continue
    byDay[(new Date(ep.airDate).getDay() + 6) % 7].push(ep)
  }
  const hasWeek = week.docs.length > 0

  const prev = new Date(weekStart)
  prev.setDate(prev.getDate() - 7)
  const next = new Date(weekStart)
  next.setDate(next.getDate() + 7)
  const fmtRange = `${weekStart.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })} – ${new Date(
    weekEnd.getTime() - 1,
  ).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}`

  const upcoming =
    !hasWeek && isCurrent
      ? await payload.find({
          collection: 'episodes',
          where: { airDate: { greater_than_equal: new Date().toISOString() } },
          sort: 'airDate',
          limit: 30,
          depth: 1,
        })
      : null

  const navLink = 'rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-accent/40 hover:text-accent'

  return (
    <>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <p className="mr-auto text-zinc-400">Woche vom {fmtRange}</p>
        <Link href={`/kalender/${ymd(prev)}`} className={navLink}>
          ← Vorherige
        </Link>
        {!isCurrent ? (
          <Link href="/kalender" className={navLink}>
            Aktuelle Woche
          </Link>
        ) : null}
        <Link href={`/kalender/${ymd(next)}`} className={navLink}>
          Nächste →
        </Link>
      </div>

      {hasWeek ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {WEEKDAYS.map((label, i) => (
            <div key={label}>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-400">{label}</h2>
              <div className="space-y-2">
                {byDay[i].length ? byDay[i].map((ep) => <EpisodeRow key={ep.id} ep={ep} />) : <p className="text-xs text-zinc-600">—</p>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <section className="mt-8">
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-5 text-sm text-zinc-400">
            Für diese Woche liegen keine Episoden-Termine vor.
            {isCurrent ? ' Stattdessen die nächsten geplanten Episoden:' : ''}
          </div>
          {upcoming && upcoming.docs.length ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.docs.map((ep: any) => (
                <EpisodeRow key={ep.id} ep={ep} />
              ))}
            </div>
          ) : null}
        </section>
      )}
    </>
  )
}
