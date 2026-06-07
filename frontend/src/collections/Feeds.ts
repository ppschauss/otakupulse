import type { CollectionConfig } from 'payload'
import { slugify } from '../lib/anilist'

/**
 * Kuratierte RSS-Feeds. Pro Feed wählst du Artikel per Suche/Auswahl aus; der Feed
 * ist unter /feed/<slug> (auch /feed/<slug>.xml) als RSS 2.0 abrufbar.
 */
export const Feeds: CollectionConfig = {
  slug: 'feeds',
  labels: { singular: 'RSS-Feed', plural: 'RSS-Feeds' },
  admin: {
    useAsTitle: 'name',
    group: 'Redaktion',
    defaultColumns: ['name', 'slug', 'updatedAt'],
    description: 'Eigene RSS-Feeds: Artikel per Suche hinzufügen. Abruf unter /feed/<slug>.',
  },
  access: { read: () => true },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data && !data.slug && data.name) data.slug = slugify(data.name)
        return data
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text', required: true, admin: { description: 'Anzeigename des Feeds (z.B. „News – Action").' } },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'URL-Teil → /feed/<slug>. Wird aus dem Namen erzeugt, wenn leer.' },
    },
    { name: 'description', type: 'textarea', admin: { description: 'Feed-Beschreibung (RSS <description>).' } },
    {
      name: 'articles',
      type: 'relationship',
      relationTo: 'articles',
      hasMany: true,
      admin: { description: 'Beiträge per Suche hinzufügen. Reihenfolge hier = Reihenfolge im Feed.' },
    },
    {
      name: 'anime',
      type: 'relationship',
      relationTo: 'anime',
      hasMany: true,
      admin: { description: 'Anime direkt in den Feed legen (verlinkt auf /anime/<slug>, Text = dt. Beschreibung). Kein Artikel nötig.' },
    },
    {
      name: 'customItems',
      type: 'array',
      labels: { singular: 'Eigener Eintrag', plural: 'Eigene Einträge' },
      admin: { description: 'Beliebige Seite/URL als Feed-Eintrag (z.B. eine Genre- oder Themenseite).' },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'url', type: 'text', required: true, admin: { description: 'Voll- oder Pfad-URL (z.B. /genre/action oder https://…).' } },
        { name: 'description', type: 'textarea' },
        { name: 'date', type: 'date', admin: { description: 'Optionales Datum (sonst „jetzt").' } },
      ],
    },
    {
      name: 'maxItems',
      type: 'number',
      defaultValue: 50,
      admin: { description: 'Maximale Anzahl Einträge im Feed (Default 50).' },
    },
  ],
}
