import { AnimeCard } from './AnimeCard'
import { ScrollRow } from './ScrollRow'

// Anime-Scroll-Reihe (nutzt die generische ScrollRow).
export function MediaRow({ title, href, items }: { title?: string; href?: string; items: any[] }) {
  if (!items?.length) return null
  return (
    <ScrollRow title={title} href={href}>
      {items.map((a: any) => (
        <div key={a.id} className="w-[8.5rem] shrink-0 snap-start sm:w-40 md:w-44">
          <AnimeCard anime={a} />
        </div>
      ))}
    </ScrollRow>
  )
}
