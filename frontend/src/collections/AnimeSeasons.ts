import type { CollectionConfig } from 'payload'
import { seoFields } from '../fields/seo'

export const AnimeSeasons: CollectionConfig = {
  slug: 'anime-seasons',
  labels: { singular: 'Season', plural: 'Seasons' },
  admin: { useAsTitle: 'name', group: 'Taxonomie', defaultColumns: ['name', 'season', 'year'] },
  access: { read: () => true },
  fields: [
    { name: 'name', type: 'text', required: true, admin: { description: 'z.B. "Spring 2026"' } },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'season', type: 'select', options: ['WINTER', 'SPRING', 'SUMMER', 'FALL'] },
    { name: 'year', type: 'number', index: true },
    { name: 'startDate', type: 'date' },
    { name: 'endDate', type: 'date' },
    { name: 'descriptionDe', type: 'textarea' },
    { name: 'featuredAnime', type: 'relationship', relationTo: 'anime', hasMany: true },
    // Reverse: alle Anime dieser Season
    { name: 'anime', type: 'join', collection: 'anime', on: 'animeSeason' },
    seoFields,
  ],
}
