import Link from 'next/link'
import type { FooterColumn, NavLink } from '@/lib/navigation'
import { ConsentSettingsLink } from '@/components/ConsentSettingsLink'

const ext = (href: string) => href.startsWith('http')

export function Footer({ columns, legal }: { columns: FooterColumn[]; legal: NavLink[] }) {
  return (
    <footer className="mt-20 border-t border-white/10">
      <div className="mx-auto max-w-6xl px-4 py-12 text-sm text-zinc-500">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <p className="text-base font-extrabold">
              <span className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-transparent">Otaku</span>
              <span className="text-zinc-200">Pulse</span>
            </p>
            <p className="mt-2 max-w-prose">
              Deutschsprachige Anime-Datenbank — Anime, Charaktere, Studios, Kalender und News. Daten u.&nbsp;a. von
              AniList.
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
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} OtakuPulse — privates, nicht-kommerzielles Projekt.</p>
          <nav className="flex gap-5">
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
            <ConsentSettingsLink className="transition hover:text-accent" />
          </nav>
        </div>
      </div>
    </footer>
  )
}
