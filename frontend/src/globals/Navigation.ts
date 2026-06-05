import type { Field, GlobalConfig } from 'payload'

// Wiederverwendbare Link-Felder (Label + Ziel).
const linkFields: Field[] = [
  { name: 'label', type: 'text', required: true },
  {
    name: 'url',
    type: 'text',
    required: true,
    admin: { description: 'Interner Pfad (z. B. /anime) oder externe URL (https://…).' },
  },
]

export const Navigation: GlobalConfig = {
  slug: 'navigation',
  label: 'Navigation & Menüs',
  admin: {
    group: 'Einstellungen',
    description:
      'Steuert Haupt- und Footer-Menü der Website. Einträge per Drag-and-drop sortierbar. ' +
      'Lässt du eine Liste leer, wird automatisch das Standard-Menü angezeigt.',
  },
  access: { read: () => true },
  fields: [
    {
      name: 'header',
      type: 'array',
      label: 'Hauptmenü (Kopfzeile)',
      admin: { description: 'Links in der oberen Navigationsleiste.', initCollapsed: false },
      fields: linkFields,
    },
    {
      name: 'footerColumns',
      type: 'array',
      label: 'Footer-Spalten',
      admin: { description: 'Jede Spalte hat einen Titel und eine Linkliste.' },
      labels: { singular: 'Spalte', plural: 'Spalten' },
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'links', type: 'array', label: 'Links', fields: linkFields },
      ],
    },
    {
      name: 'legal',
      type: 'array',
      label: 'Rechtliches (untere Footer-Zeile)',
      admin: { description: 'z. B. Impressum, Datenschutz.' },
      fields: linkFields,
    },
  ],
}
