import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { AnimeCard } from '@/components/AnimeCard'
import { Pagination } from '@/components/Pagination'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { pageMeta } from '@/lib/seo'
import { DE_PROVIDER_SLUGS, providerBySlug } from '@/lib/streaming'
import { MIN_LIST_SIZE, platformListPage, platformListStats, resolveListFilter, STATIC_FILTER_KEYS, staticFilter } from '@/lib/platformLists'
import { Faq } from '@/components/Faq'
import { joinNames } from '@/lib/anime'
import { formatDateDe } from '@/lib/anime'

// Wie /plattform/[slug]: Pagination über searchParams → dynamisch.
export const dynamic = 'force-dynamic'
const PER_PAGE = 36

async function load(slug: string, filter: string) {
  const provider = providerBySlug(slug)
  if (!provider || !DE_PROVIDER_SLUGS.includes(slug)) return null
  const payload = await getPayload({ config })
  const f = await resolveListFilter(payload, filter)
  if (!f) return null
  return { payload, provider, f }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; filter: string }> }): Promise<Metadata> {
  const { slug, filter } = await params
  const ctx = await load(slug, filter)
  // notFound() schon hier. WICHTIG: Unter /plattform darf keine loading.tsx liegen —
  // eine Suspense-Grenze über dem Segment streamt die Shell mit Status 200, bevor
  // notFound() greift (Soft-404, auch für Googlebot). Die Skeletons wurden deshalb
  // entfernt; ungültige Anbieter/Filter liefern so einen echten 404.
  if (!ctx) notFound()
  const { payload, provider, f } = ctx
  const { total } = await platformListPage(payload, provider.slug, f, 1, 1)
  const month = new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' })
  return pageMeta({
    title: `${f.title(provider.name)} — ${total} Titel (${month}) | OtakuPulse`,
    description: f.intro(provider.name, total).slice(0, 160),
    path: `/plattform/${provider.slug}/${f.key}`,
    image: provider.logo,
    // Unter MIN_LIST_SIZE ist die Liste dünn → noindex (und nicht in der Sitemap).
    noindex: total < MIN_LIST_SIZE,
  })
}

export default async function PlatformListPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; filter: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { slug, filter } = await params
  const sp = await searchParams
  const ctx = await load(slug, filter)
  if (!ctx) notFound()
  const { payload, provider, f } = ctx
  const page = Math.max(1, Number(sp.page) || 1)
  const [{ docs, total }, stats] = await Promise.all([
    platformListPage(payload, provider.slug, f, page, PER_PAGE),
    platformListStats(payload, provider.slug, f),
  ])
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  const siblings = STATIC_FILTER_KEYS.filter((k) => k !== f.key)
  const stand = formatDateDe(stats.checkedAt)
  // Zahlen-Intro: das, was Snippets und KI-Antworten zitieren.
  const facts = [
    f.key !== 'deutscher-dub' && stats.dub ? `${stats.dub} mit deutscher Synchro` : '',
    f.key !== 'deutscher-sub' && stats.sub ? `${stats.sub} mit deutschen Untertiteln` : '',
    f.key !== 'kostenlos' && stats.free ? `${stats.free} kostenlos (mit Werbung)` : '',
    f.key !== 'neu' && stats.fresh ? `${stats.fresh} neu in den letzten 30 Tagen` : '',
  ].filter(Boolean)
  const faq = [
    {
      q: `Welche ${f.kind === 'genre' ? `${f.label}-Anime` : 'Anime'} gibt es ${f.key === 'kostenlos' ? 'kostenlos ' : ''}auf ${provider.name}${f.key === 'deutscher-dub' ? ' mit deutscher Synchro' : f.key === 'deutscher-sub' ? ' mit deutschen Untertiteln' : ''}?`,
      a: `${total} Titel${stand ? ` (Stand: ${stand})` : ''}${stats.top.length ? `, darunter ${joinNames(stats.top)}` : ''}. Die komplette Liste steht auf dieser Seite, sortiert nach Beliebtheit.`,
    },
    {
      q: `Wie viele dieser Anime laufen auf ${provider.name} mit deutscher Synchro?`,
      a: stats.dub ? `${stats.dub} von ${total} Titeln sind auf ${provider.name} mit deutscher Synchronfassung (Ger Dub) verfügbar${stats.sub ? `, ${stats.sub} mit deutschen Untertiteln` : ''}.` : `Für diese Auswahl ist auf ${provider.name} aktuell keine deutsche Synchronfassung gelistet – die Titel laufen im Original mit Untertiteln.`,
    },
    {
      q: `Kann man diese Anime auf ${provider.name} kostenlos streamen?`,
      a: stats.free ? `${stats.free} der ${total} Titel laufen auf ${provider.name} kostenlos mit Werbung, ohne Abo.` : `Nein – auf ${provider.name} sind diese Titel nur im Abo verfügbar.`,
    },
    {
      q: 'Wie aktuell ist diese Liste?',
      a: `Wir gleichen die Verfügbarkeit regelmäßig mit dem Katalog von ${provider.name} ab${stand ? `; letzter Abgleich: ${stand}` : ''}. Nur Titel mit direktem Link zum Stream werden aufgenommen.`,
    },
  ]

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Streaming-Anbieter', path: '/plattform' },
          { name: provider.name, path: `/plattform/${provider.slug}` },
          { name: f.label, path: `/plattform/${provider.slug}/${f.key}` },
        ]}
      />
      <p className="text-sm font-semibold uppercase tracking-widest" style={{ color: provider.color || undefined }}>
        {provider.name}
      </p>
      <h1 className="mt-1 text-3xl font-extrabold text-white">{f.title(provider.name)}</h1>
      <p className="mt-3 max-w-3xl leading-relaxed text-zinc-300">
        {f.intro(provider.name, total)}
        {facts.length ? ` Davon ${joinNames(facts)}.` : ''}
        {stand ? ` Stand: ${stand}.` : ''}
      </p>

      <div className="mt-5 flex flex-wrap gap-2 text-sm">
        <Link
          href={`/plattform/${provider.slug}`}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-zinc-400 transition hover:border-accent/40 hover:text-white"
        >
          Alle auf {provider.name}
        </Link>
        {siblings.map((k) => (
          <Link
            key={k}
            href={`/plattform/${provider.slug}/${k}`}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-zinc-400 transition hover:border-accent/40 hover:text-white"
          >
            {staticFilter(k)!.label}
          </Link>
        ))}
      </div>

      {docs.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Aktuell keine passenden Titel auf {provider.name}.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {docs.map((a: any) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </div>
      )}

      <Pagination basePath={`/plattform/${provider.slug}/${f.key}`} page={page} totalPages={totalPages} />

      {total >= MIN_LIST_SIZE ? <Faq items={faq} title={`Häufige Fragen: ${f.title(provider.name)}`} /> : null}

      <section className="mt-10 rounded-xl border border-white/10 bg-zinc-900/40 p-4 text-sm leading-relaxed text-zinc-400">
        <strong className="text-zinc-300">So entsteht diese Liste:</strong> Wir gleichen den Katalog von {provider.name}{' '}
        regelmäßig ab und übernehmen nur Titel mit direktem Link zum Stream. Sprachfassung, Staffel-Stand und
        Ablaufdatum stehen auf der jeweiligen Anime-Seite. Kataloge ändern sich laufend — maßgeblich ist immer das
        aktuelle Angebot bei {provider.name}.
      </section>
    </main>
  )
}
