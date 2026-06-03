import type { CollectionConfig } from 'payload'
import { seoFields } from '../fields/seo'

export const Articles: CollectionConfig = {
  slug: 'articles',
  labels: { singular: 'Artikel', plural: 'Artikel' },
  admin: {
    useAsTitle: 'title',
    group: 'Redaktion',
    defaultColumns: ['title', 'category', 'publishDate', '_status'],
  },
  access: { read: () => true },
  // Redaktioneller Workflow: Draft → Published
  versions: { drafts: true },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'excerpt', type: 'textarea', admin: { description: 'Teaser/Meta-Description (~160 Zeichen).' } },
    { name: 'coverImageUrl', type: 'text' },
    {
      name: 'category',
      type: 'select',
      options: ['news', 'review', 'editorial', 'guide', 'ranking', 'seasonal_preview'],
    },
    { name: 'body', type: 'richText' },
    { name: 'author', type: 'relationship', relationTo: 'authors' },
    { name: 'publishDate', type: 'date' },
    { name: 'relatedAnime', type: 'relationship', relationTo: 'anime', hasMany: true },
    { name: 'relatedCharacters', type: 'relationship', relationTo: 'characters', hasMany: true },
    { name: 'relatedPersons', type: 'relationship', relationTo: 'persons', hasMany: true },
    { name: 'tags', type: 'relationship', relationTo: 'tags', hasMany: true },
    {
      type: 'row',
      fields: [
        { name: 'isFeatured', type: 'checkbox', defaultValue: false },
        { name: 'isPinned', type: 'checkbox', defaultValue: false },
      ],
    },
    seoFields,
  ],
}
