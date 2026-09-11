import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    // `/legal/admin` statt `/admin`: das Payload-Panel liegt seit dem Verstecken
    // unter /legal/admin (die alte Regel lief ins Leere). Beides wird für
    // öffentliche Requests ohnehin schon von src/proxy.ts mit 404 abgeriegelt —
    // der robots.txt-Eintrag ist nur die zweite, freundliche Ebene.
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/legal/admin', '/api'] },
      // GEO: Such-/Zitier-Agenten der KI-Assistenten ausdrücklich zulassen (sie holen
      // Seiten für Antworten mit Quellenangabe — das ist Reichweite, kein Training).
      // Training bleibt über Cloudflares Content-Signal (ai-train=no) untersagt.
      // ACHTUNG: Cloudflares „Managed robots.txt" stellt eigene Disallow-Gruppen für
      // GPTBot/ClaudeBot/Google-Extended voran — die müssen im Cloudflare-Dashboard
      // (Security → Bots → AI bots) gelockert werden, sonst gewinnen sie.
      {
        userAgent: ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Perplexity-User', 'Claude-SearchBot', 'Claude-User', 'Applebot', 'DuckAssistBot'],
        allow: '/',
        disallow: ['/legal/admin', '/api'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
