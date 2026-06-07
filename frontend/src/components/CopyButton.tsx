'use client'

import { useState } from 'react'

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          /* clipboard nicht verfügbar — ignorieren */
        }
      }}
      className={className || 'shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-accent/40 hover:text-white'}
    >
      {copied ? 'Kopiert ✓' : 'URL kopieren'}
    </button>
  )
}
