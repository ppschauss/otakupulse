import { getPayload } from 'payload'
import config from '@payload-config'
import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CopyButton } from '@/components/CopyButton'
import { pageMeta } from '@/lib/seo'
import { url, SITE_NAME } from '@/lib/site'

// Übersicht ändert sich selten (kuratierte Feeds) → 10 Min ISR.
export const revalidate = 600

export const metadata: Metadata = pageMeta({
  title: `RSS-Feeds abonnieren | ${SITE_NAME}`,
  description: `Alle RSS-Feeds von ${SITE_NAME} auf einen Blick: News, Simulcast-Kalender, Genre- und kuratierte Themen-Feeds — direkt in deinen Feed-Reader.`,
  path: '/feeds',
})

type FeedEntry = { name: string; description: string; path: string }

function FeedCard({ name, description, path }: FeedEntry) {
  const full = url(path)
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-white">{name}</h3>
          {description ? <p className="mt-1 text-sm text-zinc-400">{description}</p> : null}
        </div>
        <span className="shrink-0 rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-300">RSS</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <a href={path} className="min-w-0 flex-1 truncate rounded-lg bg-black/30 px-3 py-1.5 font-mono text-xs text-zinc-300 hover:text-white" target="_blank" rel="noopener noreferrer">
          {full}
        </a>
        <CopyButton text={full} />
      </div>
    </div>
  )
}

export default async function FeedsPage() {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'feeds', limit: 200, depth: 0, sort: 'name' })
  const curated = (docs as any[]).map((f) => ({
    name: f.name as string,
    description: (f.description as string) || 'Kuratierter Themen-Feed',
    path: `/feed/${f.slug}.xml`,
  }))

  const builtIn: FeedEntry[] = [
    { name: 'Alle News & Anime-Ankündigungen', description: 'Jeder neue Beitrag landet hier — der Haupt-Feed.', path: '/feed.xml' },
    {
      name: 'Simulcast-News',
      description: 'Nur Simulcast-Beiträge: Tages-Überblick, Episoden-News, Wochenvorschau & Rückblick.',
      path: '/news/kategorie/simulcast/feed.xml',
    },
    { name: 'Simulcast-Kalender', description: 'Anstehende Episoden der aktuellen Season.', path: '/kalender/feed.xml' },
  ]

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Breadcrumbs items={[{ name: 'Start', path: '/' }, { name: 'RSS-Feeds', path: '/feeds' }]} />
      <h1 className="text-3xl font-extrabold text-white">RSS-Feeds abonnieren</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-zinc-300">
        Kopier dir eine Feed-URL und füg sie in deinen RSS-Reader ein (z. B. Feedly, Inoreader, NetNewsWire) — so
        verpasst du keine News, Ankündigung oder neue Episode mehr.
      </p>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-white">Haupt-Feeds</h2>
        <div className="mt-4 grid gap-3">
          {builtIn.map((f) => <FeedCard key={f.path} {...f} />)}
        </div>
      </section>

      {curated.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-lg font-bold text-white">Themen-Feeds</h2>
          <p className="mt-1 text-sm text-zinc-400">Kuratierte Kanäle zu bestimmten Themen.</p>
          <div className="mt-4 grid gap-3">
            {curated.map((f) => <FeedCard key={f.path} {...f} />)}
          </div>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="text-lg font-bold text-white">Genre-Feeds</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Zu jedem Genre gibt es einen eigenen Feed nach dem Muster{' '}
          <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs text-zinc-300">/genre/&lt;name&gt;/feed.xml</code>{' '}
          — z. B. <a href="/genre/action/feed.xml" className="text-accent hover:underline">/genre/action/feed.xml</a>. Alle Genres findest du in der{' '}
          <a href="/genre" className="text-accent hover:underline">Genre-Übersicht</a>.
        </p>
      </section>
    </main>
  )
}
