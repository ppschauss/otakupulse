import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { pageMetaFor } from '@/lib/pageContent'
import { PageSeoFooter } from '@/components/SeoFooter'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return await pageMetaFor('studio', {
    title: 'Anime-Studios & Produktionsfirmen — OtakuPulse',
    description:
      'Alle Animationsstudios und Produktionsfirmen im Überblick — MAPPA, ufotable, Madhouse, Bones und mehr, nach Output sortiert.',
    path: '/studio',
  })
}

type Row = { id: number; name: string; slug: string; logo: string | null; n: number }

export default async function StudioListPage({ searchParams }: { searchParams: Promise<{ typ?: string }> }) {
  const sp = await searchParams
  const typ = sp.typ === 'produktion' ? 'produktion' : 'animation'
  const isAnim = typ === 'animation'

  const payload = await getPayload({ config })
  const pool = (payload.db as any).pool

  // Tab-Zähler
  const tab = await pool.query('SELECT coalesce(is_animation_studio,false) AS anim, count(*)::int n FROM studios GROUP BY 1')
  let animCount = 0
  let prodCount = 0
  for (const r of tab.rows) (r.anim ? (animCount = r.n) : (prodCount = r.n))

  // Studios des aktiven Typs + Anime-Anzahl, nach Output sortiert
  const { rows } = (await pool.query(
    `SELECT s.id, s.name, s.slug, s.logo_url AS logo, count(ar.parent_id)::int n
     FROM studios s LEFT JOIN anime_rels ar ON ar.studios_id = s.id
     WHERE coalesce(s.is_animation_studio,false) = $1
     GROUP BY s.id, s.name, s.slug, s.logo_url
     ORDER BY n DESC, s.name ASC`,
    [isAnim],
  )) as { rows: Row[] }

  // Top-Highlight: bekannteste Studios (nach Output) mit Cover des Top-Titels
  const top = rows.filter((r) => r.n > 0).slice(0, 12)
  const coverBy = new Map<number, { cl: string | null; cu: string | null }>()
  if (top.length) {
    const cov = await pool.query(
      `SELECT DISTINCT ON (ar.studios_id) ar.studios_id AS sid, a.cover_image_local AS cl, a.cover_image_url AS cu
       FROM anime_rels ar JOIN anime a ON a.id = ar.parent_id
       WHERE ar.studios_id = ANY($1::int[])
       ORDER BY ar.studios_id, a.popularity DESC NULLS LAST`,
      [top.map((r) => r.id)],
    )
    for (const r of cov.rows) coverBy.set(r.sid, r)
  }

  const Tab = ({ value, label, count }: { value: string; label: string; count: number }) => (
    <Link
      href={`/studio?typ=${value}`}
      className={`rounded-full px-4 py-1.5 text-sm font-medium ring-1 ring-white/10 transition ${
        typ === value ? 'bg-accent/20 text-accent' : 'bg-white/5 text-zinc-300 hover:text-white'
      }`}
    >
      {label} <span className="text-xs text-zinc-500">{count}</span>
    </Link>
  )

  // Logo-Zone (helle Chip-Fläche, damit dunkle Logos sichtbar sind); ohne Logo der Name.
  const LogoZone = ({ logo, name }: { logo: string | null; name: string }) => (
    <span className="flex h-14 w-full items-center justify-center rounded-lg bg-white/90 px-3">
      {logo ? (
        <Image src={logo} alt={name} width={120} height={36} className="max-h-9 w-auto max-w-full object-contain" />
      ) : (
        <span className="text-sm font-semibold text-zinc-800">{name}</span>
      )}
    </span>
  )

  return (
    <>
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-extrabold text-white">Studios & Produktion</h1>
      <p className="mt-1 text-zinc-400">
        {isAnim ? `${animCount} Animationsstudios` : `${prodCount} Produktions- & Vertriebsfirmen`}
      </p>

      {/* Typ-Tabs */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Tab value="animation" label="Animationsstudios" count={animCount} />
        <Tab value="produktion" label="Produktion & Vertrieb" count={prodCount} />
      </div>

      {/* Top-Highlight */}
      {top.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-400">
            {isAnim ? 'Bekannteste Studios' : 'Größte Produktionsfirmen'}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {top.map((s) => {
              const c = coverBy.get(s.id)
              const cover = c?.cl || c?.cu || null
              return (
                <Link
                  key={s.id}
                  href={`/studio/${s.slug}`}
                  className="group relative h-28 overflow-hidden rounded-xl border border-white/10 bg-zinc-900/60"
                >
                  {cover ? (
                    <Image
                      src={cover}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover opacity-30 transition group-hover:opacity-40"
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-transparent" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-3 text-center">
                    {s.logo ? (
                      <Image
                        src={s.logo}
                        alt={s.name}
                        width={100}
                        height={32}
                        className="max-h-8 w-auto max-w-[70%] object-contain drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] [filter:brightness(0)_invert(1)]"
                      />
                    ) : (
                      <span className="text-sm font-bold text-white drop-shadow">{s.name}</span>
                    )}
                    <span className="text-xs font-medium text-zinc-300">{s.n} Anime</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      ) : null}

      {/* Vollständiges Raster */}
      <section className="mt-10">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-400">Alle {isAnim ? 'Studios' : 'Firmen'}</h2>
        {rows.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">Keine Einträge.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {rows.map((s) => (
              <Link
                key={s.id}
                href={`/studio/${s.slug}`}
                className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/40 p-4 text-center transition hover:border-accent/40 hover:bg-zinc-900/80"
              >
                <LogoZone logo={s.logo} name={s.name} />
                <span className="line-clamp-1 text-sm font-medium text-zinc-100">{s.name}</span>
                <span className="text-xs text-zinc-500">{s.n} Anime</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
    <PageSeoFooter pageKey="studio" vars={{ count: rows.length }} maxW="max-w-6xl" />
    </>
  )
}
