'use client'

import { openConsentSettings } from '@/lib/consent'

// Öffnet den Cookie-Einstellungen-Dialog (z. B. aus dem Footer / Datenschutzseite).
export function ConsentSettingsLink({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openConsentSettings} className={className}>
      Cookie-Einstellungen
    </button>
  )
}
