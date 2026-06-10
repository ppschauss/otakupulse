import { withPayload } from '@payloadcms/next/withPayload'

// Sicherheits-Header (greifen für alle Routen).
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Cross-Origin-Isolation (Werte bewusst verträglich gewählt):
  // - COOP same-origin: isoliert den Browsing-Kontext (kein Cross-Origin-window-Zugriff).
  // - CORP cross-origin: erlaubt weiterhin, dass Bilder/OG-Assets von Dritten (Discord,
  //   Facebook) eingebettet werden — sonst bräche das Social-Sharing.
  // - COEP credentialless: lädt Cross-Origin-Subressourcen ohne Credentials, statt sie
  //   (wie require-corp) komplett zu blocken → GA/Umami/Remote-Bilder bleiben funktional.
  //   NUR auf öffentlichen Routen (Admin ausgenommen, s.u.).
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
]

// COEP separat, da es das Payload-Admin (Worker/Inline) eher bricht → nur öffentlich.
const coepHeader = { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' }

// CSP nur für öffentliche Routen (Admin ausgenommen, s.u.). 'unsafe-inline' ist für
// Next.js nötig; externe Skripte sind gesperrt. Falls externe Analytics (Plausible/
// Umami) genutzt werden, deren Host bei script-src ergänzen.
const contentSecurityPolicy = [
  "default-src 'self'",
  // Google Analytics (gtag.js) lädt von googletagmanager.com; Daten gehen an google-analytics.com
  // (connect-src 'self' https: deckt das Senden bereits ab). Lädt nur nach Statistik-Einwilligung.
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "media-src 'self' https:",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ')

const cspHeader = { key: 'Content-Security-Policy', value: contentSecurityPolicy }

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Kein `X-Powered-By: Next.js`-Header (Tech-Fingerprinting reduzieren).
  poweredByHeader: false,
  // Erlaubt dem Dev-Server, /_next/-Ressourcen an diese Origins auszuliefern
  // (sonst bleibt z.B. das Admin-Panel im LAN weiß, weil die JS-Chunks geblockt werden).
  allowedDevOrigins: ['192.168.0.161', '100.87.113.82'],
  // Bilder: lokale Originale unter /media bleiben unangetastet; next/image liefert
  // zur Laufzeit verkleinerte WebP/AVIF-Varianten aus (gecacht). Remote-Fallbacks
  // (AniList-CDN, Wikimedia-Logos) sind explizit freigegeben.
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 2678400, // 31 Tage
    remotePatterns: [
      { protocol: 'https', hostname: 's4.anilist.co' },
      { protocol: 'https', hostname: 'commons.wikimedia.org' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
    ],
  },
  async headers() {
    return [
      // Öffentliche Routen: Security-Header inkl. CSP. /legal/admin ist ausgenommen,
      // damit das Payload-Admin-Panel (Inline-/Worker-Skripte) nicht bricht.
      { source: '/((?!legal/admin).*)', headers: [...securityHeaders, coepHeader, cspHeader] },
      { source: '/legal/admin/:path*', headers: securityHeaders },
    ]
  },
  // First-Party-Proxy für selbst-gehostetes Umami (Container „umami" im selben
  // Docker-Netz). Tracking läuft so über die eigene Domain (/stats/*) → kein
  // Dritt-Host, CSP bleibt 'self', adblock-resistent. /api bleibt für Payload frei.
  async rewrites() {
    return [
      { source: '/stats/script.js', destination: 'http://umami:3000/script.js' },
      { source: '/stats/api/send', destination: 'http://umami:3000/api/send' },
    ]
  },
}

export default withPayload(nextConfig)
