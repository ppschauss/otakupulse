'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import type { NavLink } from '@/lib/navigation'
import { DISCORD_INVITE, REDDIT_URL, TELEGRAM_CHANNEL, TUMBLR_URL, X_URL } from '@/lib/site'

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

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function RedditIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 3.314 1.343 6.314 3.515 8.485l-2.286 2.286C.775 23.225 1.097 24 1.738 24H12c6.627 0 12-5.373 12-12S18.627 0 12 0Zm4.388 3.199c1.104 0 1.999.895 1.999 1.999 0 1.105-.895 2-1.999 2-.946 0-1.739-.657-1.947-1.539v.002c-1.147.162-2.032 1.15-2.032 2.341v.007c1.776.067 3.4.567 4.686 1.363.473-.363 1.064-.58 1.707-.58 1.547 0 2.802 1.254 2.802 2.802 0 1.117-.655 2.081-1.601 2.531-.088 3.256-3.637 5.876-7.997 5.876-4.361 0-7.905-2.617-7.998-5.87-.954-.447-1.614-1.415-1.614-2.538 0-1.548 1.255-2.802 2.803-2.802.645 0 1.239.218 1.712.585 1.275-.79 2.881-1.291 4.64-1.365v-.01c0-1.663 1.263-3.034 2.88-3.207.188-.911.993-1.595 1.959-1.595Zm-8.085 8.376c-.784 0-1.459.78-1.506 1.797-.047 1.016.64 1.429 1.426 1.429.786 0 1.371-.369 1.418-1.385.047-1.017-.553-1.841-1.338-1.841Zm7.406 0c-.786 0-1.385.824-1.338 1.841.047 1.017.634 1.385 1.418 1.385.785 0 1.473-.413 1.426-1.429-.046-1.017-.721-1.797-1.506-1.797Zm-3.703 4.013c-.974 0-1.907.048-2.77.135-.147.015-.241.168-.183.305.483 1.154 1.622 1.964 2.953 1.964 1.33 0 2.47-.81 2.953-1.964.057-.137-.037-.29-.184-.305-.863-.087-1.795-.135-2.769-.135Z" />
    </svg>
  )
}

function TumblrIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M14.563 24c-5.093 0-7.031-3.756-7.031-6.411V9.747H5.116V6.648c3.63-1.313 4.512-4.596 4.71-6.469C9.84.051 9.941 0 9.999 0h3.517v6.114h4.801v3.633h-4.82v7.47c.016 1.001.375 2.371 2.207 2.371h.09c.631-.02 1.486-.205 1.936-.419l1.156 3.425c-.436.636-2.4 1.374-4.156 1.404h-.178l.011.002z" />
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

        {/* Desktop: Suche + Kanal-Buttons (rechts) */}
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <SearchForm autoWidth />
          {/* Kanal-Buttons erst ab lg: zwischen md und lg passten Navigation, Suche und Buttons nicht
              in eine Zeile (Seite lief bei 768–930 px seitlich über). Dort tragen die Footer-Textlinks. */}
          <div className="hidden items-center gap-2 lg:flex">
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
            <a
              href={TELEGRAM_CHANNEL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Telegram-Kanal abonnieren"
              title="Anime-News auf Telegram"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#229ED9] text-white transition hover:bg-[#1b86ba]"
            >
              <TelegramIcon className="h-4 w-4 fill-current" />
            </a>
            <a
              href={X_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="OtakuPulse auf X / Twitter folgen"
              title="OtakuPulse auf X"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-black text-white ring-1 ring-white/15 transition hover:bg-zinc-800"
            >
              <XIcon className="h-3.5 w-3.5 fill-current" />
            </a>
            <a
              href={REDDIT_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="OtakuPulse-Community auf Reddit"
              title="r/OtakuPulseDe auf Reddit"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#FF4500] text-white transition hover:bg-[#d93a00]"
            >
              <RedditIcon className="h-4 w-4 fill-current" />
            </a>
            <a
              href={TUMBLR_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="OtakuPulse auf Tumblr folgen"
              title="OtakuPulse auf Tumblr"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#001935] text-white ring-1 ring-white/15 transition hover:bg-[#0b2a4d]"
            >
              <TumblrIcon className="h-4 w-4 fill-current" />
            </a>
          </div>
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
          open ? 'max-h-[52rem]' : 'max-h-0 border-transparent'
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
          <a
            href={TELEGRAM_CHANNEL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            className="mt-1 flex items-center gap-2 rounded-lg bg-[#229ED9] px-3 py-2.5 text-base font-semibold text-white transition hover:bg-[#1b86ba]"
          >
            <TelegramIcon className="h-5 w-5 fill-current" />
            Anime-News auf Telegram
          </a>
          <a
            href={X_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            className="mt-1 flex items-center gap-2 rounded-lg bg-black px-3 py-2.5 text-base font-semibold text-white ring-1 ring-white/15 transition hover:bg-zinc-800"
          >
            <XIcon className="h-4 w-4 fill-current" />
            OtakuPulse auf X
          </a>
          <a
            href={REDDIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            className="mt-1 flex items-center gap-2 rounded-lg bg-[#FF4500] px-3 py-2.5 text-base font-semibold text-white transition hover:bg-[#d93a00]"
          >
            <RedditIcon className="h-5 w-5 fill-current" />
            r/OtakuPulseDe auf Reddit
          </a>
          <a
            href={TUMBLR_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            className="mt-1 flex items-center gap-2 rounded-lg bg-[#001935] px-3 py-2.5 text-base font-semibold text-white ring-1 ring-white/15 transition hover:bg-[#0b2a4d]"
          >
            <TumblrIcon className="h-4 w-4 fill-current" />
            OtakuPulse auf Tumblr
          </a>
        </div>
      </div>
    </header>
  )
}
