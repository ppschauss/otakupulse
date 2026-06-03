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
