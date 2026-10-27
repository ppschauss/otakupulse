import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Host-abhängige Sicherheits-Header (Next.js 16 „proxy"-Konvention, vormals
 * `middleware.ts`).
 *
 * `Strict-Transport-Security` und die CSP-Direktive `upgrade-insecure-requests`
 * dürfen NUR gesetzt werden, wenn der Request über die öffentliche HTTPS-Domain
 * (Cloudflare-Tunnel) kommt — NICHT beim LAN-Direktzugriff über Plain-HTTP
 * (z. B. http://192.168.0.161:3001). Andernfalls stuft der Browser die per HTTP
 * geladenen /_next/static-Chunks auf https://<lan-ip>:3001 hoch, wo kein
 * TLS-Listener existiert → CSS/JS scheitern → die Seite bleibt ohne Styles.
 *
 * Die restlichen (statischen) Security-Header kommen weiterhin aus
 * next.config.mjs → headers(). Dieser Proxy ist die EINZIGE Quelle für CSP
 * und HSTS.
 */

// Öffentliche HTTPS-Hosts: aus NEXT_PUBLIC_SITE_URL abgeleitet (www + Apex),
// optional per NEXT_PUBLIC_PUBLIC_HOSTS (kommagetrennt) erweiterbar.
// NEXT_PUBLIC_*-Variablen werden beim Build in das Bundle eingebacken und sind
// dadurch auch im (Edge-)Proxy verfügbar.
const PUBLIC_HOSTS: ReadonlySet<string> = (() => {
  const hosts = new Set<string>()
  const raw = process.env.NEXT_PUBLIC_SITE_URL
  if (raw) {
    try {
      const h = new URL(raw).hostname.toLowerCase()
      hosts.add(h)
      hosts.add(h.startsWith('www.') ? h.slice(4) : `www.${h}`)
    } catch {
      // ungültige URL → ignorieren, XFP-Fallback greift weiterhin
    }
  }
  for (const extra of (process.env.NEXT_PUBLIC_PUBLIC_HOSTS ?? '').split(',')) {
    const h = extra.trim().toLowerCase()
    if (h) hosts.add(h)
  }
  return hosts
})()

// Erkennt einen Request über die öffentliche HTTPS-Origin. Fail-open Richtung
// „unsicher": erkennen wir es nicht sicher, verzichten wir lieber auf HSTS/
// upgrade (Seite funktioniert), statt sie fälschlich im LAN zu erzwingen.
function isPublicHttps(req: NextRequest): boolean {
  // 1) Cloudflare-Tunnel / Reverse-Proxy reicht das Original-Schema durch.
  const xfProto = req.headers.get('x-forwarded-proto')
  if (xfProto && xfProto.split(',')[0]!.trim().toLowerCase() === 'https') return true
  // 2) Bekannter öffentlicher Host im Host-Header (ohne Port).
  const host = (req.headers.get('host') ?? '').split(':')[0]!.toLowerCase()
  return host !== '' && PUBLIC_HOSTS.has(host)
}

// Kam der Request über den öffentlichen Cloudflare-Edge/-Tunnel? Cloudflare
// hängt an JEDEN Edge-Request `cf-ray` (+ `cf-connecting-ip`) an — Header, die
// bei einem LAN-/Tailscale-Direktzugriff auf http://<ip>:3001 nie vorhanden
// sind. Zusammen mit isPublicHttps ergibt das eine robuste „öffentlich vs.
// intern"-Erkennung. Fail-open bewusst genau andersherum als oben: für die
// Admin-Sperre gilt „im Zweifel öffentlich" wäre zu streng (sperrt LAN aus),
// deshalb blocken wir NUR bei einem positiven Public-Signal.
function comesFromPublicEdge(req: NextRequest): boolean {
  return req.headers.get('cf-ray') !== null || isPublicHttps(req)
}

// Pfade, die ausschließlich intern (LAN / Tailscale) erreichbar sein sollen:
// - /legal/admin : das Payload-Admin-Panel (versteckte Route)
// - /api         : Payload-REST/GraphQL/Auth (inkl. /api/users/login) — die
//                  öffentliche Seite nutzt davon nichts (Server-Components gehen
//                  über die Payload-Local-API, Formulare über Server Actions).
// Über den öffentlichen Tunnel liefern wir dafür ein nacktes 404 (verrät weder
// Existenz des Panels noch die API-Oberfläche und nimmt jede Brute-Force-/
// Scraping-Angriffsfläche von außen).
const INTERNAL_ONLY_PREFIXES = ['/legal/admin', '/api'] as const

function isInternalOnlyPath(pathname: string): boolean {
  return INTERNAL_ONLY_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  )
}

/**
 * Quellen für Google AdSense und das zertifizierte CMP (Funding Choices).
 * Bewusst eine eigene Liste, damit beim nächsten CSP-Eingriff erkennbar bleibt,
 * was zu den Anzeigen gehört und was zur Reichweitenmessung.
 */
const ADS_SCRIPT_SRC = [
  'https://pagead2.googlesyndication.com',
  'https://tpc.googlesyndication.com',
  'https://partner.googleadservices.com',
  'https://adservice.google.com',
  'https://fundingchoicesmessages.google.com',
  'https://googleads.g.doubleclick.net',
]

/** Anzeigen und die Einwilligungsnachricht rendern in eigenen iframes. */
const ADS_FRAME_SRC = [
  'https://googleads.g.doubleclick.net',
  'https://tpc.googlesyndication.com',
  'https://www.google.com',
  'https://fundingchoicesmessages.google.com',
]

// CSP — inhaltlich identisch zur bisherigen next.config-Policy. Einziger
// Unterschied: `upgrade-insecure-requests` wird nur für öffentliche HTTPS-
// Requests angehängt.
export function buildContentSecurityPolicy(secure: boolean): string {
  const directives = [
    "default-src 'self'",
    // Google Analytics (gtag.js) von googletagmanager.com; Daten an google-analytics.com.
    // AdSense + das zertifizierte CMP („Privacy & messaging"/Funding Choices) laden
    // ihre Skripte von googlesyndication/googleadservices/doubleclick nach — ohne
    // diese Quellen blockiert die CSP jede Anzeige stillschweigend.
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com " +
      ADS_SCRIPT_SRC.join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https:",
    "media-src 'self' https:",
    // youtube-nocookie.com: eingebettete Trailer auf Artikelseiten.
    // Anzeigen und die CMP-Nachricht rendern in eigenen iframes (SafeFrame).
    "frame-src 'self' https://www.youtube-nocookie.com " + ADS_FRAME_SRC.join(' '),
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ]
  if (secure) directives.push('upgrade-insecure-requests')
  return directives.join('; ')
}

export function proxy(req: NextRequest): NextResponse {
  // Admin-Panel + Payload-API sind NUR intern (LAN/Tailscale) erreichbar.
  // Kommt der Request über den öffentlichen Cloudflare-Tunnel, antworten wir
  // mit einem nackten 404 — noch bevor irgendetwas gerendert oder an Payload
  // durchgereicht wird.
  if (comesFromPublicEdge(req) && isInternalOnlyPath(req.nextUrl.pathname)) {
    return new NextResponse(null, { status: 404 })
  }

  const res = NextResponse.next()
  const secure = isPublicHttps(req)

  // CSP nur auf öffentlichen Routen — das Payload-Admin unter /legal/admin
  // bleibt ausgenommen (Inline-/Worker-Skripte würden sonst brechen), analog
  // zur bisherigen next.config-Ausnahme.
  if (!req.nextUrl.pathname.startsWith('/legal/admin')) {
    res.headers.set('Content-Security-Policy', buildContentSecurityPolicy(secure))
  }

  // HSTS ausschließlich über die öffentliche HTTPS-Domain.
  if (secure) {
    res.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    )
  }

  return res
}

export const config = {
  // Auf Dokument-/Routen-Antworten laufen; statische Assets, der Bild-Optimizer,
  // die lokale Mediathek und der Umami-Proxy brauchen weder CSP noch HSTS.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|media/|stats/).*)'],
}
