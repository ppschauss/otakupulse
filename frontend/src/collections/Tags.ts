import type { CollectionConfig } from 'payload'
import { seoFields } from '../fields/seo'

export const Tags: CollectionConfig = {
  slug: 'tags',
  labels: { singular: 'Tag', plural: 'Tags' },
  admin: { useAsTitle: 'name', group: 'Taxonomie', defaultColumns: ['name', 'category', 'slug'] },
  access: { read: () => true },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'descriptionDe', type: 'textarea' },
    {
      name: 'category',
      type: 'select',
      options: ['theme', 'setting', 'demographic', 'mood', 'element'],
    },
    { name: 'isAdult', type: 'checkbox', defaultValue: false },
    { name: 'relatedTags', type: 'relationship', relationTo: 'tags', hasMany: true },
    // Reverse: alle Anime mit diesem Tag (Anime speichert tags als Array {tag, rank})
    { name: 'anime', type: 'join', collection: 'anime', on: 'tags.tag' },
    seoFields,
  ],
}
