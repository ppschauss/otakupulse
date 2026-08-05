'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import {
  CATEGORY_INFO,
  CONSENT_ALL,
  CONSENT_NONE,
  type Consent,
  OPEN_CONSENT_EVENT,
  readConsent,
  writeConsent,
} from '@/lib/consent'

/**
 * Granularer Cookie-Consent: Banner + Einstellungen-Dialog. Notwendige Cookies
 * sind immer aktiv; Statistik/Marketing sind opt-in. Skripte (siehe Analytics)
 * werden erst nach Zustimmung geladen. Re-Öffnen via openConsentSettings().
 */
export function CookieConsent() {
  const [phase, setPhase] = useState<'hidden' | 'banner' | 'settings'>('hidden')
  const [draft, setDraft] = useState<Consent>(CONSENT_NONE)

  useEffect(() => {
    const existing = readConsent()
    if (existing) setDraft(existing)
    else setPhase('banner')
    const open = () => {
      setDraft(readConsent() ?? CONSENT_NONE)
      setPhase('settings')
    }
    window.addEventListener(OPEN_CONSENT_EVENT, open)
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, open)
  }, [])

  const save = (c: Consent) => {
    writeConsent(c)
    setPhase('hidden')
  }

  if (phase === 'hidden') return null

  // Banner: nur unten angedockt (blockiert die Seite NICHT). Einstellungen: modal
  // mit Dimmer, der die Seite bewusst sperrt.
  const isModal = phase === 'settings'
  return (
    <div
      className={
        isModal
          ? 'fixed inset-0 z-[70] flex items-end justify-center p-3 sm:items-center'
          : 'pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex justify-center p-3'
      }
    >
      {isModal ? <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" /> : null}

      <div
        role="dialog"
        aria-modal={isModal}
        aria-label="Cookie-Einstellungen"
        className="pointer-events-auto relative w-full max-w-2xl rounded-2xl border border-white/10 bg-zinc-900/95 p-5 shadow-2xl backdrop-blur-md sm:p-6"
      >
        <h2 className="text-lg font-bold text-white">
          {phase === 'banner' ? 'Datenschutz & Cookies' : 'Cookie-Einstellungen'}
        </h2>
        <p className="mt-2 text-sm text-zinc-300">
          Wir nutzen technisch notwendige Cookies und – nur mit deiner Einwilligung – optionale Dienste zur
          Reichweitenmessung. Du kannst frei wählen und deine Auswahl jederzeit ändern. Mehr in der{' '}
          <Link href="/datenschutz" className="font-medium text-accent underline-offset-2 hover:underline">
            Datenschutzerklärung
          </Link>
          .
        </p>

        {phase === 'settings' ? (
          <div className="mt-4 space-y-3">
            <Category label="Notwendig" description="Für den Betrieb der Seite erforderlich. Immer aktiv." checked disabled />
            {CATEGORY_INFO.map((c) => (
              <Category
                key={c.key}
                label={c.label}
                description={c.description}
                checked={draft[c.key]}
                onChange={(v) => setDraft((d) => ({ ...d, [c.key]: v }))}
              />
            ))}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {phase === 'banner' ? (
            <button
              type="button"
              onClick={() => setPhase('settings')}
              className="rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
            >
              Einstellungen
            </button>
          ) : (
            <button
              type="button"
              onClick={() => save(draft)}
              className="rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
            >
              Auswahl speichern
            </button>
          )}
          <button
            type="button"
            onClick={() => save(CONSENT_NONE)}
            className="rounded-full border border-white/15 px-5 py-2 text-sm font-semibold text-zinc-200 transition hover:bg-white/5"
          >
            Nur notwendige
          </button>
          <button
            type="button"
            onClick={() => save(CONSENT_ALL)}
            className="rounded-full bg-gradient-to-r from-accent to-accent-2 px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Alle akzeptieren
          </button>
        </div>
      </div>
    </div>
  )
}

function Category({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange?: (v: boolean) => void
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 ${
        disabled ? 'opacity-70' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-1 h-4 w-4 accent-accent"
      />
      <span>
        <span className="block text-sm font-semibold text-zinc-100">{label}</span>
        <span className="block text-xs text-zinc-400">{description}</span>
      </span>
    </label>
  )
}
