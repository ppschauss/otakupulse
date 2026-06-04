import { getPayload } from 'payload'
import config from '@payload-config'
import { AnimeCard } from '@/components/AnimeCard'
import { Pagination } from '@/components/Pagination'
import { FORMAT_LABELS, STATUS_LABELS, TAG_CATEGORY_LABELS } from '@/lib/anime'
import { STREAMING_PROVIDERS, providerBySlug } from '@/lib/streaming'

export const dynamic = 'force-dynamic'
const PER_PAGE = 36

export const metadata = {
  title: 'Anime-Suche & Filter — OtakuPulse',
  description:
    'Volltext-Suche in der Anime-Datenbank — kombiniere Genre, Tags, Typ, Jahr und Sprache (Japanisch, Deutscher/Englischer Dub).',
}

const SORTS: Record<string, { label: string; sort: string }> = {
  popularity: { label: 'Beliebtheit', sort: '-popularity' },
  score: { label: 'Bewertung', sort: '-averageScore' },
  newest: { label: 'Neuste zuerst', sort: '-createdAt' },
  title: { label: 'Titel (A–Z)', sort: 'titleRomaji' },
}

// Sprach-Radio → availableLanguages-Werte (Treffer per OR via `in`).
// Dub-Daten stammen aus dem Crunchyroll-Sync (`crunchyroll-dub.py`), `ja` aus der
// JP-Herkunft. Sub-Optionen ergänzen den reinen Dub um untertitelte Titel.
const LANGS: { value: string; label: string; in: string[] }[] = [
  { value: '', label: 'Alle', in: [] },
  { value: 'ja', label: 'Japanisch (Original)', in: ['ja'] },
  { value: 'de-dub', label: 'Deutscher Dub', in: ['de-dub'] },
  { value: 'en-dub', label: 'Englischer Dub', in: ['en-dub'] },
  { value: 'de-sub', label: 'Deutscher Sub', in: ['de-sub'] },
  { value: 'en-sub', label: 'Englischer Sub', in: ['en-sub'] },
]

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string
    genre?: string
    tag?: string
    status?: string
    format?: string
    year?: string
    lang?: string
    anbieter?: string
    sort?: string
    page?: string
  }>
}) {
  const sp = await searchParams
  const q = (sp.q || '').trim()
  const genre = sp.genre || ''
  const tag = sp.tag || ''
  const status = sp.status || ''
  const format = sp.format || ''
  const year = sp.year || ''
  const lang = LANGS.some((l) => l.value === sp.lang) ? sp.lang || '' : ''
  const anbieter = sp.anbieter && providerBySlug(sp.anbieter) ? sp.anbieter : ''
  const sortKey = sp.sort && SORTS[sp.sort] ? sp.sort : 'popularity'
  const page = Math.max(1, Number(sp.page) || 1)

  const hasQuery = Boolean(q || genre || tag || status || format || year || lang || anbieter)

  const payload = await getPayload({ config })
  const [genreList, tagList] = await Promise.all([
    payload.find({ collection: 'genres', limit: 300, sort: 'name', depth: 0 }),
    payload.find({ collection: 'tags', limit: 500, sort: 'name', depth: 0 }),
  ])
  const genreId = genre ? (genreList.docs.find((g: any) => g.slug === genre) as any)?.id : undefined
  const tagId = tag ? (tagList.docs.find((t: any) => t.slug === tag) as any)?.id : undefined

  // Tags nach Kategorie für <optgroup> gruppieren.
  const tagsByCategory = new Map<string, any[]>()
  for (const t of tagList.docs as any[]) {
    const cat = t.category || 'element'
    if (!tagsByCategory.has(cat)) tagsByCategory.set(cat, [])
    tagsByCategory.get(cat)!.push(t)
  }

  const and: any[] = []
  if (q) {
    and.push({
      or: [
        { titleRomaji: { like: q } },
        { titleEnglish: { like: q } },
        { titleNative: { like: q } },
        { titleGerman: { like: q } },
        { descriptionDe: { like: q } },
        { descriptionSource: { like: q } },
      ],
    })
  }
  if (genreId) and.push({ genres: { in: [genreId] } })
  if (tagId) and.push({ 'tags.tag': { in: [tagId] } })
  if (status) and.push({ status: { equals: status } })
  if (format) and.push({ format: { equals: format } })
  if (year) and.push({ seasonYear: { equals: Number(year) } })
  const langIn = LANGS.find((l) => l.value === lang)?.in ?? []
  if (langIn.length) and.push({ availableLanguages: { in: langIn } })
  if (anbieter) and.push({ streamingProviders: { in: [anbieter] } })

  const result = hasQuery
    ? await payload.find({
        collection: 'anime',
        where: and.length ? { and } : {},
        sort: SORTS[sortKey].sort,
        limit: PER_PAGE,
        page,
        depth: 0,
      })
    : null

  const inputCls =
    'w-full rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent'

  const query = { q, genre, tag, status, format, year, lang, anbieter, sort: sortKey }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Suche & Filter</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Volltext-Suche über Titel und Beschreibung — kombiniere die Filter beliebig.
      </p>

      <form method="get" action="/suche" className="mt-6 rounded-xl border border-white/10 bg-zinc-900/40 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="lg:col-span-3">
            <label className="mb-1 block text-xs text-zinc-500">Volltext (Titel & Beschreibung)</label>
            <input type="text" name="q" defaultValue={q} placeholder="z.B. One Piece, Piraten, Magie …" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Genre</label>
            <select name="genre" defaultValue={genre} className={inputCls}>
              <option value="">Alle Genres</option>
              {genreList.docs.map((g: any) => (
                <option key={g.id} value={g.slug}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Tag</label>
            <select name="tag" defaultValue={tag} className={inputCls}>
              <option value="">Alle Tags</option>
              {[...tagsByCategory.entries()].map(([cat, tags]) => (
                <optgroup key={cat} label={TAG_CATEGORY_LABELS[cat] ?? cat}>
                  {tags.map((t: any) => (
                    <option key={t.id} value={t.slug}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Typ</label>
            <select name="format" defaultValue={format} className={inputCls}>
              <option value="">Alle Typen</option>
              {Object.entries(FORMAT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Status</label>
            <select name="status" defaultValue={status} className={inputCls}>
              <option value="">Alle</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Anbieter (wer streamt es)</label>
            <select name="anbieter" defaultValue={anbieter} className={inputCls}>
              <option value="">Alle Anbieter</option>
              {STREAMING_PROVIDERS.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Jahr</label>
            <input type="number" name="year" defaultValue={year} placeholder="2026" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Sortierung</label>
            <select name="sort" defaultValue={sortKey} className={inputCls}>
              {Object.entries(SORTS).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sprach-Radio */}
        <fieldset className="mt-4">
          <legend className="mb-2 text-xs text-zinc-500">Sprache</legend>
          <div className="flex flex-wrap gap-2">
            {LANGS.map((l) => (
              <label
                key={l.value || 'all'}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 has-[:checked]:border-accent has-[:checked]:bg-accent/15 has-[:checked]:text-white"
              >
                <input
                  type="radio"
                  name="lang"
                  value={l.value}
                  defaultChecked={lang === l.value}
                  className="accent-accent"
                />
                {l.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            className="rounded-lg bg-gradient-to-r from-accent to-accent-2 px-6 py-2 text-sm font-semibold text-white"
          >
            Suchen
          </button>
          {hasQuery ? (
            <a href="/suche" className="text-sm text-zinc-400 hover:text-accent">
              Filter zurücksetzen
            </a>
          ) : null}
        </div>
      </form>

      {result ? (
        <>
          <p className="mt-6 text-zinc-400">
            {result.totalDocs} {result.totalDocs === 1 ? 'Treffer' : 'Treffer'}
          </p>
          {result.docs.length === 0 ? (
            <div className="mt-6 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
              Keine Anime gefunden. Tipp: Bei unbekannten Titeln kannst du direkt{' '}
              <span className="text-zinc-300">/anime/&lt;titel&gt;</span> aufrufen — fehlende Titel werden live importiert.
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {result.docs.map((a: any) => (
                <AnimeCard key={a.id} anime={a} />
              ))}
            </div>
          )}
          <Pagination basePath="/suche" page={page} totalPages={result.totalPages} query={query} />
        </>
      ) : (
        <p className="mt-8 text-zinc-500">Gib einen Suchbegriff ein oder kombiniere die Filter oben.</p>
      )}
    </main>
  )
}
