/**
 * Befüllt das Global "navigation" einmalig mit den Standard-Menüs, damit sie im
 * Admin sichtbar und per Drag-and-drop sortierbar sind. Überschreibt vorhandene
 * Pflege NICHT (Abbruch, wenn schon Einträge existieren) — außer mit --force.
 *
 * Aufruf:  npm run seed:navigation   (optional: -- --force)
 */
import { getPayload } from 'payload'
import config from '../payload.config'
import { DEFAULT_NAV } from '../lib/navigation'

async function main() {
  const force = process.argv.includes('--force')
  const payload = await getPayload({ config })

  const existing: any = await payload.findGlobal({ slug: 'navigation' })
  const hasData =
    (existing?.header?.length || 0) > 0 ||
    (existing?.footerColumns?.length || 0) > 0 ||
    (existing?.legal?.length || 0) > 0
  if (hasData && !force) {
    console.log('Navigation ist bereits gepflegt — übersprungen (--force zum Überschreiben).')
    return
  }

  await payload.updateGlobal({
    slug: 'navigation',
    data: {
      header: DEFAULT_NAV.header.map((l) => ({ label: l.label, url: l.href })),
      footerColumns: DEFAULT_NAV.footerColumns.map((c) => ({
        title: c.title,
        links: c.links.map((l) => ({ label: l.label, url: l.href })),
      })),
      legal: DEFAULT_NAV.legal.map((l) => ({ label: l.label, url: l.href })),
    },
  })
  console.log('Navigation-Global mit Standard-Menüs befüllt.')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
