'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'
import { CONSENT_EVENT, type Consent, readConsent } from '@/lib/consent'

/**
 * Datenschutzfreundliches Analytics (Plausible oder Umami) — wird NUR geladen,
 * wenn der Nutzer die Kategorie „Statistik" eingewilligt hat (echtes Opt-in)
 * und die jeweiligen Env-Variablen gesetzt sind.
 *
 * Aktivieren via secrets.env / Env:
 *   NEXT_PUBLIC_PLAUSIBLE_DOMAIN=otakupulse.de            (+ optional NEXT_PUBLIC_PLAUSIBLE_SRC)
 *   NEXT_PUBLIC_UMAMI_WEBSITE_ID=...  NEXT_PUBLIC_UMAMI_SRC=https://<umami>/script.js
 */
export function Analytics() {
  const [consent, setConsent] = useState<Consent | null>(null)

  useEffect(() => {
    setConsent(readConsent())
    const onChange = (e: Event) => setConsent((e as CustomEvent<Consent>).detail)
    window.addEventListener(CONSENT_EVENT, onChange)
    return () => window.removeEventListener(CONSENT_EVENT, onChange)
  }, [])

  if (!consent?.statistics) return null

  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN
  const plausibleSrc = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || 'https://plausible.io/js/script.js'
  const umamiId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID
  const umamiSrc = process.env.NEXT_PUBLIC_UMAMI_SRC

  return (
    <>
      {plausibleDomain ? (
        <Script defer data-domain={plausibleDomain} src={plausibleSrc} strategy="afterInteractive" />
      ) : null}
      {umamiId && umamiSrc ? (
        <Script defer data-website-id={umamiId} src={umamiSrc} strategy="afterInteractive" />
      ) : null}
    </>
  )
}
