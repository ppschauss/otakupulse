/**
 * Einmaliger Schema-Push (additive Änderungen) gegen die DB. NUR mit
 * NODE_ENV=development ausführen (sonst pusht der Postgres-Adapter nicht):
 *   docker exec --env-file secrets.env -e NODE_ENV=development otakupulse-enrich \
 *     sh -lc 'cd /app && npx tsx src/scripts/db-push.ts'
 * Additive Änderungen (neue Tabellen/Spalten) werden ohne Rückfrage angelegt.
 */
import { getPayload } from 'payload'
import config from '../payload.config'

getPayload({ config })
  .then(() => {
    console.log('✓ Schema-Push abgeschlossen.')
    process.exit(0)
  })
  .catch((err) => {
    console.error('✗ Schema-Push fehlgeschlagen:', err?.message || err)
    process.exit(1)
  })
