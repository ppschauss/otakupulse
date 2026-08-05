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
    // Zeitpunkt der letzten INHALTLICHEN Änderung — Quelle für <lastmod> in der Sitemap.
    //
    // `updatedAt` taugt dafür nicht: der nächtliche Sync schreibt jeden laufenden
    // Anime und dessen Charaktere neu, auch wenn sich nur `popularity` oder
    // `favorites` um ein paar Punkte bewegt haben. Das sind ~2.300 Dokumente pro
    // Nacht, die Google als „geändert" gemeldet bekäme, ohne dass sich für einen
    // Leser irgendetwas geändert hat. Google stuft `lastmod` dann site-weit als
    // unzuverlässig ein und ignoriert es — und wir verbrennen Crawl-Budget.
    //
    // Gepflegt wird das Feld in lib/import.ts über eine explizite Positivliste
    // der Felder, die für Leser zählen (Titel, Status, Episodenzahl, Beschreibung,
    // Bilder, Genres, Studios …). Bewusst NICHT dabei: Score/Popularity/Favorites.
    name: 'contentUpdatedAt',
    type: 'date',
    index: true,
    access: internalRead,
    admin: { position: 'sidebar', readOnly: true, description: 'Letzte inhaltliche Änderung (Basis für <lastmod>).' },
  },
  {
    name: 'isEditoriallyLocked',
    type: 'checkbox',
    defaultValue: false,
    access: internalRead,
    admin: { position: 'sidebar', description: 'Schützt manuelle Änderungen vor Überschreiben durch den Sync.' },
  },
]
