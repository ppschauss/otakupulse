import type { GlobalConfig } from 'payload'

// Allgemeine Seiten-Einstellungen inkl. Jugendschutz.
export const Settings: GlobalConfig = {
  slug: 'settings',
  label: 'Jugendschutz & Allgemein',
  admin: {
    group: 'Einstellungen',
    description: 'Globale Schalter für die Website.',
  },
  access: { read: () => true },
  fields: [
    {
      name: 'blurAdultCovers',
      type: 'checkbox',
      defaultValue: true,
      label: 'Hentai-Cover unkenntlich machen (Blur + FSK-18-Siegel)',
      admin: {
        description:
          'Wenn aktiv, werden alle Cover/Banner von Titeln der Genre „Hentai" verschwommen dargestellt und mit ' +
          'einem FSK-18-Siegel überlagert. Deaktivieren zeigt die Bilder normal an. (Unabhängig davon werden ' +
          'Hentai-Titel nie automatisch in News/RSS-Feeds eingespeist — das geht nur manuell.)',
      },
    },
  ],
}
