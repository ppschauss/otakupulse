// Cookie-/Tracking-Einwilligung (granular). Gespeichert in localStorage, damit
// für die Speicherung selbst kein Cookie nötig ist. Kategorien:
//  - necessary: immer aktiv (technisch notwendig), nicht abwählbar
//  - statistics: Reichweitenmessung (Plausible/Umami)
//  - marketing: Werbung/Drittanbieter (Google AdSense) sowie Einbettungen

export type ConsentCategory = 'statistics' | 'marketing'
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
  {
    key: 'marketing',
    label: 'Marketing',
    description:
      'Werbeanzeigen über Google AdSense (Google Ireland/USA) sowie Inhalte und Einbettungen von Drittanbietern '
      + '(z. B. Trailer-Embeds). Dabei können Cookies gesetzt und Daten an Google übertragen werden. '
      + 'Ohne deine Einwilligung werden keine Anzeigen geladen.',
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

// Aus beliebigem Code (z. B. Footer-Link) den Einstellungen-Dialog öffnen.
export function openConsentSettings(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))
}
