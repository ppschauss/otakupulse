/**
 * Plattform-Listen: /plattform/<anbieter>/<filter>
 *
 * Der eigentliche Streaming-USP in Suchintention: „anime mit deutschem dub auf
 * netflix", „kostenlose anime joyn", „isekai crunchyroll". Jede Kombination ist
 * eine eigene URL — aber nur, wenn sie ≥ MIN_LIST_SIZE Titel hat; darunter
 * noindex und nicht in der Sitemap (sonst züchten wir wieder Doorway-Pages).
 * Datenbasis ist ausschließlich `anime_streaming_offers` (anbieter-genau).
 */
import { DE_PROVIDER_SLUGS, PROVIDER_SLUGS, providerBySlug } from './streaming'

export const MIN_LIST_SIZE = 10

/**
 * QA-Gate in SQL — wortgleich zu `offerContradictsEntry` in lib/streaming.ts.
 * Angebote, deren Folgenzahl dem Eintrag widerspricht, zählen in keiner Liste mit;
 * sonst nennt eine Liste Titel, deren Anbieter-Block auf der Detailseite gar nicht
 * erscheint. Setzt die Aliase `a` (anime) und `o` (anime_streaming_offers) voraus.
 */
// COALESCE ist Pflicht, nicht Kosmetik: ohne es ist der Ausdruck bei unbekannter
// Folgenzahl nicht `false`, sondern NULL — und `WHERE NULL` blendet die Zeile aus.
// Damit fielen alle Titel ohne Folgenzahl (laufende Serien, viele Filme) aus jeder
// Liste; gemessen 143 Titel allein bei Crunchyroll. Die TypeScript-Fassung rechnet
// mit `Number(x) || 0` und war davon nie betroffen.
export const PLAUSIBLE_OFFER_SQL = `NOT (COALESCE(a.episodes,0) > 0 AND COALESCE(o.episodes,0) > 0 AND (
       (a.episodes <= 3 AND o.episodes >= a.episodes + 3)
    OR (COALESCE(a.format::text,'') NOT IN ('TV','TV_SHORT','ONA') AND abs(o.episodes - a.episodes) > greatest(1, a.episodes * 0.25))))`
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

/**
 * Hinweis für Dub-Listen von Anbietern ohne Tonspur-Daten: dort ist die Liste
 * „bei X verfügbar UND deutsche Synchro bekannt" — nicht „X weist deutsche
 * Tonspur aus". Der Unterschied gehört auf die Seite, nicht in eine Fußnote.
 */
export const dubFallbackNote = (providerName: string) =>
  `${providerName} weist im eigenen Katalog keine Tonspuren aus. Diese Liste zeigt deshalb Titel, die bei ${providerName} verfügbar sind und für die eine deutsche Synchronfassung bekannt ist (aus Anbieter-APIs und Wikipedia). Ob ${providerName} die deutsche Fassung selbst anbietet, prüfst du am besten direkt dort.`

/**
 * Intro der Liste. Bei Dub-Fallback-Anbietern darf dort NICHT „aus dem aktuellen
 * Katalog des Anbieters" stehen — die Datenbasis ist dann das Titel-Flag.
 */
export function listIntro(f: ListFilter, providerName: string, total: number, dubFallback: boolean) {
  if (dubFallback && f.key === 'deutscher-dub') {
    return `${total} Anime bei ${providerName} haben eine bekannte deutsche Synchronfassung. ${dubFallbackNote(providerName)}`
  }
  return f.intro(providerName, total)
}

/** SQL-Literalliste aus Anbieter-Slugs — nur bekannte Slugs, nie Fremdeingaben. */
const providerSqlList = (slugs: string[]) =>
  slugs.filter((s) => PROVIDER_SLUGS.includes(s)).map((s) => `'${s}'`).join(',')

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

/**
 * SQL-Fragment über Aliase `a` (anime) und `o` (anime_streaming_offers); $1 ist der Provider.
 *
 * `dubFallback` sind Anbieter, die bei JustWatch gar keine Tonspuren ausweisen
 * (Netflix): für die zählt die Dub-Liste ersatzweise das Titel-Flag `de-dub`,
 * sonst bliebe die größte Dub-Liste des Marktes leer. Alle anderen Anbieter
 * bleiben anbieter-genau.
 */
export function filterCondition(f: ListFilter, dubFallback: string[] = []): { sql: string; params: any[] } {
  switch (f.kind === 'genre' ? 'genre' : f.key) {
    case 'deutscher-dub': {
      const audio = "(',' || COALESCE(o.audio,'') || ',') LIKE '%,de,%'"
      const fb = providerSqlList(dubFallback)
      return {
        sql: fb
          ? `(${audio} OR (o.provider IN (${fb}) AND EXISTS (SELECT 1 FROM anime_available_languages l WHERE l.parent_id = a.id AND l.value = 'de-dub')))`
          : `(${audio})`,
        params: [],
      }
    }
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

const COUNTS_TTL_MS = 10 * 60_000

const pool = (payload: any) => (payload.db as any).pool

let fallbackCache: { at: number; value: string[] } | null = null

/**
 * Anbieter, deren Angebote KEINE einzige Tonspur tragen — JustWatch liefert für
 * sie keine `audioLanguages` (Stand 11/2026: Netflix). Ohne diese Liste zeigt
 * `/plattform/netflix/deutscher-dub` 0 Titel, obwohl ~200 der dort verfügbaren
 * Anime eine deutsche Synchronfassung haben.
 */
export async function dubFallbackProviders(payload: any): Promise<string[]> {
  if (fallbackCache && Date.now() - fallbackCache.at < COUNTS_TTL_MS) return fallbackCache.value
  const res = await pool(payload).query(
    `SELECT o.provider FROM anime_streaming_offers o JOIN anime a ON a.id = o._parent_id
      WHERE o.monetization IN ('flatrate','ads','free') AND ${PLAUSIBLE_OFFER_SQL}
      GROUP BY o.provider
     HAVING count(*) FILTER (WHERE o.audio IS NOT NULL AND o.audio <> '') = 0`,
  )
  const value = res.rows.map((r: any) => r.provider as string)
  fallbackCache = { at: Date.now(), value }
  return value
}

/** Titelzahl je `${provider}/${filter}` für DE-Anbieter — 6 gruppierte Abfragen statt Anbieter×Filter. */
export async function platformListCounts(payload: any): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const p = pool(payload)
  const fb = await dubFallbackProviders(payload)
  for (const f of STATIC) {
    const c = filterCondition(f, fb)
    const res = await p.query(
      `SELECT o.provider, count(DISTINCT a.id)::int AS n
       FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
       WHERE ${c.sql} AND o.monetization IN ('flatrate','ads','free') AND a.is_hentai IS NOT TRUE
         AND ${PLAUSIBLE_OFFER_SQL} GROUP BY o.provider`,
    )
    for (const r of res.rows) out.set(`${r.provider}/${f.key}`, r.n)
  }
  const g = await p.query(
    `SELECT o.provider, g.slug, count(DISTINCT a.id)::int AS n
     FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
     JOIN anime_rels ar ON ar.parent_id = a.id AND ar.genres_id IS NOT NULL
     JOIN genres g ON g.id = ar.genres_id
     WHERE o.monetization IN ('flatrate','ads','free') AND a.is_hentai IS NOT TRUE
       AND ${PLAUSIBLE_OFFER_SQL} GROUP BY o.provider, g.slug`,
  )
  for (const r of g.rows) out.set(`${r.provider}/${r.slug}`, r.n)
  return out
}

/** Eine Seite der Liste, nach Popularität. Hentai bleibt draußen (wie in ähnlichen Listen). */
export async function platformListPage(payload: any, providerSlug: string, f: ListFilter, page: number, perPage: number) {
  const c = filterCondition(f, await dubFallbackProviders(payload))
  const p = pool(payload)
  const base = `FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
                WHERE o.provider = $1 AND o.monetization IN ('flatrate','ads','free') AND ${c.sql}
                  AND a.is_hentai IS NOT TRUE AND ${PLAUSIBLE_OFFER_SQL}`
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
  const fb = await dubFallbackProviders(payload)
  const c = filterCondition(f, fb)
  const dubSql = filterCondition(staticFilter('deutscher-dub')!, fb).sql
  const p = pool(payload)
  const base = `FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
                WHERE o.provider = $1 AND o.monetization IN ('flatrate','ads','free') AND ${c.sql}
                  AND a.is_hentai IS NOT TRUE AND ${PLAUSIBLE_OFFER_SQL}`
  const [agg, top] = await Promise.all([
    p.query(
      `SELECT count(DISTINCT a.id)::int AS total,
              count(DISTINCT a.id) FILTER (WHERE ${dubSql})::int AS dub,
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

export type DubProviderRow = { slug: string; name: string; total: number; dub: number; fallback: boolean }

/**
 * Anbieter-Vergleich für die Ger-Dub-Übersicht: pro Anbieter Katalogbreite und
 * Titel mit deutscher Synchro, dazu die eindeutige Gesamtzahl (ein Titel bei
 * drei Anbietern zählt einmal) und der letzte Abgleich.
 *
 * Diese Zahlen sind der Grund, warum die Seite existiert: die SERP zu „Anime mit
 * deutschem Dub" gehört Prosa-Artikeln ohne Datenbank.
 */
export async function dubOverview(payload: any): Promise<{
  rows: DubProviderRow[]
  unique: number
  checkedAt: string | null
}> {
  const fb = await dubFallbackProviders(payload)
  const dubSql = filterCondition(staticFilter('deutscher-dub')!, fb).sql
  const base = `FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
                WHERE o.monetization IN ('flatrate','ads','free') AND a.is_hentai IS NOT TRUE
                  AND ${PLAUSIBLE_OFFER_SQL}`
  const p = pool(payload)
  const [per, uniq] = await Promise.all([
    p.query(`SELECT o.provider,
                    count(DISTINCT a.id)::int AS total,
                    count(DISTINCT a.id) FILTER (WHERE ${dubSql})::int AS dub
             ${base} GROUP BY o.provider`),
    p.query(`SELECT count(DISTINCT a.id)::int AS n, max(o.last_seen_at) AS checked ${base} AND ${dubSql}`),
  ])
  const rows: DubProviderRow[] = per.rows
    .filter((r: any) => DE_PROVIDER_SLUGS.includes(r.provider) && providerBySlug(r.provider))
    .map((r: any) => ({
      slug: r.provider,
      name: providerBySlug(r.provider)!.name,
      total: r.total,
      dub: r.dub,
      fallback: fb.includes(r.provider),
    }))
    .sort((a: DubProviderRow, b: DubProviderRow) => b.dub - a.dub)
  const checked = uniq.rows[0]?.checked
  return { rows, unique: uniq.rows[0]?.n ?? 0, checkedAt: checked ? new Date(checked).toISOString() : null }
}

/** Die beliebtesten Titel mit deutscher Synchro, anbieterübergreifend. */
export async function topDubAnime(payload: any, limit: number): Promise<any[]> {
  const fb = await dubFallbackProviders(payload)
  const dubSql = filterCondition(staticFilter('deutscher-dub')!, fb).sql
  const res = await pool(payload).query(
    `SELECT a.id FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
      WHERE o.monetization IN ('flatrate','ads','free') AND a.is_hentai IS NOT TRUE AND ${dubSql}
        AND ${PLAUSIBLE_OFFER_SQL}
      GROUP BY a.id ORDER BY max(a.popularity) DESC NULLS LAST, a.id LIMIT ${Number(limit) || 24}`,
  )
  const order: number[] = res.rows.map((r: any) => r.id)
  if (!order.length) return []
  const docs = await payload.find({ collection: 'anime', where: { id: { in: order } }, limit: order.length, depth: 0 })
  const byId = new Map((docs.docs as any[]).map((d) => [d.id, d]))
  return order.map((id) => byId.get(id)).filter(Boolean)
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

// --- Interne Verlinkung: nur auf indexierbare Listen (≥ MIN_LIST_SIZE) ------------

let countsCache: { at: number; value: Map<string, number> } | null = null

/** platformListCounts mit 10-Minuten-Cache — wird auf jeder Anime-/Genre-Seite und im Footer gebraucht. */
export async function cachedPlatformListCounts(payload: any): Promise<Map<string, number>> {
  if (countsCache && Date.now() - countsCache.at < COUNTS_TTL_MS) return countsCache.value
  const value = await platformListCounts(payload)
  countsCache = { at: Date.now(), value }
  return value
}

export type ListLink = { href: string; label: string; n: number }

/** Listen eines Anbieters (statische Filter + Genres), die indexierbar sind. */
export function listLinksForProvider(counts: Map<string, number>, providerSlug: string, genreNames: Map<string, string>): ListLink[] {
  const p = providerBySlug(providerSlug)
  if (!p || !DE_PROVIDER_SLUGS.includes(providerSlug)) return []
  const out: ListLink[] = []
  for (const [key, n] of counts) {
    const [prov, filter] = key.split('/')
    if (prov !== providerSlug || n < MIN_LIST_SIZE) continue
    const sf = staticFilter(filter)
    const label = sf ? sf.title(p.name) : genreNames.has(filter) ? `${genreNames.get(filter)}-Anime auf ${p.name}` : ''
    if (label) out.push({ href: `/plattform/${prov}/${filter}`, label, n })
  }
  return out.sort((a, b) => b.n - a.n)
}

/** Alle Anbieter-Listen zu einem Genre („Fantasy-Anime auf Crunchyroll"), indexierbar, nach Größe. */
export function listLinksForGenre(counts: Map<string, number>, genreSlug: string, genreName: string): ListLink[] {
  const out: ListLink[] = []
  for (const [key, n] of counts) {
    const [prov, filter] = key.split('/')
    if (filter !== genreSlug || n < MIN_LIST_SIZE) continue
    const p = providerBySlug(prov)
    if (!p || !DE_PROVIDER_SLUGS.includes(prov)) continue
    out.push({ href: `/plattform/${prov}/${genreSlug}`, label: `${genreName}-Anime auf ${p.name}`, n })
  }
  return out.sort((a, b) => b.n - a.n)
}

/** Die größten Dub-/Gratis-Listen site-weit (Footer). */
export function topListLinks(counts: Map<string, number>, limit = 6): ListLink[] {
  const out: ListLink[] = []
  for (const [key, n] of counts) {
    const [prov, filter] = key.split('/')
    if (!['deutscher-dub', 'kostenlos'].includes(filter) || n < MIN_LIST_SIZE) continue
    const p = providerBySlug(prov)
    if (!p || !DE_PROVIDER_SLUGS.includes(prov)) continue
    out.push({ href: `/plattform/${prov}/${filter}`, label: staticFilter(filter)!.title(p.name), n })
  }
  return out.sort((a, b) => b.n - a.n).slice(0, limit)
}
