import type { CollectionConfig } from 'payload'

/**
 * Eingehende Kontakt-/Feedback-Anfragen vom öffentlichen /kontakt-Formular.
 * Anlage NUR über die Server-Action (Local API, overrideAccess) — die öffentliche
 * REST-API darf NICHT anlegen (create: false) → kein Spam-Endpunkt.
 */
export const ContactMessages: CollectionConfig = {
  slug: 'contact-messages',
  labels: { singular: 'Nachricht', plural: 'Nachrichten' },
  admin: {
    useAsTitle: 'subject',
    group: 'Redaktion',
    defaultColumns: ['subject', 'category', 'email', 'handled', 'createdAt'],
    description: 'Eingegangene Kontakt-/Feedback-Anfragen über das /kontakt-Formular.',
  },
  access: {
    create: () => false, // nur via Server-Action (overrideAccess); kein offener Endpunkt
    read: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => !!user,
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'name', type: 'text' },
        { name: 'email', type: 'email', required: true },
      ],
    },
    {
      name: 'category',
      type: 'select',
      defaultValue: 'feedback',
      options: [
        { label: 'Feedback', value: 'feedback' },
        { label: 'Fehler / Bug', value: 'bug' },
        { label: 'Datenkorrektur', value: 'correction' },
        { label: 'Kooperation / Werbung', value: 'partnership' },
        { label: 'Rechtliches / Urheberrecht', value: 'legal' },
        { label: 'Sonstiges', value: 'other' },
      ],
    },
    { name: 'subject', type: 'text', admin: { description: 'Betreff (optional).' } },
    { name: 'message', type: 'textarea', required: true },
    {
      name: 'handled',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar', description: 'Als erledigt markieren.' },
    },
  ],
}
