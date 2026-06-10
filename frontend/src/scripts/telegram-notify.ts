/**
 * Postet neu veröffentlichte Artikel (Anime-Ankündigungen + News) in den
 * Telegram-Channel. Dedup über das DB-Feld `telegramPostedAt` (gesetzt nach Versand).
 * Versand-Logik in src/lib/telegram.ts (geteilt mit dem Admin-Checkbox-Hook).
 *
 * Env (aus secrets.env): TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, NEXT_PUBLIC_SITE_URL.
 *
 * Aufruf (im enrich-Container):
 *   npx tsx src/scripts/telegram-notify.ts            # neue Artikel posten (max. --max, Default 8)
 *   npx tsx src/scripts/telegram-notify.ts --seed     # alle aktuell veröffentlichten als gepostet markieren (kein Versand)
 *   npx tsx src/scripts/telegram-notify.ts --dry       # nur anzeigen, was gepostet würde
 *   Flags: --max N
 */
import { getPayload } from 'payload'
import config from '../payload.config'
import { sendArticleToTelegram, telegramConfigured } from '../lib/telegram'

const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const seed = process.argv.includes('--seed')
  const dry = process.argv.includes('--dry')
  const max = arg('max') ? Number(arg('max')) : 8

  const payload = await getPayload({ config })

  // Veröffentlichte Artikel ohne Telegram-Versand, älteste zuerst.
  // Geplante Beiträge (publishDate in der Zukunft) werden erst zum Termin gepostet.
  const res = await payload.find({
    collection: 'articles',
    where: {
      and: [
        { _status: { equals: 'published' } },
        { telegramPostedAt: { exists: false } },
        { or: [{ publishDate: { less_than_equal: new Date().toISOString() } }, { publishDate: { exists: false } }] },
      ],
    },
    sort: 'publishDate',
    limit: 500,
    depth: 0,
  })
  const fresh = res.docs as any[]

  // --seed: Altbestand als „gepostet" markieren, KEIN Versand.
  if (seed) {
    const now = new Date().toISOString()
    for (const a of fresh) await payload.update({ collection: 'articles', id: a.id, data: { telegramPostedAt: now } as any, context: { skipTelegram: true } })
    console.log(`✓ Seed: ${fresh.length} Artikel als „gepostet" markiert (kein Versand).`)
    process.exit(0)
  }

  if (!telegramConfigured()) {
    console.log('⏭  Telegram nicht konfiguriert (TELEGRAM_BOT_TOKEN/CHANNEL_ID fehlt). Nichts zu tun.')
    process.exit(0)
  }

  console.log(`→ ${fresh.length} neue Artikel · poste bis zu ${max}${dry ? ' (dry)' : ''}`)
  let sent = 0
  for (const a of fresh.slice(0, max)) {
    if (dry) {
      console.log(`  [dry] ${a.title} → /news/${a.slug}`)
      continue
    }
    const r = await sendArticleToTelegram(a)
    if (r.ok) {
      await payload.update({ collection: 'articles', id: a.id, data: { telegramPostedAt: new Date().toISOString() } as any, context: { skipTelegram: true } })
      sent++
      console.log(`  [✓] ${a.title}`)
      await sleep(3000) // Channel-Rate-Limit schonen
    } else {
      console.warn(`  [✗] ${a.title} — ${r.error || 'Versand fehlgeschlagen'} (später erneut)`)
    }
  }
  console.log(`✓ Fertig. Gepostet: ${sent}${fresh.length > max ? ` · Rest folgt nächsten Lauf: ${fresh.length - max}` : ''}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
