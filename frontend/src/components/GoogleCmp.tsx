'use client'

import Script from 'next/script'
import { ADSENSE_CLIENT } from '@/lib/site'

/**
 * Google „Privacy & messaging" (Funding Choices) — das von Google zertifizierte
 * CMP (IAB TCF v2.2). Pflicht für Anzeigen an Nutzer im EWR/UK/CH.
 *
 * Das Skript IST das Einwilligungswerkzeug und darf daher ohne vorherige
 * Einwilligung laden (technisch notwendig, § 25 Abs. 2 TDDDG). Es setzt selbst
 * keine Werbe-Cookies; Anzeigen lädt erst components/AdSense.tsx nach, wenn das
 * TC-Signal vorliegt (siehe lib/tcf.ts).
 *
 * Konfiguriert wird die Nachricht im AdSense-Konto unter
 * „Datenschutz & Nachrichten → DSGVO". Ohne dort veröffentlichte Nachricht
 * liefert das Skript nichts aus — dann greift das Eigen-Banner als Rückfall.
 */
export function GoogleCmp() {
  const pub = (ADSENSE_CLIENT || '').replace(/^ca-/, '')
  if (!pub) return null
  return (
    <>
      <Script id="google-fc-present" strategy="afterInteractive">
        {`(function(){function signalGooglefcPresent(){if(!window.frames['googlefcPresent']){if(document.body){const i=document.createElement('iframe');i.style='width:0;height:0;border:none;z-index:-1000;left:-1000px;top:-1000px;';i.style.display='none';i.name='googlefcPresent';document.body.appendChild(i)}else{setTimeout(signalGooglefcPresent,0)}}}signalGooglefcPresent()})();`}
      </Script>
      <Script
        id="google-fc"
        strategy="afterInteractive"
        src={`https://fundingchoicesmessages.google.com/i/${pub}?ers=1`}
      />
    </>
  )
}
