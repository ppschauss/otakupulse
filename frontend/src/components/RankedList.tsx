import Link from 'next/link'
import Image from 'next/image'
import { displayTitle, formatLabel, animeCover } from '@/lib/anime'

// Nummerierte Ranking-Liste (für Top-Anime-Seiten).
export function RankedList({ items, startRank = 1 }: { items: any[]; startRank?: number }) {
  return (
    <ol className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40">
      {items.map((a: any, i: number) => (
        <li key={a.id}>
          <Link href={`/anime/${a.slug}`} className="group flex items-center gap-4 px-4 py-3 transition hover:bg-white/5">
            <span className="w-8 shrink-0 text-center text-lg font-extrabold text-zinc-600 group-hover:text-accent">
              {startRank + i}
            </span>
            {animeCover(a) ? (
              <Image src={animeCover(a)!} alt="" width={48} height={64} className="h-16 w-12 shrink-0 rounded object-cover" />
            ) : (
              <div className="h-16 w-12 shrink-0 rounded bg-zinc-800" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-zinc-100 group-hover:text-accent">{displayTitle(a)}</p>
              <p className="text-xs text-zinc-500">
                {formatLabel(a.format)}
                {a.seasonYear ? ` · ${a.seasonYear}` : ''}
              </p>
            </div>
            {typeof a.averageScore === 'number' && a.averageScore > 0 ? (
              <span className="shrink-0 rounded-md bg-emerald-500/15 px-2 py-1 text-sm font-bold text-emerald-400">
                {a.averageScore}%
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ol>
  )
}
