import type { CollectionConfig } from 'payload'
import { syncMetaFields } from '../fields/sync'

export const Episodes: CollectionConfig = {
  slug: 'episodes',
  labels: { singular: 'Episode', plural: 'Episoden' },
  admin: { useAsTitle: 'slug', group: 'Katalog', defaultColumns: ['slug', 'anime', 'number', 'airDate'] },
  access: { read: () => true },
  fields: [
    { name: 'anime', type: 'relationship', relationTo: 'anime', required: true, index: true },
    { name: 'number', type: 'number', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true, admin: { description: '{anime-slug}-episode-{n}' } },
    {
      type: 'row',
      fields: [
        { name: 'titleRomaji', type: 'text' },
        { name: 'titleEnglish', type: 'text' },
        { name: 'titleGerman', type: 'text' },
      ],
    },
    { name: 'airDate', type: 'date' },
    { name: 'synopsisSource', type: 'textarea' },
    { name: 'synopsisDe', type: 'textarea' },
    { name: 'thumbnailUrl', type: 'text' },
    { name: 'duration', type: 'number' },
    {
      type: 'row',
      fields: [
        { name: 'isFiller', type: 'checkbox', defaultValue: false },
        { name: 'isRecap', type: 'checkbox', defaultValue: false },
      ],
    },
    {
      name: 'platforms',
      type: 'array',
      labels: { singular: 'Plattform-Release', plural: 'Plattform-Releases' },
      fields: [
        { name: 'platform', type: 'relationship', relationTo: 'platforms' },
        { name: 'releaseTime', type: 'date' },
        { name: 'url', type: 'text' },
      ],
    },
    { name: 'animeSeason', type: 'relationship', relationTo: 'anime-seasons' },
    ...syncMetaFields,
  ],
}
