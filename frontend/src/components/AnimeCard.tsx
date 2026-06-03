import Link from 'next/link'
import { displayTitle, formatLabel, statusLabel, animeCover } from '@/lib/anime'

export function AnimeCard({ anime }: { anime: any }) {
  const title = displayTitle(anime)
  const score = typeof anime.averageScore === 'number' ? anime.averageScore : null
  const cover = animeCover(anime)

  return (
    <Link href={`/anime/${anime.slug}`} className="group block">
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/10 transition duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-accent/20 group-hover:ring-accent/60">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-zinc-600">kein Bild</div>
        )}

        {/* Score-Badge */}
        {score && score > 0 ? (
          <span className="absolute right-2 top-2 z-10 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-bold text-emerald-400 backdrop-blur">
            ★ {score}%
          </span>
        ) : null}

        {/* Verlauf unten */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/90 to-transparent" />

        {/* Hover-Overlay mit Play-Button + Quick-Infos */}
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 opacity-0 backdrop-blur-[1px] transition duration-300 group-hover:opacity-100">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-accent/90 text-xl text-white shadow-lg ring-4 ring-white/10">
            ▶
          </span>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 p-3 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <p className="line-clamp-2 text-sm font-bold leading-tight text-white">{title}</p>
          <p className="mt-1 text-[11px] text-zinc-300">
            {formatLabel(anime.format)}
            {anime.status ? ` · ${statusLabel(anime.status)}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-2">
        <h3 className="line-clamp-2 text-sm font-medium text-zinc-100 transition group-hover:text-accent">{title}</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          {formatLabel(anime.format)}
          {anime.seasonYear ? ` · ${anime.seasonYear}` : ''}
        </p>
      </div>
    </Link>
  )
}
