import type { CollectionConfig } from 'payload'
import { seoFields } from '../fields/seo'

export const Platforms: CollectionConfig = {
  slug: 'platforms',
  labels: { singular: 'Plattform', plural: 'Plattformen' },
  admin: { useAsTitle: 'name', group: 'Taxonomie', defaultColumns: ['name', 'slug'] },
  access: { read: () => true },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'logoUrl', type: 'text' },
    { name: 'descriptionDe', type: 'textarea' },
    { name: 'website', type: 'text', admin: { description: 'Basis-URL (Affiliate-fähig).' } },
    { name: 'availableRegions', type: 'text', hasMany: true, admin: { description: 'z.B. DE, AT, CH' } },
    { name: 'color', type: 'text', admin: { description: 'Brand-Farbe (Hex) für UI.' } },
    seoFields,
  ],
}
