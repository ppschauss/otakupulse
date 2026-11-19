import Link from 'next/link'
import type { FooterColumn, NavLink } from '@/lib/navigation'
import { ConsentSettingsLink } from '@/components/ConsentSettingsLink'
import { DISCORD_INVITE, REDDIT_URL, TELEGRAM_CHANNEL, TUMBLR_URL, X_URL } from '@/lib/site'

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
            {/* Kanäle als Fließtext: Buttons gibt es einmal im Header, hier bewusst andere Linktexte
                als in der Community-Spalte. */}
            <p className="mt-4 max-w-prose">
              Mitreden kannst du in unserem{' '}
              <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" className="text-zinc-300 underline-offset-2 transition hover:text-accent hover:underline">Anime-Discord</a>{' '}
              und im Subreddit{' '}
              <a href={REDDIT_URL} target="_blank" rel="noopener noreferrer" className="text-zinc-300 underline-offset-2 transition hover:text-accent hover:underline">r/OtakuPulseDe</a>. Neue Folgen und Lizenz-News kommen über den{' '}
              <a href={TELEGRAM_CHANNEL} target="_blank" rel="noopener noreferrer" className="text-zinc-300 underline-offset-2 transition hover:text-accent hover:underline">OtakuPulse-Telegram</a>, außerdem posten wir als{' '}
              <a href={X_URL} target="_blank" rel="noopener noreferrer" className="text-zinc-300 underline-offset-2 transition hover:text-accent hover:underline">@OtakuPulseDE auf X</a> und auf dem{' '}
              <a href={TUMBLR_URL} target="_blank" rel="noopener noreferrer" className="text-zinc-300 underline-offset-2 transition hover:text-accent hover:underline">OtakuPulse-Tumblr</a>.
            </p>
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
              <li>
                <a href={TUMBLR_URL} target="_blank" rel="noopener" className="transition hover:text-accent">
                  Tumblr
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
