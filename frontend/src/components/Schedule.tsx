'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { ScheduleDay, ScheduleEpisode } from '@/lib/schedule'

/**
 * Simulcast-Kalender — Optik/Funktion nach Vorbild „AnimeOshi Anime Schedule":
 *   - Monatsleiste mit allen Tagen als Pills (Wochentag + Zahl), ‹ › Monatswechsel,
 *     heute markiert, gewählter Tag hervorgehoben, Fremdmonatstage gedimmt
 *   - Karten-Liste des gewählten Tages: Cover · „Episode N" · Titel · Sendezeit in der
 *     Zeitzone des Besuchers · Anbieter-Badges (unsere Offer-Daten) · Live-Countdown
 * Der Server rendert den gewählten Tag (SEO); der Tageswechsel läuft ohne Neuladen,
 * die URL (/kalender/YYYY-MM-DD) wird per history.replaceState mitgeführt. Der
 * Monatswechsel ist ein echter Link (neue Daten vom Server).
 */

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

type Props = {
  days: ScheduleDay[]
  year: number
  month: number
  episodes: ScheduleEpisode[]
  selected: string
  today: string
  genres: { slug: string; name: string }[]
  genre?: string
  prevMonth: string
  nextMonth: string
}

/** Tages-Schlüssel (YYYY-MM-DD) einer Sendezeit in der Zeitzone des Besuchers (SSR: Europe/Berlin). */
function dayKey(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
}
function timeLabel(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('de-DE', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

export function Schedule({ days, year, month, episodes, selected, today, genres, genre, prevMonth, nextMonth }: Props) {
  const [day, setDay] = useState(selected)
  const [genreSel, setGenreSel] = useState(genre || '')
  // Zeitzone erst nach dem Mount aus dem Browser — SSR und erster Client-Render müssen übereinstimmen.
  const [tz, setTz] = useState('Europe/Berlin')
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin')
    } catch {}
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Tageswechsel ohne Navigation; URL mitführen, damit Teilen/Zurück funktioniert.
  const selectDay = (d: string) => {
    setDay(d)
    if (typeof window !== 'undefined') {
      const q = genreSel ? `?genre=${encodeURIComponent(genreSel)}` : ''
      window.history.replaceState(null, '', `/kalender/${d}${q}`)
    }
  }

  const byDay = useMemo(() => {
    const m = new Map<string, ScheduleEpisode[]>()
    for (const e of episodes) {
      if (genreSel && !e.genres.includes(genreSel)) continue
      const k = dayKey(e.airDate, tz)
      ;(m.get(k) || m.set(k, []).get(k)!).push(e)
    }
    return m
  }, [episodes, tz, genreSel])

  const list = byDay.get(day) || []
  const monthLabel = `${MONTHS[month - 1]} ${year}`
  const selDate = new Date(`${day}T12:00:00Z`)
  const selLabel = `${['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'][(selDate.getUTCDay() + 6) % 7]}, ${selDate.getUTCDate()}. ${MONTHS[selDate.getUTCMonth()]}`

  return (
    <div className="mt-6">
      {/* Genre-Filter */}
      {genres.length ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Genre</span>
          <button type="button" onClick={() => setGenreSel('')} className={chip(!genreSel)}>
            Alle
          </button>
          {genres.map((g) => (
            <button key={g.slug} type="button" onClick={() => setGenreSel(g.slug === genreSel ? '' : g.slug)} className={chip(g.slug === genreSel)}>
              {g.name}
            </button>
          ))}
        </div>
      ) : null}

      {/* Monats-Kopf */}
      <div className="flex items-center justify-between rounded-t-2xl border border-white/10 bg-zinc-900/50 px-3 py-2">
        <Link href={`/kalender/${prevMonth}`} className="rounded-lg px-2 py-1 text-zinc-400 transition hover:bg-white/10 hover:text-white" aria-label="Vorheriger Monat">
          ‹
        </Link>
        <p className="text-sm font-bold uppercase tracking-widest text-white">{monthLabel}</p>
        <Link href={`/kalender/${nextMonth}`} className="rounded-lg px-2 py-1 text-zinc-400 transition hover:bg-white/10 hover:text-white" aria-label="Nächster Monat">
          ›
        </Link>
      </div>
      {/* Tagesleiste: immer 7 Spalten — auf Mobil kompakte Pills, ab sm mit mehr Luft */}
      <div className="rounded-b-2xl border border-t-0 border-white/10 bg-zinc-900/30 p-1.5 sm:p-2">
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
          {days.map((d) => {
            const isSel = d.date === day
            const isToday = d.date === today
            const n = byDay.get(d.date)?.length || 0
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => selectDay(d.date)}
                aria-pressed={isSel}
                className={`flex flex-col items-center rounded-lg px-0.5 py-1 text-center transition sm:rounded-xl sm:px-1 sm:py-1.5 ${
                  isSel
                    ? 'bg-gradient-to-br from-accent to-accent-2 text-white shadow-lg shadow-accent/20'
                    : isToday
                      ? 'bg-accent/15 text-white ring-1 ring-accent/50 hover:bg-accent/25'
                      : d.otherMonth
                        ? 'text-zinc-600 hover:bg-white/5 hover:text-zinc-400'
                        : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className="text-[9px] font-semibold uppercase tracking-wide opacity-80 sm:text-[10px]">{WD[d.weekday]}</span>
                <span className="text-sm font-extrabold leading-tight sm:text-base">{d.day}</span>
                <span className={`mt-0.5 h-1 w-1 rounded-full ${n ? (isSel ? 'bg-white' : 'bg-accent') : 'bg-transparent'}`} aria-hidden />
              </button>
            )
          })}
        </div>
      </div>

      {/* Tages-Liste */}
      <div className="mt-6 flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-white">{selLabel}</h2>
        <p className="text-xs text-zinc-500">
          {list.length} {list.length === 1 ? 'Episode' : 'Episoden'} · Zeiten in {tz.replace('_', ' ')}
        </p>
      </div>

      {list.length ? (
        <ul className="mt-3 space-y-3">
          {list.map((e) => (
            <li key={e.id}>
              <EpisodeRow e={e} tz={tz} now={now} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-2xl border border-dashed border-white/10 py-10 text-center text-sm text-zinc-500">
          An diesem Tag sind keine Episoden{genreSel ? ' in diesem Genre' : ''} geplant.
        </p>
      )}
    </div>
  )
}

const chip = (on: boolean) =>
  `rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${on ? 'bg-accent text-white ring-accent' : 'bg-white/5 text-zinc-300 ring-white/10 hover:bg-white/10 hover:text-white'}`

function EpisodeRow({ e, tz, now }: { e: ScheduleEpisode; tz: string; now: number | null }) {
  const air = Date.parse(e.airDate)
  const diff = now === null ? null : air - now
  return (
    <div className="group flex overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/50 transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg hover:shadow-accent/10">
      <Link href={`/anime/${e.slug}`} className="relative w-[72px] shrink-0 bg-zinc-800 sm:w-[90px]">
        {e.cover ? (
          <Image src={e.cover} alt="" fill sizes="90px" className="object-cover transition duration-500 group-hover:scale-105" />
        ) : null}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-3 sm:px-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-accent">
          Episode {e.number}
          {e.episodesTotal ? <span className="text-zinc-500"> / {e.episodesTotal}</span> : null}
        </p>
        <Link href={`/anime/${e.slug}`} className="line-clamp-2 text-sm font-bold leading-snug text-white transition group-hover:text-accent sm:text-base">
          {e.title}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
          <span className="font-semibold text-zinc-300">{timeLabel(e.airDate, tz)} Uhr</span>
          {e.providers.length ? (
            <span className="flex flex-wrap items-center gap-1.5">
              {e.providers.map((p) => (
                <a
                  key={p.slug}
                  href={p.url}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-zinc-200 transition hover:border-accent/40 hover:text-white"
                  title={`${e.title} bei ${p.name} streamen`}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                  {p.name}
                </a>
              ))}
            </span>
          ) : (
            <span className="text-zinc-600">Anbieter folgt</span>
          )}
        </div>
      </div>
      <Countdown diff={diff} />
    </div>
  )
}

/** Countdown-Blöcke rechts (Tage/Std/Min/Sek); nach der Ausstrahlung „seit …". */
function Countdown({ diff }: { diff: number | null }) {
  const box = 'flex flex-col items-center rounded-lg bg-black/30 px-2 py-1 min-w-[2.75rem]'
  const num = 'text-lg font-extrabold tabular-nums leading-none text-white'
  const lbl = 'mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500'
  if (diff === null) {
    return <div className="hidden w-32 shrink-0 items-center justify-center border-l border-white/10 sm:flex" aria-hidden />
  }
  if (diff <= 0) {
    const ago = -diff
    const h = Math.floor(ago / 3600_000)
    const label = h < 1 ? 'gerade erschienen' : h < 24 ? `seit ${h} Std. verfügbar` : `seit ${Math.floor(h / 24)} Tag${Math.floor(h / 24) === 1 ? '' : 'en'} verfügbar`
    return (
      <div className="flex w-24 shrink-0 flex-col items-center justify-center gap-1 border-l border-white/10 bg-emerald-500/10 px-2 text-center sm:w-36">
        <span className="text-xs font-bold text-emerald-300">▶ Online</span>
        <span className="text-[10px] text-emerald-200/70">{label}</span>
      </div>
    )
  }
  const d = Math.floor(diff / 86_400_000)
  const h = Math.floor((diff % 86_400_000) / 3600_000)
  const m = Math.floor((diff % 3600_000) / 60_000)
  const s = Math.floor((diff % 60_000) / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <div className="flex shrink-0 items-center gap-1 border-l border-white/10 px-2 sm:gap-1.5 sm:px-3">
      {d > 0 ? (
        <div className={box}>
          <span className={num}>{d}</span>
          <span className={lbl}>{d === 1 ? 'Tag' : 'Tage'}</span>
        </div>
      ) : null}
      <div className={box}>
        <span className={num}>{pad(h)}</span>
        <span className={lbl}>Std</span>
      </div>
      <div className={box}>
        <span className={num}>{pad(m)}</span>
        <span className={lbl}>Min</span>
      </div>
      {d === 0 ? (
        <div className={`${box} hidden sm:flex`}>
          <span className={num}>{pad(s)}</span>
          <span className={lbl}>Sek</span>
        </div>
      ) : null}
    </div>
  )
}
