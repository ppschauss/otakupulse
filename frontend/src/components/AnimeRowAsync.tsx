import { getPayload } from 'payload'
import config from '@payload-config'
import { MediaRow } from './MediaRow'

// Rotation: alle 6 Stunden ein neuer Seed → die Reihen wirken dynamisch, bleiben
// innerhalb eines Zeitfensters aber stabil (konsistent für alle Besucher + cachebar).
const ROTATE_MS = 6 * 60 * 60 * 1000

// Deterministischer Hash (id + Seed) → Sortierschlüssel für einen reproduzierbaren Shuffle.
function shuffleKey(id: any, seed: number): number {
  let h = (Number(id) >>> 0) ^ Math.imul(seed, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

// Async-Serverkomponente: holt ihre Daten selbst und rendert eine MediaRow.
// In <Suspense> verpackt streamt jede Reihe unabhängig nach.
export async function AnimeRowAsync({
  title,
  href,
  where = {},
  sort = '-popularity',
  genreSlug,
  // 12 statt 20: Die Startseite lag bei ~930 KB HTML (7 Reihen × 20 Karten, jede Karte
  // doppelt — im HTML und im RSC-Payload). 12 Karten reichen für die scrollbare Reihe,
  // der „mehr →"-Link führt zur vollen Liste. Spart ~40 % Seitengewicht.
  display = 12,
  rotate = true,
}: {
  title: string
  href?: string
  where?: any
  sort?: string
  genreSlug?: string
  /** Wie viele Titel die Reihe zeigt. */
  display?: number
  /** Pool zeit-rotierend durchmischen (Standard: an). */
  rotate?: boolean
}) {
  const payload = await getPayload({ config })

  let finalWhere = where
  if (genreSlug) {
    const g = await payload.find({ collection: 'genres', where: { slug: { equals: genreSlug } }, limit: 1, depth: 0 })
    const id = (g.docs[0] as any)?.id
    if (!id) return null
    finalWhere = { genres: { in: [id] } }
  }

  // Größeren Pool aus dem Top-Bereich holen, dann pro Zeitfenster mischen und kürzen.
  const pool = rotate ? Math.min(display * 3, 60) : display
  const { docs } = await payload.find({ collection: 'anime', where: finalWhere, sort, limit: pool, depth: 0 })

  let items = docs
  if (rotate && docs.length > display) {
    const seed = Math.floor(Date.now() / ROTATE_MS)
    items = [...docs].sort((a: any, b: any) => shuffleKey(a.id, seed) - shuffleKey(b.id, seed)).slice(0, display)
  }

  return <MediaRow title={title} href={href} items={items} />
}
