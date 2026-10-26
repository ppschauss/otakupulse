import Link from 'next/link'
import type { FooterColumn, NavLink } from '@/lib/navigation'
import { ConsentSettingsLink } from '@/components/ConsentSettingsLink'
import { DISCORD_INVITE, TELEGRAM_CHANNEL, X_URL } from '@/lib/site'

const ext = (href: string) => href.startsWith('http')

export function Footer({ columns, legal, lists = [] }: { columns: FooterColumn[]; legal: NavLink[]; lists?: { href: string; label: string }[] }) {
  return (
    <footer className="mt-20 border-t border-white/10">
      <div className="mx-auto max-w-6xl px-4 py-12 text-sm text-zinc-500">
        <div className={`grid gap-8 sm:grid-cols-2 ${lists.length ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
          <div>
            <p className="text-base font-extrabold">
              <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">Otaku</span>
              <span className="text-zinc-200">Pulse</span>
            </p>
            <p className="mt-2 max-w-prose">
              Deutschsprachige Anime-Datenbank — Anime, Charaktere, Studios, Kalender und News. Daten u.&nbsp;a. von
              AniList.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={DISCORD_INVITE}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4752c4]"
              >
                <svg viewBox="0 0 127.14 96.36" aria-hidden="true" className="h-4 w-4 fill-current">
                  <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
                </svg>
                Discord
              </a>
              <a
                href={TELEGRAM_CHANNEL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-[#229ED9] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#1b86ba]"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-current">
                  <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
                </svg>
                Telegram
              </a>
              <a
                href={X_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-zinc-800"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                X
              </a>
            </div>
          </div>
          {columns.map((col, ci) => (
            <div key={`${col.title}-${ci}`}>
              <p className="mb-3 font-bold uppercase tracking-wide text-zinc-400">{col.title}</p>
              <ul className="space-y-2">
                {col.links.map((l, li) => (
                  <li key={`${l.href}-${li}`}>
                    <Link
                      href={l.href}
                      {...(ext(l.href) ? { target: '_blank', rel: 'noopener' } : {})}
                      className="transition hover:text-accent"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Community / Socials */}
          <div>
            <p className="mb-3 font-bold uppercase tracking-wide text-zinc-400">Community</p>
            <ul className="space-y-2">
              <li>
                <Link href="/anime-discord-server" className="transition hover:text-accent">
                  Anime-Discord-Server
                </Link>
              </li>
              <li>
                <Link href="/anime-telegram-kanal" className="transition hover:text-accent">
                  Anime-Telegram-Kanal
                </Link>
              </li>
              <li>
                <a href={X_URL} target="_blank" rel="noopener" className="transition hover:text-accent">
                  Twitter / X
                </a>
              </li>
            </ul>
          </div>
          {lists.length ? (
            <div>
              {/* Streaming-Listen: die größten Dub-/Gratis-Listen, site-weit verlinkt (interne Links auf die Intent-Seiten). */}
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-400">Streaming-Listen</p>
              <ul className="space-y-1.5">
                {lists.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="transition hover:text-accent">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} OtakuPulse — privates Projekt, anteilig werbefinanziert.</p>
          {/* flex-wrap: fünf Einträge passen mobil nicht in eine Zeile — ohne Umbruch
              lief die Leiste rechts aus dem Viewport (horizontaler Layout-Shift). */}
          <nav className="flex flex-wrap gap-x-5 gap-y-2">
            {legal.map((l, i) => (
              <Link
                key={`${l.href}-${i}`}
                href={l.href}
                {...(ext(l.href) ? { target: '_blank', rel: 'noopener' } : {})}
                className="transition hover:text-accent"
              >
                {l.label}
              </Link>
            ))}
            <Link href="/ueber-uns" className="transition hover:text-accent">
              Über uns
            </Link>
            {/* Nutzungsbedingungen fest ergänzt (Pflichtseite, u. a. für Google Publisher Center). */}
            <Link href="/nutzungsbedingungen" className="transition hover:text-accent">
              Nutzungsbedingungen
            </Link>
            <ConsentSettingsLink className="transition hover:text-accent" />
          </nav>
        </div>
      </div>
    </footer>
  )
}
