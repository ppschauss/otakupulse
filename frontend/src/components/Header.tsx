'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import type { NavLink } from '@/lib/navigation'

function isActive(pathname: string, href: string) {
  if (href.startsWith('http')) return false
  return href === '/' ? pathname === '/' : pathname.startsWith(href)
}

function SearchForm({ onSubmit, autoWidth }: { onSubmit?: () => void; autoWidth?: boolean }) {
  return (
    <form action="/suche" method="get" onSubmit={onSubmit} className={autoWidth ? 'relative sm:w-64' : 'relative w-full'}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">🔍</span>
      <input
        type="text"
        name="q"
        placeholder="Anime suchen…"
        className="w-full rounded-full border border-white/10 bg-zinc-900/70 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 transition focus:border-accent focus:bg-zinc-900 focus:outline-none focus:ring-1 focus:ring-accent"
      />
    </form>
  )
}

export function Header({ nav }: { nav: NavLink[] }) {
  const pathname = usePathname() || '/'
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        {/* Logo */}
        <Link href="/" onClick={close} className="shrink-0 text-xl font-extrabold tracking-tight">
          <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">Otaku</span>
          <span className="text-white">Pulse</span>
        </Link>

        {/* Desktop-Navigation */}
        <nav className="hidden items-center gap-0.5 text-sm md:flex">
          {nav.map((n, i) => {
            const active = isActive(pathname, n.href)
            const ext = n.href.startsWith('http')
            return (
              <Link
                key={`${n.href}-${i}`}
                href={n.href}
                {...(ext ? { target: '_blank', rel: 'noopener' } : {})}
                className={`rounded-md px-3 py-1.5 font-medium transition ${
                  active ? 'bg-white/10 text-white' : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                {n.label}
                {active ? <span className="mx-auto mt-0.5 block h-0.5 w-4 rounded bg-gradient-to-r from-accent to-accent-2" /> : null}
              </Link>
            )
          })}
        </nav>

        {/* Desktop: Suche (rechts) */}
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <SearchForm autoWidth />
        </div>

        {/* Mobile: Hamburger */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Menü öffnen"
          aria-expanded={open}
          className="ml-auto grid h-10 w-10 place-items-center rounded-lg border border-white/10 text-zinc-200 transition hover:bg-white/5 md:hidden"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile-Panel (aufklappend) */}
      <div
        className={`overflow-hidden border-t border-white/10 transition-[max-height] duration-300 ease-out md:hidden ${
          open ? 'max-h-[34rem]' : 'max-h-0 border-transparent'
        }`}
      >
        <div className="space-y-1 px-4 pb-5 pt-4">
          <div className="mb-2">
            <SearchForm onSubmit={close} />
          </div>
          {nav.map((n, i) => {
            const active = isActive(pathname, n.href)
            const ext = n.href.startsWith('http')
            return (
              <Link
                key={`${n.href}-${i}`}
                href={n.href}
                onClick={close}
                {...(ext ? { target: '_blank', rel: 'noopener' } : {})}
                className={`block rounded-lg px-3 py-2.5 text-base font-medium transition ${
                  active
                    ? 'bg-gradient-to-r from-accent/20 to-accent-2/20 text-white ring-1 ring-white/10'
                    : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                {n.label}
              </Link>
            )
          })}
          <Link href="/suche" onClick={close} className="block rounded-lg px-3 py-2.5 text-base font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white">
            🔍 Suche
          </Link>
        </div>
      </div>
    </header>
  )
}
