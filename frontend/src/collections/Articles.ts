import type { CollectionConfig } from 'payload'
import { seoFields } from '../fields/seo'

export const Articles: CollectionConfig = {
  slug: 'articles',
  labels: { singular: 'Artikel', plural: 'Artikel' },
  admin: {
    useAsTitle: 'title',
    group: 'Redaktion',
    defaultColumns: ['title', 'category', 'publishDate', 'telegramPostedAt', '_status'],
  },
  access: {
    // Anonyme sehen NUR veröffentlichte Artikel; eingeloggte Redaktion auch Entwürfe.
    read: ({ req: { user } }) => (user ? true : { _status: { equals: 'published' } }),
  },
  // Redaktioneller Workflow: Draft → Published
  versions: { drafts: true },
  hooks: {
    afterChange: [
      // Checkbox „Jetzt auf Telegram posten" → bei veröffentlichtem Artikel sofort senden.
      async ({ doc, req, context }) => {
        if ((context as any)?.skipTelegram) return doc
        if (!doc?.pushToTelegram || doc._status !== 'published') return doc
        const { sendArticleToTelegram } = await import('../lib/telegram')
        const r = await sendArticleToTelegram(doc)
        await req.payload.update({
          collection: 'articles',
          id: doc.id,
          data: { pushToTelegram: false, ...(r.ok ? { telegramPostedAt: new Date().toISOString() } : {}) } as any,
          context: { skipTelegram: true },
        })
        if (!r.ok) req.payload.logger.error(`Telegram-Push „${doc.title}" fehlgeschlagen: ${r.error}`)
        return doc
      },
    ],
  },
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
    // --- Telegram ---
    {
      name: 'pushToTelegram',
      type: 'checkbox',
      defaultValue: false,
      access: { read: ({ req }: any) => !!req?.user },
      admin: {
        position: 'sidebar',
        description: 'Beim Speichern in den Telegram-Channel posten (nur bei veröffentlichten Artikeln). Wird danach automatisch zurückgesetzt.',
      },
    },
    {
      name: 'telegramPostedAt',
      type: 'date',
      access: { read: ({ req }: any) => !!req?.user },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Zeitpunkt des Telegram-Versands (leer = noch nicht gepostet).',
      },
    },
    seoFields,
  ],
}
