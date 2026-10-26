'use client'

/**
 * Brücke zum zertifizierten CMP (IAB TCF v2.2).
 *
 * Seit 16.01.2024 verlangt Googles EU-Nutzereinwilligungsrichtlinie für Anzeigen
 * und Messung im EWR/UK/CH ein von Google zertifiziertes CMP. OtakuPulse nutzt
 * dafür „Privacy & messaging" (Funding Choices) aus dem AdSense-Konto — siehe
 * components/GoogleCmp.tsx. Dieses Modul liest die TC-Signale aus, damit
 *   • das Anzeigen-Skript erst nach Einwilligung lädt und
 *   • die Reichweitenmessung dieselbe Entscheidung übernimmt.
 *
 * Fällt das CMP aus (nicht konfiguriert, geblockt), bleibt das Eigen-Banner als
 * Rückfalllösung aktiv — dann wird hier `null` gemeldet.
 */

export type TcfState = {
  /** CMP ist erreichbar und hat eine Entscheidung geliefert. */
  ready: boolean
  /** Zweck 1: Informationen auf dem Gerät speichern/abrufen. */
  storage: boolean
  /** Zwecke 3+4: personalisierte Anzeigen (Profil + Auswahl). */
  personalizedAds: boolean
  /** Zwecke 7–9: Messung von Anzeigen/Inhalten. */
  measurement: boolean
  /** Google Advertising Products (TCF-Vendor 755). */
  googleVendor: boolean
}

export const TCF_NONE: TcfState = {
  ready: false,
  storage: false,
  personalizedAds: false,
  measurement: false,
  googleVendor: false,
}

const GOOGLE_VENDOR_ID = 755

type TcData = {
  cmpStatus?: string
  eventStatus?: string
  gdprApplies?: boolean
  purpose?: { consents?: Record<number, boolean> }
  vendor?: { consents?: Record<number, boolean> }
}

function toState(tc: TcData): TcfState {
  const p = tc.purpose?.consents || {}
  const v = tc.vendor?.consents || {}
  // Außerhalb des Geltungsbereichs (gdprApplies === false) gilt alles als erlaubt.
  if (tc.gdprApplies === false) {
    return { ready: true, storage: true, personalizedAds: true, measurement: true, googleVendor: true }
  }
  return {
    ready: true,
    storage: !!p[1],
    personalizedAds: !!p[3] && !!p[4],
    measurement: !!p[7] || !!p[8] || !!p[9],
    googleVendor: !!v[GOOGLE_VENDOR_ID],
  }
}

/**
 * Meldet jede Consent-Änderung. Liefert eine Abmeldefunktion.
 * `onNoCmp` feuert, wenn innerhalb von `timeoutMs` kein CMP antwortet.
 */
export function watchTcf(onChange: (s: TcfState) => void, onNoCmp?: () => void, timeoutMs = 3000): () => void {
  if (typeof window === 'undefined') return () => {}
  let done = false
  let listenerId: number | undefined

  const timer = window.setTimeout(() => {
    if (!done) onNoCmp?.()
  }, timeoutMs)

  const poll = window.setInterval(() => {
    const api = (window as any).__tcfapi
    if (typeof api !== 'function') return
    window.clearInterval(poll)
    api('addEventListener', 2, (tcData: TcData, success: boolean) => {
      if (!success || !tcData) return
      listenerId = (tcData as any).listenerId
      // „tcloaded"/„useractioncomplete" = Entscheidung liegt vor.
      if (tcData.cmpStatus === 'error') {
        onNoCmp?.()
        return
      }
      if (tcData.eventStatus === 'tcloaded' || tcData.eventStatus === 'useractioncomplete') {
        done = true
        window.clearTimeout(timer)
        onChange(toState(tcData))
      }
    })
  }, 200)

  return () => {
    window.clearTimeout(timer)
    window.clearInterval(poll)
    const api = (window as any).__tcfapi
    if (listenerId !== undefined && typeof api === 'function') api('removeEventListener', 2, () => {}, listenerId)
  }
}

/** Einstellungen des zertifizierten CMP erneut öffnen (Footer-Link). */
export function showCmpSettings(): boolean {
  const fc = (window as any).googlefc
  if (fc?.callbackQueue && typeof fc.showRevocationMessage === 'function') {
    fc.showRevocationMessage()
    return true
  }
  if (fc?.callbackQueue) {
    fc.callbackQueue.push({ CONSENT_DATA_READY: () => (window as any).googlefc?.showRevocationMessage?.() })
    return true
  }
  return false
}
