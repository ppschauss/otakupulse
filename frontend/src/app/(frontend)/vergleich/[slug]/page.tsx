import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { pageMeta } from '@/lib/seo'
import { displayTitle, formatLabel, statusLabel, seasonLabel, plainText } from '@/lib/anime'

export const dynamic = 'force-dynamic'

async function getPair(slug: string) {
  const idx = slug.indexOf('-vs-')
  if (idx < 0) return null
  const slugA = slug.slice(0, idx)
  const slugB = slug.slice(idx + 4)
  if (!slugA || !slugB) return null
  const payload = await getPayload({ config })
  const [a, b] = await Promise.all([
    payload.find({ collection: 'anime', where: { slug: { equals: slugA } }, limit: 1, depth: 1 }),
    payload.find({ collection: 'anime', where: { slug: { equals: slugB } }, limit: 1, depth: 1 }),
  ])
  if (!a.docs.length || !b.docs.length) return null
  return { a: a.docs[0] as any, b: b.docs[0] as any }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const pair = await getPair(slug)
  if (!pair) return {}
  const ta = displayTitle(pair.a)
  const tb = displayTitle(pair.b)
  return pageMeta({
    title: `${ta} vs. ${tb} — Anime-Vergleich | OtakuPulse`,
    description: `${ta} oder ${tb}? Der direkte Vergleich: Bewertung, Episoden, Studio, Genres und mehr.`,
    path: `/vergleich/${slug}`,
  })
}

function genreNames(a: any): string[] {
  return (Array.isArray(a.genres) ? a.genres : []).filter((g: any) => typeof g === 'object').map((g: any) => g.name)
}
function studioNames(a: any): string[] {
  return (Array.isArray(a.studios) ? a.studios : []).filter((s: any) => typeof s === 'object').map((s: any) => s.name)
}

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const pair = await getPair(slug)
  if (!pair) notFound()

  const { a, b } = pair
  const ta = displayTitle(a)
  const tb = displayTitle(b)

  const Row = ({ label, va, vb, highlight }: { label: string; va: any; vb: any; highlight?: 'higher' | 'none' }) => {
    const aWins = highlight === 'higher' && Number(va) > Number(vb)
    const bWins = highlight === 'higher' && Number(vb) > Number(va)
    return (
      <tr className="border-t border-white/10">
        <td className="px-3 py-3 text-center text-zinc-500">{label}</td>
        <td className={`px-3 py-3 text-center ${aWins ? 'font-bold text-accent' : 'text-zinc-200'}`}>{va ?? '—'}</td>
        <td className={`px-3 py-3 text-center ${bWins ? 'font-bold text-accent' : 'text-zinc-200'}`}>{vb ?? '—'}</td>
      </tr>
    )
  }

  const Header = ({ anime, title }: { anime: any; title: string }) => (
    <div className="text-center">
      <Link href={`/anime/${anime.slug}`} className="group inline-block">
        {anime.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={anime.coverImageUrl} alt={title} className="mx-auto w-28 rounded-lg ring-1 ring-white/10 transition group-hover:ring-accent/60 sm:w-36" />
        ) : null}
        <p className="mt-2 line-clamp-2 font-bold text-white group-hover:text-accent">{title}</p>
      </Link>
    </div>
  )

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Vergleich', path: '/anime' },
          { name: `${ta} vs. ${tb}`, path: `/vergleich/${slug}` },
        ]}
      />
      <h1 className="text-center text-2xl font-extrabold text-white sm:text-3xl">
        {ta} <span className="text-accent">vs.</span> {tb}
      </h1>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <Header anime={a} title={ta} />
        <Header anime={b} title={tb} />
      </div>

      <table className="mt-8 w-full text-sm">
        <tbody>
          <Row label="Bewertung" va={a.averageScore ? `${a.averageScore}%` : null} vb={b.averageScore ? `${b.averageScore}%` : null} highlight="higher" />
          <Row label="Episoden" va={a.episodes} vb={b.episodes} highlight="higher" />
          <Row label="Format" va={formatLabel(a.format)} vb={formatLabel(b.format)} />
          <Row label="Status" va={statusLabel(a.status)} vb={statusLabel(b.status)} />
          <Row label="Jahr" va={a.seasonYear ? `${seasonLabel(a.season)} ${a.seasonYear}` : null} vb={b.seasonYear ? `${seasonLabel(b.season)} ${b.seasonYear}` : null} />
          <Row label="Popularität" va={a.popularity?.toLocaleString('de-DE')} vb={b.popularity?.toLocaleString('de-DE')} highlight="higher" />
          <Row label="Studio" va={studioNames(a).join(', ') || null} vb={studioNames(b).join(', ') || null} />
          <Row label="Genres" va={genreNames(a).join(', ') || null} vb={genreNames(b).join(', ') || null} />
        </tbody>
      </table>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {[a, b].map((x: any, i: number) => (
          <div key={i}>
            <h2 className="mb-2 font-bold text-white">{displayTitle(x)}</h2>
            <p className="text-sm leading-relaxed text-zinc-400">
              {plainText(x.descriptionDe || x.descriptionSource).slice(0, 320) || 'Keine Beschreibung verfügbar.'}
            </p>
          </div>
        ))}
      </div>
    </main>
  )
}
