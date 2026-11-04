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

// animestern.de (2026-11): Die alte Fanseite ist eine reine Weiterleitungs-Domain
// und schickt jeden Pfad unverändert hierher — ihre Struktur war aber
// /anime/<titel>/<unterordner>/..., die es hier nicht gibt, also lief jede dieser
// 301 in einen 404. Diese Tabelle fängt die Titel auf, die sich eindeutig zuordnen
// lassen; sie ist von Hand geprüft, nicht per Namensähnlichkeit geraten. Bewusst
// NICHT aufgenommen: wedding_peach, jeanne, nadia, cutey_honey, el_hazard,
// tenchi_muyou, record_of, magig_k_r, plastic_little, phantom_quest, midnight —
// diese Titel fehlen im Bestand oder liegen nur als Spin-off bzw. Remake vor. Eine
// Umleitung auf den falschen Titel ist schlechter als ein ehrlicher 404 und sieht
// für Google wie eine Doorway-Weiterleitung aus.
//
// Ebenfalls nicht aufgenommen: `aika` und `chobits`. Dort heißt das alte Verzeichnis
// schon wie der heutige Slug, die Titelseite ist also längst erreichbar — eine
// Platzhalter-Regel würde dort die echten Unterseiten /episoden und /charaktere
// verschlucken. Deren alte Galerie-URLs bleiben 404; daran hängt nichts.
const ANIMESTERN_TITEL = {
  dragonball: 'dragon-ball',
  sailor: 'bishoujo-senshi-sailor-moon',
  love_hina: 'love-hina',
  nge: 'shin-seiki-evangelion',
  ranma: 'ranma-1-2', // Original von 1989, nicht die Neuauflage von 2024
  yugioh: 'yu-gi-oh-duel-monsters',
  pokemon: 'pocket-monsters',
  oh_my_goodness: 'aa-megami-sama-tv', // nur Franchise-Treffer: die OVA von 1993 fehlt
}

// Die alte Seite hatte je Titel wechselnde Unterordner. Zwei davon haben hier ein
// echtes Gegenstück, der Rest (bilder, mangas, wallpapers, cards, filminfo, story,
// autor …) landet auf der Titelseite. Die spezifischen Regeln müssen vor dem
// Platzhalter stehen — Next arbeitet die Liste von oben nach unten ab.
const animesternRedirects = Object.entries(ANIMESTERN_TITEL).flatMap(([alt, slug]) => [
  ...['folgen', 'episoden'].map((ordner) => ({
    source: `/anime/${alt}/${ordner}/:pfad*`,
    destination: `/anime/${slug}/episoden`,
    permanent: true,
  })),
  ...['charas', 'chara', 'charaktere'].map((ordner) => ({
    source: `/anime/${alt}/${ordner}/:pfad*`,
    destination: `/anime/${slug}/charaktere`,
    permanent: true,
  })),
  { source: `/anime/${alt}/:pfad*`, destination: `/anime/${slug}`, permanent: true },
  { source: `/anime/${alt}`, destination: `/anime/${slug}`, permanent: true },
])


/** @type {import('next').NextConfig} */
const nextConfig = {
  // Kein `X-Powered-By: Next.js`-Header (Tech-Fingerprinting reduzieren).
  poweredByHeader: false,
  // Build-Ziel überschreibbar (NEXT_DIST_DIR), Standard bleibt `.next`.
  // Grund: `next build` räumt zu Beginn `.next/server/app` auf und stolpert dabei über
  // die ISR-Segmente, die die laufende Instanz parallel schreibt (ENOTEMPTY). Mit
  // NEXT_DIST_DIR=.next-new baut man daneben, ohne die laufende App anzufassen.
  distDir: process.env.NEXT_DIST_DIR || '.next',
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
  // Merge 2026-09: /streamen/<slug> und /aehnlich/<slug> sind in die Anime-Seite
  // eingefaltet (Streaming-Block bzw. Sektion „Ähnliche Anime"). Permanent →
  // Next antwortet mit 308; Google behandelt das wie 301 und überträgt Signale.
  // Die Sitemap-Dateien streamen-N.xml / aehnlich-N.xml antworten seitdem 404
  // (siehe sitemaps/[chunk]/route.ts), damit die GSC sie als entfernt erkennt.
  async redirects() {
    return [
      { source: '/streamen/:slug', destination: '/anime/:slug', permanent: true },
      { source: '/aehnlich/:slug', destination: '/anime/:slug', permanent: true },
      { source: '/streamen', destination: '/plattform', permanent: true },
      { source: '/aehnlich', destination: '/anime', permanent: true },
      ...animesternRedirects,
    ]
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
