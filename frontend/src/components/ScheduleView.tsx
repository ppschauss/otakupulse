import { getPayload } from 'payload'
import config from '@payload-config'
import { Schedule } from '@/components/Schedule'
import { JsonLd } from '@/components/JsonLd'
import { berlinYmd, loadScheduleEpisodes, monthGrid, scheduleGenres, shiftYmd } from '@/lib/schedule'
import { url } from '@/lib/site'

/** Gemeinsamer Renderer für /kalender (heute) und /kalender/YYYY-MM-DD. */
export async function ScheduleView({ selected, genre, path }: { selected: string; genre?: string; path: string }) {
  const payload = await getPayload({ config })
  const { year, month, days } = monthGrid(selected)
  const episodes = await loadScheduleEpisodes(payload, days)
  const genres = await scheduleGenres(payload, episodes)
  const today = berlinYmd(new Date())
  const prevMonth = `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, '0')}-01`
  const nextMonth = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`
  // Für Google: die Episoden des gewählten Tages als ItemList (Anime-Seiten).
  const todayEps = episodes.filter((e) => e.airDate.slice(0, 10) === selected || berlinYmd(new Date(e.airDate)) === selected)
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: `Anime-Episoden am ${selected}`,
          url: url(path),
          itemListElement: todayEps.slice(0, 50).map((e, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: url(`/anime/${e.slug}`),
            name: `${e.title} – Episode ${e.number}`,
          })),
        }}
      />
      <Schedule
        days={days}
        year={year}
        month={month}
        episodes={episodes}
        selected={selected}
        today={today}
        genres={genres}
        genre={genre}
        prevMonth={prevMonth}
        nextMonth={nextMonth}
      />
      <noscript>
        <ul className="mt-4 space-y-1 text-sm text-zinc-300">
          {todayEps.map((e) => (
            <li key={e.id}>
              <a href={`/anime/${e.slug}`}>{e.title}</a> – Episode {e.number} ({new Date(e.airDate).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })})
            </li>
          ))}
        </ul>
      </noscript>
      <p className="mt-6 text-xs text-zinc-500">
        Alle Sendezeiten sind Erstveröffentlichungen beim jeweiligen Anbieter in Deutschland. Der Kalender wird mehrmals täglich
        aktualisiert; die Uhrzeit erscheint in der Zeitzone deines Geräts.{' '}
        {prevMonth ? (
          <a href={`/kalender/${shiftYmd(selected, -7)}`} className="hover:text-accent">
            Vorherige Woche
          </a>
        ) : null}
      </p>
    </>
  )
}

