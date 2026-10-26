'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'
import { ADSENSE_CLIENT } from '@/lib/site'
import { TCF_NONE, watchTcf, type TcfState } from '@/lib/tcf'

/**
 * Lädt das AdSense-Skript — aber erst, wenn das zertifizierte CMP (siehe
 * components/GoogleCmp.tsx) die Einwilligung für Google gemeldet hat.
 *
 * Bewusst strenger als Googles Minimalvorgabe: ohne Einwilligung in die
 * Gerätespeicherung (TCF-Zweck 1) UND den Vendor „Google Advertising Products"
 * (755) wird das Skript gar nicht geladen — dann gibt es auch keine Anzeigen.
 * Das erfüllt § 25 Abs. 1 TDDDG ohne Grauzone.
 */
export function AdSense() {
  const [tcf, setTcf] = useState<TcfState>(TCF_NONE)

  useEffect(() => watchTcf(setTcf), [])

  if (!ADSENSE_CLIENT) return null
  if (!tcf.ready || !tcf.storage || !tcf.googleVendor) return null

  return (
    <Script
      id="adsense"
      strategy="afterInteractive"
      async
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
    />
  )
}
