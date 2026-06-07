import Link from 'next/link'

// Übersichts-Grid: verlinkt ALLE Hauptbereiche der Seite (Index-Charakter der
// Startseite + interne Verlinkung für SEO).
const SECTIONS: { href: string; icon: string; label: string; desc: string }[] = [
  { href: '/anime', icon: '📚', label: 'Anime-Datenbank', desc: 'Alle Titel, filterbar nach Genre, Jahr & Stream' },
  { href: '/top-anime', icon: '⭐', label: 'Top-Anime', desc: 'Die besten Anime nach Community-Bewertung' },
  { href: '/kalender', icon: '🗓️', label: 'Simulcast-Kalender', desc: 'Welche Episoden wann erscheinen' },
  { href: '/genre', icon: '🏷️', label: 'Genres', desc: 'Action, Isekai, Romance, Fantasy & mehr' },
  { href: '/tag', icon: '🔖', label: 'Tags', desc: 'Feine Themen: Time Travel, Schule, Mecha …' },
  { href: '/studio', icon: '🎬', label: 'Studios', desc: 'MAPPA, ufotable, Kyoto Animation & Co.' },
  { href: '/character', icon: '👥', label: 'Charaktere', desc: 'Profile, Rollen & Auftritte' },
  { href: '/person', icon: '🎙️', label: 'Synchronsprecher', desc: 'Seiyū, Regie, Staff & Personen' },
  { href: '/season', icon: '📅', label: 'Seasons', desc: 'Jede Season & jedes Jahr im Archiv' },
  { href: '/plattform', icon: '🍿', label: 'Streaming', desc: 'Wo läuft was — Crunchyroll, Netflix & Co.' },
  { href: '/news', icon: '📰', label: 'News', desc: 'Ankündigungen & Simulcast-Updates' },
  { href: '/suche', icon: '🔍', label: 'Suche', desc: 'Genre, Jahr, Typ & Sprache frei kombinieren' },
]

export function SiteHubGrid() {
  return (
    <section className="mt-14">
      <h2 className="text-xl font-bold text-white">Alle Bereiche entdecken</h2>
      <p className="mt-1 text-sm text-zinc-400">Dein Einstieg in die komplette Anime-Datenbank.</p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-xl border border-white/10 bg-zinc-900/40 p-4 transition hover:-translate-y-0.5 hover:border-accent/50 hover:bg-zinc-900"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl" aria-hidden>
                {s.icon}
              </span>
              <span className="font-bold text-white transition group-hover:text-accent">{s.label}</span>
            </div>
            <p className="mt-1.5 text-xs leading-snug text-zinc-400">{s.desc}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
