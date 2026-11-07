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
      // Die *-Regel oben lässt sie ohnehin durch; sie stehen hier, damit die Absicht
      // lesbar ist und Prüfwerkzeuge den Namen finden, nach dem sie suchen.
      {
        userAgent: ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Perplexity-User', 'Claude-SearchBot', 'Claude-User', 'Applebot', 'DuckAssistBot'],
        allow: '/',
        disallow: ['/legal/admin', '/api'],
      },
      // Google-Extended ist kein Crawler, sondern nur ein robots.txt-Merkmal: Geholt
      // wird weiterhin von Googlebot, dieses Feld steuert lediglich, ob Google die
      // Seiten für Gemini-Antworten verwenden darf. Das wollen wir — dort aufzutauchen
      // ist Reichweite. Bewusst eine eigene Gruppe: Es gehört nicht zu den
      // Zitier-Agenten darüber, auch wenn die Regel dieselbe ist.
      { userAgent: 'Google-Extended', allow: '/', disallow: ['/legal/admin', '/api'] },
    ],
    // Trainings-Crawler (GPTBot, ClaudeBot, CCBot, Amazonbot, meta-externalagent,
    // Bytespider) fehlen hier mit Absicht. Sie werden bei Cloudflare per Firewall-Regel
    // mit 403 abgewiesen, bevor die Anfrage den Origin erreicht (Security → Bots) —
    // eine robots.txt-Zeile wäre nur eine Bitte, die Regel wirkt. Sie liefern keinen
    // Besucher und kosten Traffic; die Zitier-Agenten oben bringen die Klicks.
    //
    // Geprüft am 07.11.2026: Cloudflare verändert unsere robots.txt NICHT, Origin und
    // Edge sind Byte für Byte identisch. Ein früherer Kommentar behauptete, Cloudflares
    // „Managed robots.txt" stelle eigene Disallow-Gruppen voran — das stimmt hier nicht.
    // Ebenso wenig ist Cloudflares Content-Signal (ai-train=no) aktiv.
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
