import type { CollectionConfig } from 'payload'
import { seoFields } from '../fields/seo'
import { footerTextField } from '../fields/footerText'

export const Genres: CollectionConfig = {
  slug: 'genres',
  labels: { singular: 'Genre', plural: 'Genres' },
  admin: { useAsTitle: 'name', group: 'Taxonomie', defaultColumns: ['name', 'slug'] },
  access: { read: () => true },
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    { name: 'descriptionDe', type: 'textarea', admin: { description: 'SEO-Genre-Text (eigene Formulierung, ~300+ Wörter).' } },
    { name: 'imageUrl', type: 'text' },
    { name: 'parentGenre', type: 'relationship', relationTo: 'genres' },
    { name: 'relatedGenres', type: 'relationship', relationTo: 'genres', hasMany: true },
    // Reverse: alle Anime in diesem Genre
    { name: 'anime', type: 'join', collection: 'anime', on: 'genres' },
    footerTextField,
    seoFields,
  ],
}
