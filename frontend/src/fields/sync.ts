import type { Field } from 'payload'

// Externe IDs (AniList primär, MAL sekundär) für Dedupe & Re-Sync.
export const externalIdFields: Field[] = [
  { name: 'anilistId', type: 'number', unique: true, index: true, admin: { position: 'sidebar' } },
  { name: 'malId', type: 'number', index: true, admin: { position: 'sidebar' } },
]

// Interne Felder: nur für eingeloggte Redaktion lesbar, NICHT über die öffentliche
// REST/GraphQL-API. Server-Komponenten nutzen die Local API (overrideAccess) und
// sehen die Felder weiterhin → Seiten/Skripte funktionieren unverändert.
export const internalRead = { read: ({ req }: any) => !!req?.user }

// Sync-Metadaten: Herkunft, letzter Sync, Schutz vor Überschreiben.
export const syncMetaFields: Field[] = [
  { name: 'dataSource', type: 'text', defaultValue: 'anilist', access: internalRead, admin: { position: 'sidebar' } },
  { name: 'lastSyncedAt', type: 'date', access: internalRead, admin: { position: 'sidebar' } },
  {
    name: 'isEditoriallyLocked',
    type: 'checkbox',
    defaultValue: false,
    access: internalRead,
    admin: { position: 'sidebar', description: 'Schützt manuelle Änderungen vor Überschreiben durch den Sync.' },
  },
]
