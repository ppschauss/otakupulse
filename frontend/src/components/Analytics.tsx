import Script from 'next/script'

/**
 * Datenschutzfreundliches Analytics (Plausible oder Umami) — nur aktiv, wenn die
 * jeweiligen Env-Variablen gesetzt sind. Kein Cookie-Banner nötig (cookieless).
 *
 * Aktivieren via secrets.env / Env:
 *   NEXT_PUBLIC_PLAUSIBLE_DOMAIN=otakupulse.de            (+ optional NEXT_PUBLIC_PLAUSIBLE_SRC)
 *   NEXT_PUBLIC_UMAMI_WEBSITE_ID=...  NEXT_PUBLIC_UMAMI_SRC=https://<umami>/script.js
 */
export function Analytics() {
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
