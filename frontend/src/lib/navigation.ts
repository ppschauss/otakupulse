// Lädt die im Admin pflegbare Navigation (Global "navigation") und fällt pro
// Abschnitt auf die Standard-Menüs zurück, solange dort nichts gepflegt wurde.
import { cache } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'

export type NavLink = { label: string; href: string }
export type FooterColumn = { title: string; links: NavLink[] }
export type SiteNav = {
  header: NavLink[]
  footerColumns: FooterColumn[]
  legal: NavLink[]
}

// Standard-Navigation (wird genutzt, wenn im Admin nichts gepflegt ist).
export const DEFAULT_NAV: SiteNav = {
  header: [
    { label: 'Anime', href: '/anime' },
    { label: 'Genres', href: '/genre' },
    { label: 'Streaming', href: '/plattform' },
    { label: 'Kalender', href: '/kalender' },
    { label: 'News', href: '/news' },
  ],
  footerColumns: [
    {
      title: 'Entdecken',
      links: [
        { label: 'Anime-Datenbank', href: '/anime' },
        { label: 'Top-Anime', href: '/top-anime' },
        { label: 'Simulcast-Kalender', href: '/kalender' },
        { label: 'Seasons', href: '/season' },
        { label: 'Suche', href: '/suche' },
      ],
    },
    {
      title: 'Katalog',
      links: [
        { label: 'Charaktere', href: '/character' },
        { label: 'Personen', href: '/person' },
        { label: 'Studios', href: '/studio' },
      ],
    },
    {
      title: 'Stöbern',
      links: [
        { label: 'Genres', href: '/genre' },
        { label: 'Tags', href: '/tag' },
        { label: 'Plattformen', href: '/plattform' },
        { label: 'News', href: '/news' },
        { label: 'RSS-Feeds', href: '/feeds' },
      ],
    },
  ],
  legal: [
    { label: 'Kontakt', href: '/kontakt' },
    { label: 'Impressum', href: '/impressum' },
    { label: 'Datenschutz', href: '/datenschutz' },
  ],
}

// Mappt einen gepflegten Eintrag {label,url} auf {label,href}; ungültige fallen raus.
const toLink = (x: any): NavLink | null =>
  x?.label && x?.url ? { label: String(x.label), href: String(x.url) } : null
const cleanLinks = (arr: any): NavLink[] =>
  (Array.isArray(arr) ? arr : []).map(toLink).filter((l): l is NavLink => !!l)

// Pro Request gecached (React cache) → nur eine DB-Abfrage je Seitenaufruf.
export const getNavigation = cache(async (): Promise<SiteNav> => {
  try {
    const payload = await getPayload({ config })
    const g: any = await payload.findGlobal({ slug: 'navigation' })

    const header = cleanLinks(g?.header)
    const legal = cleanLinks(g?.legal)
    const footerColumns: FooterColumn[] = (Array.isArray(g?.footerColumns) ? g.footerColumns : [])
      .map((c: any) => ({ title: String(c?.title || ''), links: cleanLinks(c?.links) }))
      .filter((c: FooterColumn) => c.title && c.links.length)

    return {
      header: header.length ? header : DEFAULT_NAV.header,
      footerColumns: footerColumns.length ? footerColumns : DEFAULT_NAV.footerColumns,
      legal: legal.length ? legal : DEFAULT_NAV.legal,
    }
  } catch {
    return DEFAULT_NAV
  }
})
