'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Im Server-Log landet der echte Stack; hier nur eine knappe Notiz.
    console.error('Frontend-Fehler:', error)
  }, [error])

  return (
    <main className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center">
      <p className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-7xl font-extrabold text-transparent">
        Ups
      </p>
      <h1 className="mt-4 text-2xl font-bold text-white">Da ist etwas schiefgelaufen</h1>
      <p className="mt-3 max-w-prose text-zinc-400">
        Beim Laden dieser Seite ist ein unerwarteter Fehler aufgetreten. Versuch es bitte erneut — wenn es weiter hakt,
        schau später noch einmal vorbei.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          onClick={() => reset()}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Erneut versuchen
        </button>
        <Link
          href="/"
          className="rounded-lg border border-white/15 px-5 py-2.5 text-sm font-semibold text-zinc-200 transition hover:border-accent hover:text-accent"
        >
          Zur Startseite
        </Link>
      </div>
    </main>
  )
}
