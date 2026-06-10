'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import type { NavLink } from '@/lib/navigation'
import { DISCORD_INVITE } from '@/lib/site'

function isActive(pathname: string, href: string) {
  if (href.startsWith('http')) return false
  return href === '/' ? pathname === '/' : pathname.startsWith(href)
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 127.14 96.36" aria-hidden="true" className={className}>
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
    </svg>
  )
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

        {/* Desktop: Suche + Discord (rechts) */}
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <SearchForm autoWidth />
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Community-Discord beitreten"
            title="Community-Discord"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#5865F2] text-white transition hover:bg-[#4752c4]"
          >
            <DiscordIcon className="h-4 w-4 fill-current" />
          </a>
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
          open ? 'max-h-[42rem]' : 'max-h-0 border-transparent'
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
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            className="mt-1 flex items-center gap-2 rounded-lg bg-[#5865F2] px-3 py-2.5 text-base font-semibold text-white transition hover:bg-[#4752c4]"
          >
            <DiscordIcon className="h-5 w-5 fill-current" />
            Community-Discord
          </a>
        </div>
      </div>
    </header>
  )
}
