import type { CollectionConfig } from 'payload'

const isAdmin = ({ req }: any) => req?.user?.role === 'admin'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
    group: 'Redaktion',
  },
  // Brute-Force-Schutz explizit (statt Framework-Default): 5 Versuche → 15 Min Sperre.
  auth: { maxLoginAttempts: 5, lockTime: 15 * 60 * 1000 },
  access: {
    // Nur Admins legen Nutzer an, löschen oder ändern sie (verhindert Rechte-Missbrauch).
    read: ({ req: { user } }) => !!user,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'role',
      type: 'select',
      defaultValue: 'editor',
      // Nur Admins dürfen Rollen vergeben/ändern → kein Self-Promote zum Admin.
      access: { create: isAdmin, update: isAdmin },
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'Autor', value: 'contributor' },
      ],
    },
  ],
}
