'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'
import { CONSENT_EVENT, type Consent, readConsent } from '@/lib/consent'
import { TCF_NONE, watchTcf, type TcfState } from '@/lib/tcf'

/**
 * Datenschutzfreundliches Analytics (Plausible oder Umami) — wird NUR nach
 * echtem Opt-in geladen. Die Einwilligung kommt bevorzugt aus dem zertifizierten
 * CMP (TCF-Zweck 1 „Speichern/Abrufen" + 7/8/9 „Messung", siehe lib/tcf.ts);
 * ohne CMP greift das Eigen-Banner (Kategorie „Statistik").
 *
 * Aktivieren via secrets.env / Env:
 *   NEXT_PUBLIC_PLAUSIBLE_DOMAIN=otakupulse.de            (+ optional NEXT_PUBLIC_PLAUSIBLE_SRC)
 *   NEXT_PUBLIC_UMAMI_WEBSITE_ID=...  NEXT_PUBLIC_UMAMI_SRC=https://<umami>/script.js
 */
export function Analytics() {
  const [consent, setConsent] = useState<Consent | null>(null)
  const [tcf, setTcf] = useState<TcfState>(TCF_NONE)

  useEffect(() => {
    setConsent(readConsent())
    const onChange = (e: Event) => setConsent((e as CustomEvent<Consent>).detail)
    window.addEventListener(CONSENT_EVENT, onChange)
    const stop = watchTcf(setTcf)
    return () => {
      window.removeEventListener(CONSENT_EVENT, onChange)
      stop()
    }
  }, [])

  const allowed = (tcf.ready && tcf.storage && tcf.measurement) || !!consent?.statistics
  if (!allowed) return null

  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN
  const plausibleSrc = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || 'https://plausible.io/js/script.js'
  const umamiId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID
  const umamiSrc = process.env.NEXT_PUBLIC_UMAMI_SRC
  // First-Party: Skript + Collect laufen über die eigene Domain (data-host-url),
  // damit nichts an Dritt-Hosts geht und Adblocker nicht greifen.
  const umamiHost = process.env.NEXT_PUBLIC_UMAMI_HOST_URL
  // Google Analytics (GA4) — lädt NUR hier (also erst nach Statistik-Einwilligung).
  const gaId = process.env.NEXT_PUBLIC_GA_ID

  return (
    <>
      {plausibleDomain ? (
        <Script defer data-domain={plausibleDomain} src={plausibleSrc} strategy="afterInteractive" />
      ) : null}
      {umamiId && umamiSrc ? (
        <Script
          defer
          data-website-id={umamiId}
          src={umamiSrc}
          {...(umamiHost ? { 'data-host-url': umamiHost } : {})}
          strategy="afterInteractive"
        />
      ) : null}
      {gaId ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}', { anonymize_ip: true });`}
          </Script>
        </>
      ) : null}
    </>
  )
}
