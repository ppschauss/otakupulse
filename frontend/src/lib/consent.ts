// Cookie-/Tracking-Einwilligung. Gespeichert in localStorage, damit für die
// Speicherung selbst kein Cookie nötig ist. Kategorien:
//  - necessary:  immer aktiv (technisch notwendig), nicht abwählbar
//  - statistics: Reichweitenmessung (Umami/Plausible/GA)
//
// WERBUNG läuft NICHT mehr über dieses Banner: Für Anzeigen gilt Googles
// EU-Nutzereinwilligungsrichtlinie, die ein zertifiziertes CMP (IAB TCF v2.2)
// verlangt. Das übernimmt „Privacy & messaging" aus dem AdSense-Konto
// (components/GoogleCmp.tsx, Auswertung in lib/tcf.ts). Dieses Banner erscheint
// nur noch als Rückfall, wenn kein TCF-CMP antwortet — und dann ohne Werbung.

export type ConsentCategory = 'statistics' | 'marketing'
/** `marketing` bleibt im Typ, wird aber nur noch vom TCF-Signal gesetzt. */
export type Consent = { statistics: boolean; marketing: boolean }

export const CONSENT_KEY = 'op-consent'
export const CONSENT_VERSION = 1
// Feuert bei jeder Änderung mit { detail: Consent }.
export const CONSENT_EVENT = 'op:consent-change'
// Öffnet den Einstellungen-Dialog (z. B. aus dem Footer).
export const OPEN_CONSENT_EVENT = 'op:open-consent'

export const CONSENT_NONE: Consent = { statistics: false, marketing: false }
export const CONSENT_ALL: Consent = { statistics: true, marketing: true }

export const CATEGORY_INFO: { key: ConsentCategory; label: string; description: string }[] = [
  {
    key: 'statistics',
    label: 'Statistik',
    description:
      'Reichweitenmessung mit Umami (cookielos) sowie Google Analytics (Google Ireland/USA), um die Nutzung der Seite zu verstehen und zu verbessern. Wird nur nach deiner Einwilligung geladen.',
  },
]

export function readConsent(): Consent | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CONSENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.v !== CONSENT_VERSION) return null
    return { statistics: !!parsed.statistics, marketing: !!parsed.marketing }
  } catch {
    return null
  }
}

export function writeConsent(c: Consent): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ ...c, v: CONSENT_VERSION, ts: Date.now() }))
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: c }))
  } catch {
    /* ignore */
  }
}

/**
 * Einstellungen öffnen (Footer-Link). Bevorzugt das zertifizierte CMP; nur wenn
 * das nicht erreichbar ist, öffnet sich der eigene Dialog.
 */
export function openConsentSettings(): void {
  if (typeof window === 'undefined') return
  const fc = (window as any).googlefc
  if (fc && typeof fc.showRevocationMessage === 'function') {
    fc.showRevocationMessage()
    return
  }
  window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))
}
