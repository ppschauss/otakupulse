import type { CollectionConfig } from 'payload'
import { externalIdFields, syncMetaFields } from '../fields/sync'
import { seoFields } from '../fields/seo'
import { footerTextField } from '../fields/footerText'

export const Persons: CollectionConfig = {
  slug: 'persons',
  labels: { singular: 'Person', plural: 'Personen' },
  admin: { useAsTitle: 'nameRomaji', group: 'Katalog', defaultColumns: ['nameRomaji', 'slug', 'favorites'] },
  access: { read: () => true },
  fields: [
    ...externalIdFields,
    { name: 'slug', type: 'text', required: true, unique: true, index: true },
    {
      type: 'row',
      fields: [
        { name: 'nameRomaji', type: 'text', required: true },
        { name: 'nameEnglish', type: 'text' },
        { name: 'nameNative', type: 'text' },
      ],
    },
    { name: 'aliases', type: 'text', hasMany: true },
    { name: 'imageUrl', type: 'text' },
    { name: 'imageLocal', type: 'text' },
    { name: 'bioSource', type: 'textarea', admin: { description: 'Originaltext (API).' } },
    { name: 'bioDe', type: 'textarea', admin: { description: 'Öffentlicher DE-Text.' } },
    {
      type: 'row',
      fields: [
        { name: 'birthDate', type: 'date' },
        { name: 'deathDate', type: 'date' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'birthPlace', type: 'text' },
        { name: 'gender', type: 'select', options: ['male', 'female', 'non_binary', 'unknown'] },
        { name: 'bloodType', type: 'text' },
      ],
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      options: ['voice_actor', 'director', 'writer', 'mangaka', 'illustrator', 'composer', 'producer', 'other'],
    },
    { name: 'website', type: 'text' },
    {
      name: 'socialLinks',
      type: 'array',
      fields: [
        { name: 'platform', type: 'text' },
        { name: 'url', type: 'text' },
      ],
    },
    { name: 'favorites', type: 'number', index: true },
    // Reverse: Staff-Credits (Anime speichert staff[].person)
    { name: 'staffCredits', type: 'join', collection: 'anime', on: 'staff.person' },
    // Reverse: Sprechrollen (Characters speichert voiceActors[].person)
    { name: 'voiceCredits', type: 'join', collection: 'characters', on: 'voiceActors.person' },
    ...syncMetaFields,
    footerTextField,
    seoFields,
  ],
}
