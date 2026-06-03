import Link from 'next/link'

// Hochkant-Karte für Charaktere & Personen (Portrait + Name + Untertitel).
export function PortraitCard({
  href,
  imageUrl,
  title,
  subtitle,
}: {
  href: string
  imageUrl?: string | null
  title: string
  subtitle?: string | null
}) {
  return (
    <Link href={href} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-zinc-900 ring-1 ring-white/10">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={title}
            loading="lazy"
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-xs text-zinc-600">kein Bild</div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
      </div>
      <div className="mt-2">
        <h3 className="line-clamp-2 text-sm font-medium text-zinc-100 transition group-hover:text-accent">{title}</h3>
        {subtitle ? <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500">{subtitle}</p> : null}
      </div>
    </Link>
  )
}
