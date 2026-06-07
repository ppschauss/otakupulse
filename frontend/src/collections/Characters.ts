import type { CollectionConfig } from 'payload'
import { externalIdFields, syncMetaFields } from '../fields/sync'
import { seoFields } from '../fields/seo'
import { footerTextField } from '../fields/footerText'

export const Characters: CollectionConfig = {
  slug: 'characters',
  labels: { singular: 'Charakter', plural: 'Charaktere' },
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
    { name: 'imageLocal', type: 'text', admin: { description: 'Lokal gespiegelter Pfad (später).' } },
    { name: 'descriptionSource', type: 'textarea', access: { read: ({ req }: any) => !!req?.user }, admin: { description: 'Originaltext (API).' } },
    { name: 'descriptionDe', type: 'textarea', admin: { description: 'Öffentlicher DE-Text.' } },
    {
      type: 'row',
      fields: [
        { name: 'gender', type: 'select', options: ['male', 'female', 'non_binary', 'unknown'] },
        { name: 'age', type: 'text', admin: { description: 'String (z.B. "unbekannt", "unsterblich").' } },
        { name: 'bloodType', type: 'text' },
      ],
    },
    {
      name: 'birthday',
      type: 'group',
      fields: [
        { name: 'month', type: 'number' },
        { name: 'day', type: 'number' },
      ],
    },
    { name: 'favorites', type: 'number', index: true },
    // Synchronsprecher (Character ↔ Person, pro Sprache)
    {
      name: 'voiceActors',
      type: 'array',
      labels: { singular: 'Synchronsprecher', plural: 'Synchronsprecher' },
      fields: [
        { name: 'person', type: 'relationship', relationTo: 'persons', required: true },
        { name: 'language', type: 'text', admin: { description: 'z.B. Japanese, German, English' } },
      ],
    },
    // Reverse: in welchen Anime taucht der Charakter auf (Anime speichert characters[].character)
    { name: 'appearances', type: 'join', collection: 'anime', on: 'characters.character' },
    ...syncMetaFields,
    footerTextField,
    seoFields,
  ],
}
