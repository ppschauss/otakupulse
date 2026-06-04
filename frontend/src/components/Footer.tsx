import Link from 'next/link'

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Entdecken',
    links: [
      { href: '/anime', label: 'Anime-Datenbank' },
      { href: '/top-anime', label: 'Top-Anime' },
      { href: '/kalender', label: 'Simulcast-Kalender' },
      { href: '/season', label: 'Seasons' },
      { href: '/suche', label: 'Suche' },
    ],
  },
  {
    title: 'Katalog',
    links: [
      { href: '/character', label: 'Charaktere' },
      { href: '/person', label: 'Personen' },
      { href: '/studio', label: 'Studios' },
    ],
  },
  {
    title: 'Stöbern',
    links: [
      { href: '/genre', label: 'Genres' },
      { href: '/tag', label: 'Tags' },
      { href: '/plattform', label: 'Plattformen' },
      { href: '/news', label: 'News' },
    ],
  },
]

export function Footer() {
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
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="mb-3 font-bold uppercase tracking-wide text-zinc-400">{col.title}</p>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="transition hover:text-accent">
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
            <Link href="/impressum" className="transition hover:text-accent">
              Impressum
            </Link>
            <Link href="/datenschutz" className="transition hover:text-accent">
              Datenschutz
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
