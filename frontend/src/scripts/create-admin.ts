/**
 * Legt einen Admin-User an (falls noch nicht vorhanden).
 * Aufruf:  npx tsx src/scripts/create-admin.ts [email] [passwort]
 */
import { getPayload } from 'payload'
import config from '../payload.config'

async function main() {
  const email = process.argv[2] || 'admin@otakupulse.local'
  const password = process.argv[3] || 'OtakuPulse2026!'

  const payload = await getPayload({ config })
  const existing = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1 })
  if (existing.docs.length) {
    console.log(`User existiert bereits: ${email}`)
    process.exit(0)
  }
  await payload.create({ collection: 'users', data: { email, password, name: 'Admin', role: 'admin' } as any })
  console.log(`✓ Admin angelegt — Login: ${email}  ·  Passwort: ${password}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
