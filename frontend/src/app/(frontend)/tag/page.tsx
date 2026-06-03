import { getPayload } from 'payload'
import config from '@payload-config'
import { Chip } from '@/components/Chip'
import { TAG_CATEGORY_LABELS } from '@/lib/anime'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Anime-Tags nach Thema — OtakuPulse',
  description: 'Alle thematischen Anime-Tags, gruppiert nach Kategorie: Thema, Setting, Zielgruppe und mehr.',
}

// Reihenfolge der Kategorie-Sektionen
const ORDER = ['theme', 'setting', 'element', 'demographic', 'mood', '_none']

export default async function TagListPage() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'tags', limit: 2000, sort: 'name', depth: 0 })

  const groups = new Map<string, any[]>()
  for (const t of docs as any[]) {
    const key = t.category || '_none'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(t)
  }
  const sections = ORDER.filter((k) => groups.has(k))

  const label = (k: string) => (k === '_none' ? 'Sonstige' : TAG_CATEGORY_LABELS[k] || k)

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Tags</h1>
      <p className="mt-1 text-zinc-400">{docs.length} Tags · nach Thema gruppiert</p>

      {docs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Noch keine Tags.
        </div>
      ) : (
        <>
          {/* Kategorie-Sprungnav */}
          <nav className="sticky top-16 z-10 mt-6 flex flex-wrap gap-2 rounded-xl border border-white/10 bg-zinc-950/80 p-2 backdrop-blur">
            {sections.map((k) => (
              <a
                key={k}
                href={`#cat-${k}`}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-200 transition hover:bg-accent/20 hover:text-accent"
              >
                {label(k)} <span className="text-xs text-zinc-500">{groups.get(k)!.length}</span>
              </a>
            ))}
          </nav>

          <div className="mt-8 space-y-10">
            {sections.map((k) => (
              <section key={k} id={`cat-${k}`} className="scroll-mt-28">
                <h2 className="mb-3 text-lg font-bold text-white">
                  <span className="mr-2 inline-block h-4 w-1 translate-y-0.5 rounded bg-gradient-to-b from-accent to-accent-2 align-middle" />
                  {label(k)}
                </h2>
                <div className="flex flex-wrap gap-2.5">
                  {groups.get(k)!.map((t: any) => (
                    <Chip key={t.id} href={`/tag/${t.slug}`}>
                      {t.name}
                    </Chip>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </main>
  )
}
