import { getPayload } from 'payload'
import config from '@payload-config'
import type { Metadata } from 'next'
import { TagBrowser, type TagSection } from '@/components/TagBrowser'
import { pageMeta } from '@/lib/seo'
import { TAG_CATEGORY_LABELS } from '@/lib/anime'

export const dynamic = 'force-dynamic'

// Reihenfolge der Kategorie-Sektionen
const ORDER = ['theme', 'setting', 'element', 'demographic', 'mood', '_none']

export const metadata: Metadata = pageMeta({
  title: 'Anime-Tags nach Thema — durchsuchbar mit Anzahl | OtakuPulse',
  description:
    'Alle thematischen Anime-Tags, gruppiert nach Kategorie (Thema, Setting, Element, Zielgruppe, Stimmung) — mit Live-Suche, Anzahl der Titel und den beliebtesten Tags.',
  path: '/tag',
})

export default async function TagListPage() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'tags', limit: 2000, sort: 'name', depth: 0 })

  // Anime-Anzahl pro Tag (eine Aggregation).
  const pool = (payload.db as any).pool
  const { rows } = await pool.query(
    `SELECT tag_id AS id, count(*)::int AS n FROM anime_tags WHERE tag_id IS NOT NULL GROUP BY tag_id`,
  )
  const countById = new Map<number, number>(rows.map((r: any) => [r.id, r.n]))

  const enriched = (docs as any[]).map((t) => ({
    name: t.name as string,
    slug: t.slug as string,
    n: countById.get(t.id) ?? 0,
    category: t.category || '_none',
  }))

  // Nach Kategorie gruppieren
  const groups = new Map<string, typeof enriched>()
  for (const t of enriched) {
    if (!groups.has(t.category)) groups.set(t.category, [])
    groups.get(t.category)!.push(t)
  }
  const label = (k: string) => (k === '_none' ? 'Sonstige' : TAG_CATEGORY_LABELS[k] || k)
  const sections: TagSection[] = ORDER.filter((k) => groups.has(k)).map((k) => ({
    key: k,
    label: label(k),
    tags: groups.get(k)!.map(({ name, slug, n }) => ({ name, slug, n })),
  }))

  const popular = [...enriched]
    .filter((t) => t.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 24)
    .map(({ name, slug, n }) => ({ name, slug, n }))

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Tags</h1>
      <p className="mt-1 text-zinc-400">{docs.length.toLocaleString('de-DE')} Tags · nach Thema gruppiert</p>

      {docs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Noch keine Tags.
        </div>
      ) : (
        <TagBrowser sections={sections} popular={popular} />
      )}
    </main>
  )
}
