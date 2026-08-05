import { withPayload } from '@payloadcms/next/withPayload'

// Statische Sicherheits-Header (greifen für alle Routen).
//
// WICHTIG — was hier BEWUSST NICHT mehr steht:
//   - `Strict-Transport-Security` (HSTS)
//   - die Content-Security-Policy inkl. `upgrade-insecure-requests`
// Beide werden jetzt host-abhängig in `src/proxy.ts` gesetzt: NUR für
// Requests über die öffentliche HTTPS-Domain (Cloudflare-Tunnel), NICHT beim
// LAN-Direktzugriff über Plain-HTTP (z. B. http://192.168.0.161:3001).
// Grund: `upgrade-insecure-requests` zwingt den Browser, die per HTTP geladenen
// CSS-/JS-Chunks auf https://<lan-ip>:3001 „hochzustufen" — dort lauscht aber
// kein TLS → die Requests scheitern → die Seite rendert komplett ohne Styles.
// Die komplette CSP ist jetzt EINZIGE-Quelle in src/proxy.ts, damit
// `upgrade-insecure-requests` sauber laufzeitabhängig an-/abgeschaltet werden
// kann (eine statische headers()-CSP kennt den Request-Host nicht).
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Cross-Origin-Isolation (Werte bewusst verträglich gewählt):
  // - COOP same-origin-allow-popups: isoliert den Browsing-Kontext, LÄSST aber
  //   selbst geöffnete Popups die opener-Beziehung behalten. NÖTIG für Googles
  //   „Subscribe with Google"/Sign-In-Popup-Flows — reines `same-origin` bricht
  //   sie (sichtbar als weißer Lade-Balken „security configuration doesn't match").
  // - CORP cross-origin: erlaubt weiterhin, dass Bilder/OG-Assets von Dritten (Discord,
  //   Facebook) eingebettet werden — sonst bräche das Social-Sharing.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
]

// HINWEIS: `Cross-Origin-Embedder-Policy` wurde bewusst ENTFERNT. `credentialless`
// (und erst recht `require-corp`) bricht eingebettete Dritt-iframes wie den
// YouTube-Trailer und die SWG-Box („This page has not been loaded because the
// security configuration doesn't match"). Cross-Origin-Isolation (SharedArrayBuffer
// o. ä.) braucht die Seite nicht — daher kein COEP.

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
      // Statische Security-Header für alle Routen. CSP + HSTS kommen host-abhängig
      // aus src/proxy.ts. /legal/admin bleibt separat (falls dort künftig abweichen).
      { source: '/((?!legal/admin).*)', headers: securityHeaders },
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
