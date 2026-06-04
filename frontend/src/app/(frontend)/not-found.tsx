import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center">
      <p className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-7xl font-extrabold text-transparent">
        404
      </p>
      <h1 className="mt-4 text-2xl font-bold text-white">Seite nicht gefunden</h1>
      <p className="mt-3 max-w-prose text-zinc-400">
        Diese Seite gibt es nicht (mehr). Vielleicht hilft dir die Suche weiter, oder du stöberst durch die
        Anime-Datenbank.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Zur Startseite
        </Link>
        <Link
          href="/suche"
          className="rounded-lg border border-white/15 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-accent hover:text-accent"
        >
          Anime suchen
        </Link>
      </div>
    </main>
  )
}
