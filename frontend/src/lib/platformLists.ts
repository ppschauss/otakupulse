/**
 * Plattform-Listen: /plattform/<anbieter>/<filter>
 *
 * Der eigentliche Streaming-USP in Suchintention: „anime mit deutschem dub auf
 * netflix", „kostenlose anime joyn", „isekai crunchyroll". Jede Kombination ist
 * eine eigene URL — aber nur, wenn sie ≥ MIN_LIST_SIZE Titel hat; darunter
 * noindex und nicht in der Sitemap (sonst züchten wir wieder Doorway-Pages).
 * Datenbasis ist ausschließlich `anime_streaming_offers` (anbieter-genau).
 */
import { DE_PROVIDER_SLUGS, providerBySlug } from './streaming'

export const MIN_LIST_SIZE = 10
const NEW_DAYS = 30

export type ListFilter = {
  key: string
  kind: 'static' | 'genre'
  label: string
  title: (providerName: string) => string
  intro: (providerName: string, n: number) => string
  genreSlug?: string
  genreName?: string
}

const STATIC: ListFilter[] = [
  {
    key: 'deutscher-dub',
    kind: 'static',
    label: 'Deutscher Dub',
    title: (p) => `Anime mit deutschem Dub auf ${p}`,
    intro: (p, n) =>
      `${n} Anime laufen auf ${p} mit deutscher Synchronfassung. Die Angaben stammen aus dem aktuellen Katalog des Anbieters und werden regelmäßig abgeglichen.`,
  },
  {
    key: 'deutscher-sub',
    kind: 'static',
    label: 'Deutscher Sub',
    title: (p) => `Anime mit deutschen Untertiteln auf ${p}`,
    intro: (p, n) => `${n} Anime laufen auf ${p} im Originalton mit deutschen Untertiteln.`,
  },
  {
    key: 'kostenlos',
    kind: 'static',
    label: 'Kostenlos',
    title: (p) => `Kostenlose Anime auf ${p}`,
    intro: (p, n) =>
      `${n} Anime sind auf ${p} ohne Abo abrufbar — gratis oder werbefinanziert, legal und in Deutschland verfügbar.`,
  },
  {
    key: 'neu',
    kind: 'static',
    label: 'Neu',
    title: (p) => `Neu auf ${p}: Anime der letzten 30 Tage`,
    intro: (p, n) => `${n} Anime sind in den letzten 30 Tagen neu in den ${p}-Katalog gekommen.`,
  },
  {
    key: 'filme',
    kind: 'static',
    label: 'Filme',
    title: (p) => `Anime-Filme auf ${p}`,
    intro: (p, n) => `${n} Anime-Filme laufen aktuell auf ${p}.`,
  },
]

export const staticFilter = (key: string) => STATIC.find((f) => f.key === key)
export const STATIC_FILTER_KEYS = STATIC.map((f) => f.key)

const genreFilter = (g: { slug: string; name: string }): ListFilter => ({
  key: g.slug,
  kind: 'genre',
  label: g.name,
  genreSlug: g.slug,
  genreName: g.name,
  title: (p) => `${g.name}-Anime auf ${p}`,
  intro: (p, n) => `${n} ${g.name}-Anime laufen aktuell auf ${p} — sortiert nach Beliebtheit.`,
})

/** SQL-Fragment über Aliase `a` (anime) und `o` (anime_streaming_offers); $1 ist der Provider. */
export function filterCondition(f: ListFilter): { sql: string; params: any[] } {
  switch (f.kind === 'genre' ? 'genre' : f.key) {
    case 'deutscher-dub':
      return { sql: "(',' || COALESCE(o.audio,'') || ',') LIKE '%,de,%'", params: [] }
    case 'deutscher-sub':
      return { sql: "(',' || COALESCE(o.subs,'') || ',') LIKE '%,de,%'", params: [] }
    case 'kostenlos':
      return { sql: "o.monetization IN ('ads','free')", params: [] }
    case 'neu':
      return { sql: `o.first_seen_at >= now() - interval '${NEW_DAYS} days'`, params: [] }
    case 'filme':
      return { sql: "a.format = 'MOVIE'", params: [] }
    case 'genre':
      return {
        sql: 'EXISTS (SELECT 1 FROM anime_rels ar JOIN genres g ON g.id = ar.genres_id WHERE ar.parent_id = a.id AND g.slug = $2)',
        params: [f.genreSlug],
      }
    default:
      return { sql: 'false', params: [] }
  }
}

export async function resolveListFilter(payload: any, key: string): Promise<ListFilter | null> {
  const s = staticFilter(key)
  if (s) return s
  const { docs } = await payload.find({ collection: 'genres', where: { slug: { equals: key } }, limit: 1, depth: 0 })
  return docs.length ? genreFilter(docs[0] as any) : null
}

const pool = (payload: any) => (payload.db as any).pool

/** Titelzahl je `${provider}/${filter}` für DE-Anbieter — 6 gruppierte Abfragen statt Anbieter×Filter. */
export async function platformListCounts(payload: any): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const p = pool(payload)
  for (const f of STATIC) {
    const c = filterCondition(f)
    const res = await p.query(
      `SELECT o.provider, count(DISTINCT a.id)::int AS n
       FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
       WHERE ${c.sql} AND o.monetization IN ('flatrate','ads','free') AND a.is_hentai IS NOT TRUE GROUP BY o.provider`,
    )
    for (const r of res.rows) out.set(`${r.provider}/${f.key}`, r.n)
  }
  const g = await p.query(
    `SELECT o.provider, g.slug, count(DISTINCT a.id)::int AS n
     FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
     JOIN anime_rels ar ON ar.parent_id = a.id AND ar.genres_id IS NOT NULL
     JOIN genres g ON g.id = ar.genres_id
     WHERE o.monetization IN ('flatrate','ads','free') AND a.is_hentai IS NOT TRUE GROUP BY o.provider, g.slug`,
  )
  for (const r of g.rows) out.set(`${r.provider}/${r.slug}`, r.n)
  return out
}

/** Eine Seite der Liste, nach Popularität. Hentai bleibt draußen (wie in ähnlichen Listen). */
export async function platformListPage(payload: any, providerSlug: string, f: ListFilter, page: number, perPage: number) {
  const c = filterCondition(f)
  const p = pool(payload)
  const base = `FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
                WHERE o.provider = $1 AND o.monetization IN ('flatrate','ads','free') AND ${c.sql} AND a.is_hentai IS NOT TRUE`
  const [cnt, ids] = await Promise.all([
    p.query(`SELECT count(DISTINCT a.id)::int AS n ${base}`, [providerSlug, ...c.params]),
    p.query(
      `SELECT a.id ${base} GROUP BY a.id ORDER BY max(a.popularity) DESC NULLS LAST, a.id
       LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`,
      [providerSlug, ...c.params],
    ),
  ])
  const order: number[] = ids.rows.map((r: any) => r.id)
  if (!order.length) return { docs: [] as any[], total: cnt.rows[0]?.n ?? 0 }
  const res = await payload.find({ collection: 'anime', where: { id: { in: order } }, limit: order.length, depth: 0 })
  const byId = new Map((res.docs as any[]).map((d) => [d.id, d]))
  return { docs: order.map((id) => byId.get(id)).filter(Boolean) as any[], total: cnt.rows[0]?.n ?? 0 }
}

export type ListStats = { total: number; dub: number; sub: number; free: number; fresh: number; top: string[]; checkedAt: string | null }

/**
 * Kennzahlen einer Liste für Intro/FAQ („87 Anime, davon 60 mit deutscher Synchro,
 * 12 kostenlos, 5 neu in 30 Tagen") + die fünf beliebtesten Titel + letzter Abgleich.
 * Zahlen statt Prosa: das ist, was KI-Antworten und Snippets zitieren.
 */
export async function platformListStats(payload: any, providerSlug: string, f: ListFilter): Promise<ListStats> {
  const c = filterCondition(f)
  const p = pool(payload)
  const base = `FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
                WHERE o.provider = $1 AND o.monetization IN ('flatrate','ads','free') AND ${c.sql} AND a.is_hentai IS NOT TRUE`
  const [agg, top] = await Promise.all([
    p.query(
      `SELECT count(DISTINCT a.id)::int AS total,
              count(DISTINCT a.id) FILTER (WHERE (',' || COALESCE(o.audio,'') || ',') LIKE '%,de,%')::int AS dub,
              count(DISTINCT a.id) FILTER (WHERE (',' || COALESCE(o.subs,'') || ',') LIKE '%,de,%')::int AS sub,
              count(DISTINCT a.id) FILTER (WHERE o.monetization IN ('ads','free'))::int AS free,
              count(DISTINCT a.id) FILTER (WHERE o.first_seen_at >= now() - interval '${NEW_DAYS} days')::int AS fresh,
              max(o.last_seen_at) AS checked
       ${base}`,
      [providerSlug, ...c.params],
    ),
    p.query(
      `SELECT COALESCE(NULLIF(a.title_german,''), NULLIF(a.title_english,''), a.title_romaji) AS t
       ${base} GROUP BY a.id ORDER BY max(a.popularity) DESC NULLS LAST LIMIT 5`,
      [providerSlug, ...c.params],
    ),
  ])
  const r = agg.rows[0] || {}
  return {
    total: r.total ?? 0,
    dub: r.dub ?? 0,
    sub: r.sub ?? 0,
    free: r.free ?? 0,
    fresh: r.fresh ?? 0,
    top: top.rows.map((x: any) => x.t).filter(Boolean),
    checkedAt: r.checked ? new Date(r.checked).toISOString() : null,
  }
}

/** Alle indexwürdigen Listen-URLs (Sitemap + Hub-Chips). */
export async function platformListPaths(payload: any): Promise<string[]> {
  const counts = await platformListCounts(payload)
  const out: string[] = []
  for (const [key, n] of counts) {
    const [provider, filter] = key.split('/')
    if (n >= MIN_LIST_SIZE && DE_PROVIDER_SLUGS.includes(provider) && providerBySlug(provider)) {
      out.push(`/plattform/${provider}/${filter}`)
    }
  }
  return out.sort()
}
