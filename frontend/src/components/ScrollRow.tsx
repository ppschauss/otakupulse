'use client'

import { useRef } from 'react'
import Link from 'next/link'

// Generische horizontale Scroll-Reihe mit Hover-Pfeilen (Crunchyroll-Stil).
// Nimmt beliebige Karten als children.
export function ScrollRow({
  title,
  href,
  children,
}: {
  title?: string
  href?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const scroll = (dir: number) => {
    const el = ref.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  return (
    <section className="group/row relative">
      {title ? (
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-bold text-white sm:text-xl">
            <span className="mr-2 inline-block h-4 w-1 translate-y-0.5 rounded bg-gradient-to-b from-accent to-accent-2 align-middle" />
            {title}
          </h2>
          {href ? (
            <Link href={href} className="text-sm font-medium text-zinc-400 transition hover:text-accent">
              Alle ansehen →
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="relative">
        <button
          type="button"
          aria-label="Zurück"
          onClick={() => scroll(-1)}
          className="absolute -left-3 top-0 z-20 hidden h-full w-12 items-center justify-start rounded-l-xl bg-gradient-to-r from-zinc-950 to-transparent text-2xl text-white opacity-0 transition group-hover/row:opacity-100 sm:flex"
        >
          ‹
        </button>

        <div ref={ref} className="no-scrollbar flex snap-x gap-3 overflow-x-auto scroll-smooth pb-2">
          {children}
        </div>

        <button
          type="button"
          aria-label="Weiter"
          onClick={() => scroll(1)}
          className="absolute -right-3 top-0 z-20 hidden h-full w-12 items-center justify-end rounded-r-xl bg-gradient-to-l from-zinc-950 to-transparent text-2xl text-white opacity-0 transition group-hover/row:opacity-100 sm:flex"
        >
          ›
        </button>
      </div>
    </section>
  )
}
