import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import { ARTICLE_CATEGORY_LABELS } from '@/lib/anime'

function fmtDate(d?: string | null) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
  } catch {
    return ''
  }
}

const CATEGORY_KEYS = Object.keys(ARTICLE_CATEGORY_LABELS)

// Tag-Cloud: Schriftgröße in 5 Stufen nach Häufigkeit.
function tagSize(count: number, min: number, max: number): string {
  if (max <= min) return 'text-sm'
  const t = (count - min) / (max - min)
  return ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl'][Math.min(4, Math.floor(t * 5))]
}

/**
 * Sidebar der News-Übersicht: Suche, Kategorien (mit Anzahl), letzte Beiträge,
 * populäre Schlagworte (Tag-Cloud aus den meistgenutzten Anime-Tags).
 */
export async function NewsListSidebar({ activeCategory = '', query = '' }: { activeCategory?: string; query?: string }) {
  const payload = await getPayload({ config })

  const [latest, ...catCounts] = await Promise.all([
    payload.find({
      collection: 'articles',
      where: { _status: { equals: 'published' } },
      sort: '-publishDate',
      limit: 5,
      depth: 0,
    }),
    ...CATEGORY_KEYS.map((key) =>
      payload
        .find({
          collection: 'articles',
          where: { and: [{ category: { equals: key } }, { _status: { equals: 'published' } }] },
          limit: 0,
          depth: 0,
        })
        .then((r) => ({ key, total: r.totalDocs })),
    ),
  ])

  // Populäre Schlagworte (thematische Tags nach Anime-Nutzung).
  let tagRows: { name: string; slug: string; c: number }[] = []
  try {
    const res = await (payload.db as any).pool.query(
      `SELECT t.name, t.slug, count(*)::int AS c
       FROM anime_tags at JOIN tags t ON t.id = at.tag_id
       WHERE coalesce(t.is_adult,false) = false AND t.category IN ('theme','setting')
       GROUP BY t.id, t.name, t.slug ORDER BY c DESC LIMIT 28`,
    )
    tagRows = res.rows
  } catch {
    tagRows = []
  }
  const counts = tagRows.map((t) => t.c)
  const min = Math.min(...counts, 0)
  const max = Math.max(...counts, 1)

  const box = 'rounded-xl border border-white/10 bg-zinc-900/40 p-5'
  const heading = 'mb-3 text-sm font-bold uppercase tracking-wide text-zinc-300'

  return (
    <div className="space-y-6">
      {/* Suche */}
      <section className={box}>
        <h3 className={heading}>Beiträge durchsuchen</h3>
        <form action="/news" method="get" className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">🔍</span>
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="News durchsuchen…"
            className="w-full rounded-lg border border-white/10 bg-zinc-900/60 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </form>
      </section>

      {/* Alle Kategorien */}
      <section className={box}>
        <h3 className={heading}>Alle Kategorien</h3>
        <ul className="space-y-1 text-sm">
          <li>
            <Link
              href="/news"
              className={`flex items-center justify-between rounded-md px-2 py-1.5 transition ${
                !activeCategory ? 'bg-accent/15 text-accent' : 'text-zinc-300 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span>Alle Beiträge</span>
            </Link>
          </li>
          {catCounts.map(({ key, total }) => (
            <li key={key}>
              <Link
                href={`/news/kategorie/${key}`}
                className={`flex items-center justify-between rounded-md px-2 py-1.5 transition ${
                  key === activeCategory ? 'bg-accent/15 text-accent' : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>{ARTICLE_CATEGORY_LABELS[key]}</span>
                <span className="text-xs text-zinc-500">{total}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Letzte Beiträge */}
      <section className={box}>
        <h3 className={heading}>Letzte Beiträge</h3>
        {latest.docs.length === 0 ? (
          <p className="text-sm text-zinc-500">Noch keine Beiträge.</p>
        ) : (
          <ul className="space-y-3">
            {latest.docs.map((a: any) => (
              <li key={a.id}>
                <Link href={`/news/${a.slug}`} className="group flex gap-3">
                  {a.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.coverImageUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" loading="lazy" />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded bg-gradient-to-br from-accent/20 to-accent-2/20" />
                  )}
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium text-zinc-200 transition group-hover:text-accent">
                      {a.title}
                    </p>
                    <p className="text-xs text-zinc-500">{fmtDate(a.publishDate)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Populäre Schlagworte */}
      {tagRows.length ? (
        <section className={box}>
          <h3 className={heading}>Populäre Schlagworte</h3>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {tagRows.map((t) => (
              <Link
                key={t.slug}
                href={`/tag/${t.slug}`}
                className={`${tagSize(t.c, min, max)} font-medium leading-tight text-zinc-400 transition hover:text-accent`}
                title={`${t.c} Anime`}
              >
                {t.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
