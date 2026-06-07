'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Fsk18Overlay } from './Fsk18Overlay'

// Client-seitige Altersfreigabe für Hentai-Cover. Der Blur bleibt server-seitig
// vorgerendert (auch ohne JS sichtbar); hier wird er nur entfernt, NACHDEM der
// User selbst bestätigt hat, 18+ zu sein. Die Freigabe wird in localStorage
// gemerkt und gilt global (alle Hentai-Bilder, alle Seiten).
//
// - `interactive`: zeigt den Button „Inhalte anzeigen (18+)" + Ja/Nein-Abfrage
//   (für das große Cover der Detailseite). Sonst nur das statische FSK-18-Siegel,
//   das ebenfalls auf die globale Freigabe reagiert (Karten, Banner, Listen …).
// - „Nein" → Weiterleitung auf die Anime-Übersicht.

const KEY = 'otp:adultOk'
const EVENT = 'otp:adultok'

export function AdultGate({
  size = 'md',
  rounded = 'rounded-xl',
  interactive = false,
}: {
  size?: 'sm' | 'md'
  rounded?: string
  interactive?: boolean
}) {
  const router = useRouter()
  const [unlocked, setUnlocked] = useState(false)
  const [asking, setAsking] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === '1') setUnlocked(true)
    } catch {
      /* localStorage nicht verfügbar → bleibt gesperrt */
    }
    const onUnlock = () => setUnlocked(true)
    window.addEventListener(EVENT, onUnlock)
    return () => window.removeEventListener(EVENT, onUnlock)
  }, [])

  if (unlocked) return null

  // Nicht-interaktiv: nur das Siegel (reagiert via Event/localStorage auf Freigabe).
  if (!interactive) return <Fsk18Overlay size={size} rounded={rounded} />

  const confirm = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(EVENT))
    setUnlocked(true)
  }
  const deny = () => router.push('/anime')

  return (
    <div
      className={`absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/45 p-2 text-center backdrop-blur-xl ${rounded}`}
    >
      {!asking ? (
        <>
          <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-red-600 text-sm font-black leading-none text-white">
            18
          </span>
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="rounded-md bg-white px-2.5 py-1.5 text-[11px] font-bold leading-tight text-black shadow transition hover:bg-white/90"
          >
            Inhalte anzeigen
            <br />
            (18+)
          </button>
        </>
      ) : (
        <>
          <p className="text-[11px] font-semibold leading-snug text-white">
            Bist du 18 Jahre
            <br />
            oder älter?
          </p>
          <div className="flex w-full flex-col gap-1.5 px-1">
            <button
              type="button"
              onClick={confirm}
              className="rounded-md bg-emerald-500 px-2 py-1.5 text-[11px] font-bold text-white shadow transition hover:bg-emerald-400"
            >
              Ja, ich bin 18+
            </button>
            <button
              type="button"
              onClick={deny}
              className="rounded-md bg-white/15 px-2 py-1.5 text-[11px] font-medium text-white ring-1 ring-white/25 transition hover:bg-white/25"
            >
              Nein
            </button>
          </div>
        </>
      )}
    </div>
  )
}
