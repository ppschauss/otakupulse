import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { MediaRow } from '@/components/MediaRow'
import { PortraitCard } from '@/components/PortraitCard'
import { ScrollRow } from '@/components/ScrollRow'
import { Faq } from '@/components/Faq'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { JsonLd } from '@/components/JsonLd'
import { ChipSection, NewsSection } from '@/components/HubSections'
import { SeoFooter } from '@/components/SeoFooter'
import { personLd, pageMeta } from '@/lib/seo'
import { personVars } from '@/lib/entityVars'
import { applyVarsMeta } from '@/lib/vars'
import { hubExtras } from '@/lib/hub'
import { displayName, displayTitle, genderLabel, personRoleLabel, localImage, plainText } from '@/lib/anime'

export const dynamic = 'force-dynamic'

async function getPerson(slug: string) {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'persons', where: { slug: { equals: slug } }, limit: 1, depth: 0 })
  return docs[0] as any
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const p = await getPerson(slug)
  if (!p) return {}
  const name = displayName(p)
  return pageMeta({
    title: applyVarsMeta(p.seoTitle, personVars(p)) || `${name} — Profil, Rollen & Filmografie | OtakuPulse`,
    description:
      applyVarsMeta(p.seoDescription, personVars(p)) ||
      plainText(p.bioDe || p.bioSource).slice(0, 160) ||
      `${name}: Biografie, Rollen und Anime-Credits.`,
    path: `/person/${slug}`,
    image: localImage(p),
    noindex: p.noindex || undefined,
    canonical: p.canonicalUrl || undefined,
  })
}

function fmtDate(d?: string | null) {
  if (!d) return null
  try {
    return new Date(d).toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return null
  }
}

export default async function PersonDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const person = await getPerson(slug)
  if (!person) notFound()

  const payload = await getPayload({ config })
  const staffWhere = { 'staff.person': { in: [person.id] } }

  const [staffCredits, voiceCredits, extras, news] = await Promise.all([
    payload.find({ collection: 'anime', where: staffWhere, sort: '-popularity', limit: 24, depth: 0 }),
    payload.find({
      collection: 'characters',
      where: { 'voiceActors.person': { in: [person.id] } },
      sort: '-favorites',
      limit: 24,
      depth: 0,
    }),
    hubExtras(payload, staffWhere, { news: false }),
    payload.find({
      collection: 'articles',
      where: { and: [{ relatedPersons: { in: [person.id] } }, { _status: { equals: 'published' } }] },
      sort: '-publishDate',
      limit: 6,
      depth: 0,
    }),
  ])

  const name = displayName(person)
  const roles: string[] = Array.isArray(person.roles) ? person.roles : []
  const topStaffTitles = (staffCredits.docs as any[]).slice(0, 3).map((a) => displayTitle(a))

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <JsonLd data={personLd(person, name)} />
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Personen', path: '/person' },
          { name, path: `/person/${person.slug}` },
        ]}
      />
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="w-40 shrink-0">
          {localImage(person) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={localImage(person)!} alt={name} className="w-full rounded-xl ring-1 ring-white/10" />
          ) : null}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">Person</p>
          <h1 className="mt-1 text-3xl font-extrabold text-white">{name}</h1>
          {person.nameNative ? <p className="mt-1 text-zinc-400">{person.nameNative}</p> : null}

          {roles.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {roles.map((r: string) => (
                <span key={r} className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300">
                  {personRoleLabel(r)}
                </span>
              ))}
            </div>
          ) : null}

          <dl className="mt-4 space-y-1.5 text-sm">
            {fmtDate(person.birthDate) ? (
              <div className="flex gap-4">
                <dt className="w-28 text-zinc-500">Geboren</dt>
                <dd className="text-zinc-200">{fmtDate(person.birthDate)}</dd>
              </div>
            ) : null}
            {fmtDate(person.deathDate) ? (
              <div className="flex gap-4">
                <dt className="w-28 text-zinc-500">Gestorben</dt>
                <dd className="text-zinc-200">{fmtDate(person.deathDate)}</dd>
              </div>
            ) : null}
            {person.birthPlace ? (
              <div className="flex gap-4">
                <dt className="w-28 text-zinc-500">Herkunft</dt>
                <dd className="text-zinc-200">{person.birthPlace}</dd>
              </div>
            ) : null}
            {person.gender ? (
              <div className="flex gap-4">
                <dt className="w-28 text-zinc-500">Geschlecht</dt>
                <dd className="text-zinc-200">{genderLabel(person.gender)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      {/* Biografie */}
      {person.bioDe || person.bioSource ? (
        <section className="mt-8 max-w-3xl">
          <h2 className="mb-2 text-lg font-bold text-white">Biografie</h2>
          <div
            className="leading-relaxed text-zinc-300 [&_a]:text-accent"
            dangerouslySetInnerHTML={{ __html: String(person.bioDe || person.bioSource) }}
          />
        </section>
      ) : null}

      {/* Sprechrollen */}
      {voiceCredits.docs.length ? (
        <div className="mt-10">
          <ScrollRow title={`Sprechrollen (${voiceCredits.totalDocs})`}>
            {voiceCredits.docs.map((c: any) => (
              <div key={c.id} className="w-[7rem] shrink-0 snap-start sm:w-32">
                <PortraitCard href={`/character/${c.slug}`} imageUrl={localImage(c)} title={displayName(c)} />
              </div>
            ))}
          </ScrollRow>
        </div>
      ) : null}

      {/* Staff-Credits */}
      {staffCredits.docs.length ? (
        <div className="mt-10">
          <MediaRow title={`Mitwirkung (${staffCredits.totalDocs})`} items={staffCredits.docs} />
        </div>
      ) : null}

      {/* Genres / Studios aus der Mitwirkung */}
      <ChipSection title="Genres" base="/genre" items={extras.topGenres} withCount />
      <ChipSection title="Studios" base="/studio" items={extras.topStudios} withCount />

      {/* News */}
      <NewsSection title={`News zu ${name}`} entity={name} items={news.docs} />

      {/* FAQ */}
      <Faq
        title={`Häufige Fragen zu ${name}`}
        items={[
          {
            q: `Wer ist ${name}?`,
            a:
              plainText(person.bioDe || person.bioSource).slice(0, 280) ||
              `${name} ist im Anime-Bereich tätig${roles.length ? ` als ${roles.map((r) => personRoleLabel(r)).join(', ')}` : ''}.`,
          },
          {
            q: `Welche Rollen / Funktionen hat ${name}?`,
            a: `${roles.length ? `${name} ist erfasst als ${roles.map((r) => personRoleLabel(r)).join(', ')}. ` : ''}${
              voiceCredits.totalDocs ? `Sprechrollen: ${voiceCredits.totalDocs}. ` : ''
            }${staffCredits.totalDocs ? `Mitwirkung an ${staffCredits.totalDocs} Anime.` : ''}`.trim() || 'Noch keine Credits erfasst.',
          },
          {
            q: `An welchen Anime hat ${name} mitgewirkt?`,
            a: topStaffTitles.length
              ? `Unter anderem: ${topStaffTitles.join(', ')}. Die vollständige Liste steht oben unter „Mitwirkung".`
              : `Die Credits findest du oben, sobald sie erfasst sind.`,
          },
        ]}
      />

      {/* SEO-Footer */}
      <section className="mt-12 border-t border-white/10 pt-8">
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-zinc-400">
          <p>
            {name} ist Teil der OtakuPulse-Datenbank. Entdecke weitere{' '}
            <Link href="/person" className="text-accent hover:underline">
              Personen
            </Link>{' '}
            und{' '}
            <Link href="/character" className="text-accent hover:underline">
              Charaktere
            </Link>{' '}
            oder stöbere durch die{' '}
            <Link href="/anime" className="text-accent hover:underline">
              Anime-Datenbank
            </Link>
            .
          </p>
        </div>
      </section>

      <SeoFooter data={person.footerText} vars={personVars(person)} maxW="max-w-5xl" />
    </main>
  )
}
