import type { CollectionConfig } from 'payload'
import { externalIdFields, syncMetaFields } from '../fields/sync'
import { seoFields } from '../fields/seo'

export const Studios: CollectionConfig = {
  slug: 'studios',
  labels: { singular: 'Studio', plural: 'Studios' },
  admin: { useAsTitle: 'name', group: 'Katalog', defaultColumns: ['name', 'slug', 'isAnimationStudio'] },
  access: { read: () => true },
  fields: [
    ...externalIdFields,
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'logoUrl', type: 'text' },
    { name: 'descriptionDe', type: 'textarea' },
    { name: 'founded', type: 'date' },
    { name: 'headquarters', type: 'text' },
    { name: 'website', type: 'text' },
    { name: 'isAnimationStudio', type: 'checkbox', defaultValue: true },
    // Reverse: alle Anime dieses Studios
    { name: 'animeProduced', type: 'join', collection: 'anime', on: 'studios' },
    ...syncMetaFields,
    seoFields,
  ],
}
