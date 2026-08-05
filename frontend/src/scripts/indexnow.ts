/**
 * IndexNow-Submitter — meldet URLs an IndexNow (Bing, Yandex, Seznam, Naver …).
 *
 * IndexNow ist ein Push-Protokoll: statt darauf zu warten, dass Crawler die Sitemap
 * abholen, teilen wir teilnehmenden Suchmaschinen NEUE/GEÄNDERTE URLs sofort mit.
 * Ein einziger POST an api.indexnow.org verteilt an alle teilnehmenden Engines.
 *
 * Voraussetzung:
 *   - Key-Datei muss unter  {SITE_URL}/{INDEXNOW_KEY}.txt  erreichbar sein und den
 *     reinen Key enthalten (liegt in public/{key}.txt).
 *   - Env  INDEXNOW_KEY  (in secrets.env). Optional INDEXNOW_KEY_LOCATION (Voll-URL
 *     zur Key-Datei), sonst wird {SITE_URL}/{key}.txt angenommen.
 *
 * Aufruf:
 *   npm run indexnow -- --all            # gesamte kanonische Site (aus Sitemap-TYPES + statische Pfade)
 *   npm run indexnow -- --recent 3       # nur in den letzten 3 Tagen neu/geänderte Anime + Artikel
 *   npm run indexnow -- --recent 3 --dry # nichts senden, nur zählen/anzeigen
 *   npm run indexnow -- --all --limit 50 # zum Testen: max. 50 URLs
 */
import { getPayload } from 'payload'
import config from '../payload.config'
import { SITE_URL, url } from '../lib/site'
import { TYPES, STATIC_PATHS, resolveWhere } from '../lib/sitemap'

const ENDPOINT = 'https://api.indexnow.org/indexnow'
const BATCH = 10000 // IndexNow-Maximum pro Request
const PAGE = 2000 // Payload-Pagination pro Query

const KEY = process.env.INDEXNOW_KEY
const HOST = new URL(SITE_URL).host
const KEY_LOCATION = process.env.INDEXNOW_KEY_LOCATION || `${SITE_URL}/${KEY}.txt`

const args = process.argv.slice(2)
const has = (f: string) => args.includes(f)
const val = (f: string) => {
  const i = args.indexOf(f)
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined
}

const DRY = has('--dry')
const LIMIT = val('--limit') ? Number(val('--limit')) : undefined

function fail(msg: string): never {
  console.error(`FEHLER: ${msg}`)
  process.exit(1)
}

if (!KEY) fail('INDEXNOW_KEY nicht gesetzt (secrets.env).')
if (SITE_URL.includes('localhost')) fail(`SITE_URL ist ${SITE_URL} — IndexNow braucht die öffentliche Domain (NEXT_PUBLIC_SITE_URL).`)

// --- URL-Sammlung -----------------------------------------------------------

/** Alle kanonischen Site-URLs (dieselben Quellen wie die Sitemap). */
async function collectAll(payload: any): Promise<string[]> {
  const out = new Set<string>()
  for (const p of STATIC_PATHS) out.add(url(p))

  for (const type of TYPES) {
    const where = resolveWhere(type.where)
    let page = 1
    for (;;) {
      const res = await payload.find({
        collection: type.collection,
        where,
        limit: PAGE,
        page,
        depth: 0,
        select: { slug: true } as any,
        pagination: true,
      })
      for (const doc of res.docs as any[]) {
        if (doc.slug) out.add(url(type.path(doc.slug)))
      }
      console.log(`  ${type.key}: Seite ${page}/${res.totalPages} (${out.size} URLs gesamt)`)
      if (!res.hasNextPage) break
      page++
    }
  }
  return [...out]
}

/** Nur zuletzt neu/geänderte Inhalte (updatedAt >= Cutoff). */
async function collectRecent(payload: any, days: number): Promise<string[]> {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString()
  const out = new Set<string>()

  // Anime: /anime/<slug> + qualifizierte /streamen und /aehnlich
  const animeTypes = TYPES.filter((t) => t.collection === 'anime')
  for (const type of animeTypes) {
    const base = resolveWhere(type.where)
    const where = base
      ? { and: [base, { updatedAt: { greater_than_equal: cutoff } }] }
      : { updatedAt: { greater_than_equal: cutoff } }
    let page = 1
    for (;;) {
      const res = await payload.find({
        collection: 'anime',
        where,
        limit: PAGE,
        page,
        depth: 0,
        select: { slug: true } as any,
        pagination: true,
      })
      for (const doc of res.docs as any[]) if (doc.slug) out.add(url(type.path(doc.slug)))
      if (!res.hasNextPage) break
      page++
    }
  }

  // Artikel: nur live geschaltete, zuletzt geänderte
  const artType = TYPES.find((t) => t.collection === 'articles')
  if (artType) {
    const base = resolveWhere(artType.where)
    const where = { and: [...(base?.and || [base]).filter(Boolean), { updatedAt: { greater_than_equal: cutoff } }] }
    let page = 1
    for (;;) {
      const res = await payload.find({
        collection: 'articles',
        where,
        limit: PAGE,
        page,
        depth: 0,
        select: { slug: true } as any,
        pagination: true,
      })
      for (const doc of res.docs as any[]) if (doc.slug) out.add(url(artType.path(doc.slug)))
      if (!res.hasNextPage) break
      page++
    }
  }

  return [...out]
}

// --- Submit -----------------------------------------------------------------

async function submitBatch(urls: string[]): Promise<number> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urls }),
  })
  const body = await res.text().catch(() => '')
  console.log(`  → HTTP ${res.status}${body ? ` ${body.slice(0, 200)}` : ''}`)
  return res.status
}

async function main() {
  const days = val('--recent') ? Number(val('--recent')) : undefined
  const mode = days != null ? `recent(${days}d)` : 'all'
  console.log(`IndexNow: Modus=${mode} host=${HOST} keyLocation=${KEY_LOCATION}${DRY ? ' [DRY-RUN]' : ''}`)

  const payload = await getPayload({ config })
  let urls = days != null ? await collectRecent(payload, days) : await collectAll(payload)
  if (LIMIT) urls = urls.slice(0, LIMIT)

  console.log(`Gesammelt: ${urls.length} URLs`)
  if (urls.length === 0) {
    console.log('Nichts zu senden.')
    process.exit(0)
  }
  console.log('Beispiele:', urls.slice(0, 5).join('  '))

  if (DRY) {
    console.log('[DRY-RUN] Kein Versand.')
    process.exit(0)
  }

  let ok = 0
  for (let i = 0; i < urls.length; i += BATCH) {
    const batch = urls.slice(i, i + BATCH)
    console.log(`Batch ${Math.floor(i / BATCH) + 1}: ${batch.length} URLs`)
    const status = await submitBatch(batch)
    if (status >= 200 && status < 300) ok += batch.length
  }
  console.log(`Fertig: ${ok}/${urls.length} URLs erfolgreich gemeldet.`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
