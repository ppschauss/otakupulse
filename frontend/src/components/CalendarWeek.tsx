import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import Image from 'next/image'
import { displayTitle, animeCover } from '@/lib/anime'
import { AdultGuard } from './AdultGuard'

const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

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

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

// Genre-IDs eines (depth-1-)Anime: genres kommen als ID-Array (oder Objekte).
const genreIdsOf = (a: any): any[] =>
  (a?.genres || []).map((g: any) => (g && typeof g === 'object' ? g.id : g))

// Vertikale Episoden-Karte: Cover oben, Titel + EP unten, Zeit als Badge.
function EpisodeCard({ ep }: { ep: any }) {
  const anime = ep.anime && typeof ep.anime === 'object' ? ep.anime : null
  const cover = animeCover(anime)
  return (
    <Link
      href={anime ? `/anime/${anime.slug}` : '#'}
      className="group block overflow-hidden rounded-xl border border-white/10 bg-zinc-900/50 transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg hover:shadow-accent/10"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-zinc-800">
        {cover ? (
          <Image
            src={cover}
            alt=""
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1280px) 22vw, 165px"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-[10px] text-zinc-600">kein Bild</div>
        )}
        <AdultGuard anime={anime} size="sm" rounded="" />
        {ep.airDate ? (
          <span className="absolute bottom-1 right-1 z-10 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
            {fmtTime(ep.airDate)}
          </span>
        ) : null}
      </div>
      <div className="p-2">
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-zinc-100 transition group-hover:text-accent">
          {anime ? displayTitle(anime) : 'Unbekannt'}
        </p>
        <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-accent/90">Episode {ep.number}</p>
      </div>
    </Link>
  )
}

// Rendert eine Kalenderwoche (Mo–So) ab `weekStart` + Genre-Filter + Vor/Zurück-Navigation.
export async function CalendarWeek({
  weekStart,
  isCurrent,
  genreSlug,
  basePath = '/kalender',
}: {
  weekStart: Date
  isCurrent?: boolean
  genreSlug?: string
  basePath?: string
}) {
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
  const allEps = week.docs as any[]

  // --- Genre-Filter-Leiste: welche Genres kommen diese Woche vor? ---
  const presentIds = new Set<any>()
  for (const ep of allEps) for (const gid of genreIdsOf(ep.anime)) presentIds.add(gid)

  let chipGenres: { name: string; slug: string }[] = []
  let selectedId: any = null
  let selectedName: string | undefined
  {
    const ids = [...presentIds]
    const gres = ids.length
      ? await payload.find({ collection: 'genres', where: { id: { in: ids } }, limit: 200, depth: 0 })
      : ({ docs: [] } as any)
    const docs = (gres.docs as any[]).filter((g) => g.slug !== 'hentai')
    chipGenres = docs
      .map((g) => ({ name: g.name as string, slug: g.slug as string }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
    if (genreSlug) {
      const inWeek = docs.find((g) => g.slug === genreSlug)
      if (inWeek) {
        selectedId = inWeek.id
        selectedName = inWeek.name
      } else {
        // gewähltes Genre kommt diese Woche nicht vor → trotzdem auflösen + Chip ergänzen.
        const s = await payload.find({ collection: 'genres', where: { slug: { equals: genreSlug } }, limit: 1, depth: 0 })
        if (s.docs.length) {
          selectedId = (s.docs[0] as any).id
          selectedName = (s.docs[0] as any).name
          chipGenres = [{ name: selectedName!, slug: genreSlug }, ...chipGenres]
        }
      }
    }
  }

  const matches = (ep: any) => !selectedId || genreIdsOf(ep.anime).some((id) => id === selectedId)

  const byDay: any[][] = [[], [], [], [], [], [], []]
  for (const ep of allEps) {
    if (!ep.airDate || !matches(ep)) continue
    byDay[(new Date(ep.airDate).getDay() + 6) % 7].push(ep)
  }
  const shownCount = byDay.reduce((n, d) => n + d.length, 0)

  const prev = new Date(weekStart)
  prev.setDate(prev.getDate() - 7)
  const next = new Date(weekStart)
  next.setDate(next.getDate() + 7)
  const fmtRange = `${weekStart.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })} – ${new Date(
    weekEnd.getTime() - 1,
  ).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}`

  // Genre-Param bei der Wochen-Navigation mitführen.
  const qs = genreSlug ? `?genre=${encodeURIComponent(genreSlug)}` : ''
  const today = new Date()

  // Fallback (laufende Woche ohne Termine): nächste geplante Episoden – ebenfalls gefiltert.
  const upcoming =
    !shownCount && isCurrent
      ? await payload.find({
          collection: 'episodes',
          where: { airDate: { greater_than_equal: new Date().toISOString() } },
          sort: 'airDate',
          limit: 60,
          depth: 1,
        })
      : null
  const upcomingDocs = ((upcoming?.docs as any[]) || []).filter(matches).slice(0, 24)

  const navLink =
    'rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-accent/40 hover:bg-white/5 hover:text-accent'
  const chipBase = 'rounded-full px-3 py-1 text-xs font-medium ring-1 transition'
  const chipOn = 'bg-accent text-white ring-accent'
  const chipOff = 'bg-white/5 text-zinc-300 ring-white/10 hover:bg-white/10 hover:text-white'

  return (
    <>
      {/* Genre-Filter */}
      {chipGenres.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Genre</span>
          <Link href={`${basePath}`} className={`${chipBase} ${!selectedId ? chipOn : chipOff}`}>
            Alle
          </Link>
          {chipGenres.map((g) => {
            const on = g.slug === genreSlug
            return (
              <Link key={g.slug} href={`${basePath}?genre=${encodeURIComponent(g.slug)}`} className={`${chipBase} ${on ? chipOn : chipOff}`}>
                {g.name}
              </Link>
            )
          })}
        </div>
      ) : null}

      {/* Wochen-Navigation */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <p className="mr-auto text-zinc-400">
          Woche vom {fmtRange}
          {selectedName ? <span className="text-zinc-500"> · Genre: {selectedName}</span> : null}
        </p>
        <Link href={`/kalender/${ymd(prev)}${qs}`} className={navLink}>
          ← Vorherige
        </Link>
        {!isCurrent ? (
          <Link href={`/kalender${qs}`} className={navLink}>
            Aktuelle Woche
          </Link>
        ) : null}
        <Link href={`/kalender/${ymd(next)}${qs}`} className={navLink}>
          Nächste →
        </Link>
      </div>

      {shownCount ? (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {WEEKDAYS.map((label, i) => {
            const dayDate = new Date(weekStart)
            dayDate.setDate(dayDate.getDate() + i)
            const isToday = sameDay(dayDate, today)
            return (
              <div key={label} className="rounded-2xl border border-white/10 bg-zinc-900/30 p-2.5">
                <div
                  className={`mb-2.5 flex items-baseline justify-between rounded-lg px-2 py-1.5 ${
                    isToday ? 'bg-accent/15 ring-1 ring-accent/40' : 'bg-white/5'
                  }`}
                >
                  <span className={`text-sm font-bold ${isToday ? 'text-accent' : 'text-white'}`}>
                    <span className="sm:hidden">{label}</span>
                    <span className="hidden sm:inline">{WEEKDAYS_SHORT[i]}</span>
                  </span>
                  <span className={`text-xs font-medium ${isToday ? 'text-accent' : 'text-zinc-500'}`}>
                    {dayDate.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' })}
                  </span>
                </div>
                <div className="space-y-2.5">
                  {byDay[i].length ? (
                    byDay[i].map((ep) => <EpisodeCard key={ep.id} ep={ep} />)
                  ) : (
                    <p className="rounded-lg border border-dashed border-white/10 py-5 text-center text-[11px] text-zinc-600">
                      keine
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <section className="mt-8">
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-5 text-sm text-zinc-400">
            {selectedName
              ? `Für diese Woche liegen keine ${selectedName}-Episoden vor.`
              : 'Für diese Woche liegen keine Episoden-Termine vor.'}
            {isCurrent && upcomingDocs.length ? ' Stattdessen die nächsten geplanten Episoden:' : ''}
          </div>
          {upcomingDocs.length ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {upcomingDocs.map((ep: any) => (
                <EpisodeCard key={ep.id} ep={ep} />
              ))}
            </div>
          ) : null}
        </section>
      )}
    </>
  )
}
