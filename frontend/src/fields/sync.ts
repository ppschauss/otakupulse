import type { Field } from 'payload'

// Externe IDs (AniList primär, MAL sekundär) für Dedupe & Re-Sync.
export const externalIdFields: Field[] = [
  { name: 'anilistId', type: 'number', unique: true, index: true, admin: { position: 'sidebar' } },
  { name: 'malId', type: 'number', index: true, admin: { position: 'sidebar' } },
]

// Sync-Metadaten: Herkunft, letzter Sync, Schutz vor Überschreiben.
export const syncMetaFields: Field[] = [
  { name: 'dataSource', type: 'text', defaultValue: 'anilist', admin: { position: 'sidebar' } },
  { name: 'lastSyncedAt', type: 'date', admin: { position: 'sidebar' } },
  {
    name: 'isEditoriallyLocked',
    type: 'checkbox',
    defaultValue: false,
    admin: { position: 'sidebar', description: 'Schützt manuelle Änderungen vor Überschreiben durch den Sync.' },
  },
]
