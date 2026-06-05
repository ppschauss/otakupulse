import { withPayload } from '@payloadcms/next/withPayload'

// Sicherheits-Header (greifen für alle Routen).
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
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
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default withPayload(nextConfig)
