'use client'

import { useActionState, useEffect, useRef } from 'react'
import { submitContact } from './actions'

const initial: { ok?: boolean; error?: string } = {}

const field = 'w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-accent focus:outline-none'

export function ContactForm() {
  const [state, action, pending] = useActionState(submitContact, initial)

  // JS-Zeittrap: Mount-Zeit erst clientseitig setzen (kein Hydration-Mismatch).
  // Beim Absenden schreibt onSubmit die verstrichene Zeit in das versteckte
  // Feld `_elapsed` → die Server-Action verwirft Sofort-Submits von Bots.
  const mountedAt = useRef<number | null>(null)
  const elapsedInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    mountedAt.current = performance.now()
  }, [])
  const stampElapsed = () => {
    if (elapsedInput.current && mountedAt.current != null) {
      elapsedInput.current.value = String(Math.round(performance.now() - mountedAt.current))
    }
  }

  if (state.ok) {
    return (
      <div className="mt-8 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-emerald-200">
        <p className="font-semibold">Danke! Deine Nachricht ist angekommen. 🎉</p>
        <p className="mt-1 text-sm text-emerald-200/80">Wir lesen alles und melden uns, falls eine Antwort nötig ist.</p>
      </div>
    )
  }

  return (
    <form action={action} onSubmit={stampElapsed} className="mt-8 space-y-4">
      {/* Honeypot — für Menschen unsichtbar */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0" />
      {/* JS-Zeittrap: wird beim Absenden per onSubmit mit der Verweildauer (ms) befüllt */}
      <input ref={elapsedInput} type="hidden" name="_elapsed" defaultValue="" />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-zinc-400" htmlFor="name">Name <span className="text-zinc-600">(optional)</span></label>
          <input id="name" name="name" type="text" className={field} placeholder="Dein Name" maxLength={120} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-400" htmlFor="email">E-Mail *</label>
          <input id="email" name="email" type="email" required className={field} placeholder="du@example.com" maxLength={200} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm text-zinc-400" htmlFor="category">Anliegen</label>
        <select id="category" name="category" defaultValue="feedback" className={field}>
          <option value="feedback">Feedback</option>
          <option value="bug">Fehler / Bug melden</option>
          <option value="correction">Datenkorrektur (falsche Anime-Infos)</option>
          <option value="partnership">Kooperation / Werbung</option>
          <option value="legal">Rechtliches / Urheberrecht</option>
          <option value="other">Sonstiges</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-zinc-400" htmlFor="subject">Betreff <span className="text-zinc-600">(optional)</span></label>
        <input id="subject" name="subject" type="text" className={field} placeholder="Worum geht's?" maxLength={200} />
      </div>

      <div>
        <label className="mb-1 block text-sm text-zinc-400" htmlFor="message">Nachricht *</label>
        <textarea id="message" name="message" required rows={7} className={field} placeholder="Schreib uns…" maxLength={5000} />
      </div>

      {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-5 py-2.5 font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Senden…' : 'Absenden'}
        </button>
        <span className="text-xs text-zinc-500">Wir nutzen deine Angaben nur zur Beantwortung deiner Anfrage.</span>
      </div>
    </form>
  )
}
