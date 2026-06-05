import type { GlobalConfig } from 'payload'
import { VARS_HELP } from '../lib/vars'

// Auswählbare Übersichtsseiten (Schlüssel = interne Kennung, im Code referenziert).
export const PAGE_KEYS = [
  { label: 'Startseite', value: 'home' },
  { label: 'Anime-Übersicht', value: 'anime' },
  { label: 'Genre-Übersicht', value: 'genre' },
  { label: 'Tag-Übersicht', value: 'tag' },
  { label: 'Charaktere-Übersicht', value: 'character' },
  { label: 'Personen-Übersicht', value: 'person' },
  { label: 'Studios-Übersicht', value: 'studio' },
  { label: 'Plattform-Übersicht', value: 'plattform' },
  { label: 'Kalender', value: 'kalender' },
  { label: 'News-Übersicht', value: 'news' },
  { label: 'Season-Übersicht', value: 'season' },
  { label: 'Top-Anime', value: 'top-anime' },
] as const

export const PageContent: GlobalConfig = {
  slug: 'page-content',
  label: 'Seiten-Texte & SEO',
  admin: {
    group: 'Einstellungen',
    description:
      'Footer-Texte und Meta-Tags der Übersichtsseiten. Leere Felder nutzen die Standardwerte. ' +
      VARS_HELP,
  },
  access: { read: () => true },
  fields: [
    {
      name: 'pages',
      type: 'array',
      label: 'Seiten',
      labels: { singular: 'Seite', plural: 'Seiten' },
      admin: { description: 'Pro Übersichtsseite ein Eintrag.' },
      fields: [
        {
          name: 'key',
          type: 'select',
          required: true,
          options: PAGE_KEYS as unknown as { label: string; value: string }[],
          admin: { description: 'Welche Seite dieser Eintrag steuert.' },
        },
        {
          type: 'collapsible',
          label: 'Meta-Tags',
          admin: { initCollapsed: true, description: VARS_HELP },
          fields: [
            { name: 'metaTitle', type: 'text', admin: { description: 'Überschreibt den <title>.' } },
            { name: 'metaDescription', type: 'textarea', admin: { description: 'Meta-Description.' } },
            { name: 'noindex', type: 'checkbox', defaultValue: false, admin: { description: 'Aus dem Index nehmen.' } },
          ],
        },
        {
          name: 'footerText',
          type: 'richText',
          label: 'Footer-Text',
          admin: { description: 'Wird unten auf der Seite angezeigt. ' + VARS_HELP },
        },
      ],
    },
  ],
}
