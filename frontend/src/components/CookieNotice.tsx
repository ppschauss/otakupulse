'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'op-cookie-ack'

/**
 * Dezenter Cookie-/Datenschutz-Hinweis. Die Seite setzt keine Tracking-Cookies
 * (Analytics ist cookieless), daher ist dies ein informierender Hinweis mit
 * Bestätigung — keine Einwilligungs-Schranke. Auswahl wird in localStorage
 * gespeichert (kein Cookie nötig).
 */
export function CookieNotice() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true)
    } catch {
      /* localStorage blockiert → Hinweis nicht zeigen */
    }
  }, [])

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* ignore */
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Cookie-Hinweis"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-3xl rounded-2xl border border-white/10 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-md sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-300">
          Wir verwenden nur technisch notwendige Cookies und setzen{' '}
          <span className="font-medium text-zinc-100">keine Tracking-Cookies</span>. Mehr dazu in der{' '}
          <Link href="/datenschutz" className="font-medium text-accent underline-offset-2 hover:underline">
            Datenschutzerklärung
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={accept}
          className="shrink-0 rounded-full bg-gradient-to-r from-accent to-accent-2 px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
        >
          Verstanden
        </button>
      </div>
    </div>
  )
}
