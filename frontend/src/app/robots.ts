import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    // `/legal/admin` statt `/admin`: das Payload-Panel liegt seit dem Verstecken
    // unter /legal/admin (die alte Regel lief ins Leere). Beides wird für
    // öffentliche Requests ohnehin schon von src/proxy.ts mit 404 abgeriegelt —
    // der robots.txt-Eintrag ist nur die zweite, freundliche Ebene.
    rules: { userAgent: '*', allow: '/', disallow: ['/legal/admin', '/api'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
