/**
 * Bild-Spiegelung: lädt Cover/Banner (Anime) sowie Charakter-/Personen-Portraits
 * vom AniList-CDN herunter und legt sie INNERHALB des Projekts unter
 * `public/media/...` ab (ausgeliefert unter `/media/...`). Setzt die *Local-Felder.
 *
 * Alles im selben Root → portabel beim Stagen auf einen externen Host.
 *
 * Aufruf:
 *   npm run mirror                         # alles (Anime, Charaktere, Personen)
 *   npm run mirror -- --anime              # nur Anime-Cover/Banner
 *   npm run mirror -- --characters --persons
 */
import { getPayload, type Payload } from 'payload'
import config from '../payload.config'
import fs from 'fs/promises'
import path from 'path'

const MEDIA_ROOT = path.resolve(process.cwd(), 'public', 'media')
const CONCURRENCY = 8

function extOf(u: string): string {
  const m = u.match(/\.(jpe?g|png|webp|gif)(\?|$)/i)
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg'
}

// /media/<type>/<bucket>/<id>.<ext> — Bucket bündelt je 1000 IDs in einen Ordner.
function localPaths(type: string, id: number, remote: string) {
  const bucket = Math.floor(id / 1000)
  const rel = `/media/${type}/${bucket}/${id}.${extOf(remote)}`
  const abs = path.join(MEDIA_ROOT, type, String(bucket), `${id}.${extOf(remote)}`)
  return { rel, abs }
}

async function download(remote: string, abs: string): Promise<boolean> {
  try {
    const res = await fetch(remote)
    if (!res.ok) return false
    const buf = Buffer.from(await res.arrayBuffer())
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, buf)
    return true
  } catch {
    return false
  }
}

async function fileExists(abs: string): Promise<boolean> {
  try {
    await fs.access(abs)
    return true
  } catch {
    return false
  }
}

async function pool<T>(items: T[], n: number, fn: (it: T) => Promise<void>) {
  let i = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++
        await fn(items[idx])
      }
    }),
  )
}

// Generischer Durchlauf über eine Collection.
async function mirrorCollection(
  payload: Payload,
  opts: {
    collection: any
    type: string
    // Liefert die zu spiegelnden Bilder eines Docs: [{ field, localField, url }]
    images: (doc: any) => { field: string; localField: string; url?: string | null }[]
  },
) {
  let page = 1
  let done = 0
  let downloaded = 0
  let failed = 0
  for (;;) {
    const res = await payload.find({ collection: opts.collection, limit: 500, page, depth: 0 })
    if (!res.docs.length) break

    // 1) Downloads parallel — sammelt die anstehenden DB-Updates.
    const pending: { id: any; updates: Record<string, string> }[] = []
    await pool(res.docs as any[], CONCURRENCY, async (doc) => {
      const updates: Record<string, string> = {}
      for (const img of opts.images(doc)) {
        if (!img.url || doc[img.localField]) continue
        const id = doc.anilistId || doc.id
        const { rel, abs } = localPaths(`${opts.type}/${img.field}`, Number(id), img.url)
        const ok = (await fileExists(abs)) || (await download(img.url, abs))
        if (ok) {
          updates[img.localField] = rel
          downloaded++
        }
      }
      if (Object.keys(updates).length) pending.push({ id: doc.id, updates })
    })

    // 2) DB-Updates SERIELL + fehlertolerant — Payload schreibt verschachtelte
    //    Arrays (Relations, voiceActors) neu; parallel würde das die DB sperren.
    for (const u of pending) {
      try {
        await payload.update({ collection: opts.collection, id: u.id, data: u.updates as any })
      } catch {
        failed++
      }
    }

    done += res.docs.length
    console.log(`  ${opts.type}: Seite ${page} · ${done} Docs · ${downloaded} Bilder · ${failed} Update-Fehler`)
    if (!res.nextPage) break
    page = res.nextPage
  }
  return { done, downloaded, failed }
}

async function main() {
  const args = process.argv.slice(2)
  const all = args.length === 0
  const want = (k: string) => all || args.includes(`--${k}`)

  const payload = await getPayload({ config })
  console.log(`→ Bild-Spiegelung nach ${MEDIA_ROOT}`)

  if (want('anime')) {
    console.log('→ Anime (Cover + Banner) …')
    const r = await mirrorCollection(payload, {
      collection: 'anime',
      type: 'anime',
      images: (d) => [
        { field: 'cover', localField: 'coverImageLocal', url: d.coverImageUrl },
        { field: 'banner', localField: 'bannerImageLocal', url: d.bannerImageUrl },
      ],
    })
    console.log(`✓ Anime: ${r.downloaded} Bilder`)
  }

  if (want('characters')) {
    console.log('→ Charaktere …')
    const r = await mirrorCollection(payload, {
      collection: 'characters',
      type: 'character',
      images: (d) => [{ field: 'img', localField: 'imageLocal', url: d.imageUrl }],
    })
    console.log(`✓ Charaktere: ${r.downloaded} Bilder`)
  }

  if (want('persons')) {
    console.log('→ Personen …')
    const r = await mirrorCollection(payload, {
      collection: 'persons',
      type: 'person',
      images: (d) => [{ field: 'img', localField: 'imageLocal', url: d.imageUrl }],
    })
    console.log(`✓ Personen: ${r.downloaded} Bilder`)
  }

  console.log('✓ Spiegelung abgeschlossen.')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
