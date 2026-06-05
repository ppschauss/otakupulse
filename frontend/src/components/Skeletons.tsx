// Platzhalter (Pulse), die während des Streamings angezeigt werden.

export function RowSkeleton({ title }: { title: string }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold text-white sm:text-xl">
        <span className="mr-2 inline-block h-4 w-1 translate-y-0.5 rounded bg-gradient-to-b from-accent to-accent-2 align-middle" />
        {title}
      </h2>
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="w-[8.5rem] shrink-0 sm:w-40 md:w-44">
            <div className="aspect-[2/3] animate-pulse rounded-xl bg-zinc-900 ring-1 ring-white/10" />
            <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-zinc-900" />
          </div>
        ))}
      </div>
    </section>
  )
}

export function HeroSkeleton() {
  return <div className="h-[22rem] w-full animate-pulse rounded-2xl bg-zinc-900 ring-1 ring-white/10 sm:h-[26rem]" />
}

export function BoxSkeleton() {
  return <div className="h-44 w-full animate-pulse rounded-xl bg-zinc-900 ring-1 ring-white/10" />
}

function Box({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-white/5 ${className}`} />
}

/** Raster aus Hochkant-Karten (Anime, Charaktere, Personen, Studios, Plattformen). */
export function CardGridSkeleton({ count = 14 }: { count?: number }) {
  return (
    <div className="mt-6 grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i}>
          <Box className="aspect-[2/3] w-full" />
          <Box className="mt-2 h-3 w-3/4" />
        </div>
      ))}
    </div>
  )
}

/** Standard-Listenseite: Titel, Filterleiste, Karten-Raster. */
export function ListingSkeleton({ maxW = 'max-w-6xl', withFilters = true }: { maxW?: string; withFilters?: boolean }) {
  return (
    <main className={`mx-auto ${maxW} px-4 py-10`}>
      <Box className="h-7 w-48" />
      <Box className="mt-2 h-4 w-32" />
      {withFilters ? (
        <div className="mt-5 flex flex-wrap gap-3">
          <Box className="h-10 w-64" />
          <Box className="h-10 w-40" />
          <Box className="h-10 w-40" />
        </div>
      ) : null}
      <CardGridSkeleton />
    </main>
  )
}

/** Taxonomie-Übersicht (Genres, Tags): Titel + Pillen-Reihen. */
export function ChipsSkeleton({ maxW = 'max-w-5xl', rows = 24 }: { maxW?: string; rows?: number }) {
  const widths = ['w-20', 'w-28', 'w-24', 'w-32', 'w-16', 'w-36', 'w-24', 'w-20']
  return (
    <main className={`mx-auto ${maxW} px-4 py-10`}>
      <Box className="h-7 w-40" />
      <Box className="mt-2 h-4 w-48" />
      <div className="mt-8 flex flex-wrap gap-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Box key={i} className={`h-8 rounded-full ${widths[i % widths.length]}`} />
        ))}
      </div>
    </main>
  )
}

/** Detailseite: Bild + Titel + Textzeilen + Karten-Raster. */
export function DetailSkeleton({ maxW = 'max-w-5xl' }: { maxW?: string }) {
  return (
    <main className={`mx-auto ${maxW} px-4 py-10`}>
      <Box className="h-4 w-64" />
      <div className="mt-6 flex flex-col gap-6 sm:flex-row">
        <Box className="aspect-[2/3] w-40 shrink-0" />
        <div className="flex-1 space-y-3">
          <Box className="h-7 w-2/3" />
          <Box className="h-4 w-1/3" />
          <Box className="mt-4 h-4 w-full" />
          <Box className="h-4 w-full" />
          <Box className="h-4 w-4/5" />
        </div>
      </div>
      <CardGridSkeleton count={7} />
    </main>
  )
}
