import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { MediaRow } from '@/components/MediaRow'
import { DescriptionText } from '@/components/DescriptionText'
import { ScrollRow } from '@/components/ScrollRow'
import { PortraitCard } from '@/components/PortraitCard'
import { Faq } from '@/components/Faq'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ChipSection, NewsSection } from '@/components/HubSections'
import { SeoFooter } from '@/components/SeoFooter'
import { AdBanner } from '@/components/AdSlot'
import { pageMeta } from '@/lib/seo'
import { characterVars } from '@/lib/entityVars'
import { applyVarsMeta } from '@/lib/vars'
import { hubExtras } from '@/lib/hub'
import { displayName, displayTitle, genderLabel, liveArticleFilters, localImage, plainText, textTooThin } from '@/lib/anime'
import { publicAnimeFilter } from '@/lib/adult'

// ISR statt force-dynamic: Detailseiten wurden bislang bei JEDEM Aufruf neu aus
// der DB gerendert und schickten `Cache-Control: no-store` — dadurch konnte weder
// Cloudflare noch ein Crawler-Cache greifen. Bei ~149k crawlbaren URLs auf einem
// Heim-NAS ist das der Flaschenhals: Googles Crawl-Kapazität ist site-weit
// gedeckelt und wird über alle Crawler geteilt, und langsame Antworten drücken
// sie zusätzlich. Die Daten hier ändern sich selten (der Sync fasst pro Nacht
// ~255 von 11k Anime an), deshalb ist ein Cache-Fenster von 24 Stunden unkritisch.
export const revalidate = 86400

// Leere Liste + dynamicParams: zur Build-Zeit wird NICHTS vorgerendert (bei ~149k
// URLs wäre das absurd), aber Next registriert das dynamische Segment überhaupt
// erst als ISR-fähig. Ohne generateStaticParams landet die Route nicht im
// prerender-manifest und `revalidate` bleibt wirkungslos — die Seite würde
// weiterhin bei jedem Aufruf neu gerendert und `no-store` ausliefern.
export const dynamicParams = true
export async function generateStaticParams() {
  return []
}


async function getCharacter(slug: string) {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'characters', where: { slug: { equals: slug } }, limit: 1, depth: 1 })
  return docs[0] as any
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const c = await getCharacter(slug)
  if (!c) return {}
  const name = displayName(c)
  return pageMeta({
    title: applyVarsMeta(c.seoTitle, characterVars(c)) || `${name} — Charakter, Synchronsprecher & Auftritte | OtakuPulse`,
    description:
      applyVarsMeta(c.seoDescription, characterVars(c)) ||
      plainText(c.descriptionDe || c.descriptionSource).slice(0, 160) ||
      `${name}: Profil, Synchronsprecher und Anime-Auftritte.`,
    path: `/character/${slug}`,
    image: localImage(c),
    // Dünn (kein/zu kurzer DEUTSCHER Text) → noindex; identisch zum Sitemap-keep. Der
    // englische Quelltext zählt nicht als Inhalt (Sprach-Mismatch auf einer de-Seite).
    noindex: c.noindex || textTooThin(c.descriptionDe) || undefined,
    canonical: c.canonicalUrl || undefined,
  })
}

export default async function CharacterDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const character = await getCharacter(slug)
  if (!character) notFound()

  const payload = await getPayload({ config })
  // Gesperrter Bestand (Adult-Policy) zählt nicht zu den Auftritten.
  const where = { and: [{ 'characters.character': { in: [character.id] } }, publicAnimeFilter] }

  const [appearances, extras, coSample, news] = await Promise.all([
    payload.find({ collection: 'anime', where, sort: '-popularity', limit: 24, depth: 0 }),
    hubExtras(payload, where, { news: false }),
    payload.find({ collection: 'anime', where, sort: '-popularity', limit: 6, depth: 1, select: { characters: true } as any }),
    payload.find({
      collection: 'articles',
      where: { and: [{ relatedCharacters: { in: [character.id] } }, ...liveArticleFilters()] },
      sort: '-publishDate',
      limit: 6,
      depth: 0,
    }),
  ])

  // Co-Charaktere aus denselben Anime
  const coMap = new Map<any, any>()
  for (const a of coSample.docs as any[]) {
    for (const c of a.characters || []) {
      const ch = c?.character
      if (ch && typeof ch === 'object' && ch.id !== character.id && ch.slug && !coMap.has(ch.id)) {
        coMap.set(ch.id, { id: ch.id, slug: ch.slug, name: displayName(ch), img: localImage(ch), fav: ch.favourites ?? ch.favorites ?? 0 })
      }
    }
  }
  const coChars = [...coMap.values()].sort((a, b) => b.fav - a.fav).slice(0, 14)

  const name = displayName(character)
  const voiceActors: any[] = Array.isArray(character.voiceActors) ? character.voiceActors : []
  const topTitles = (appearances.docs as any[]).slice(0, 3).map((a) => displayTitle(a))

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Charaktere', path: '/character' },
          { name, path: `/character/${character.slug}` },
        ]}
      />
      <div className="flex flex-col gap-6 sm:flex-row">
        <div className="relative aspect-[3/4] w-40 shrink-0">
          {localImage(character) ? (
            <Image
              src={localImage(character)!}
              alt={name}
              fill
              priority
              sizes="160px"
              className="rounded-xl object-cover ring-1 ring-white/10"
            />
          ) : null}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">Charakter</p>
          <h1 className="mt-1 text-3xl font-extrabold text-white">{name}</h1>
          {character.nameNative ? <p className="mt-1 text-zinc-400">{character.nameNative}</p> : null}

          <dl className="mt-4 space-y-1.5 text-sm">
            {character.gender ? (
              <div className="flex gap-4">
                <dt className="w-28 text-zinc-500">Geschlecht</dt>
                <dd className="text-zinc-200">{genderLabel(character.gender)}</dd>
              </div>
            ) : null}
            {character.age ? (
              <div className="flex gap-4">
                <dt className="w-28 text-zinc-500">Alter</dt>
                <dd className="text-zinc-200">{character.age}</dd>
              </div>
            ) : null}
            {character.bloodType ? (
              <div className="flex gap-4">
                <dt className="w-28 text-zinc-500">Blutgruppe</dt>
                <dd className="text-zinc-200">{character.bloodType}</dd>
              </div>
            ) : null}
            {character.favorites ? (
              <div className="flex gap-4">
                <dt className="w-28 text-zinc-500">Favoriten</dt>
                <dd className="text-zinc-200">♥ {character.favorites.toLocaleString('de-DE')}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      {/* Beschreibung */}
      {character.descriptionDe || character.descriptionSource ? (
        <section className="mt-8 max-w-3xl">
          <h2 className="mb-2 text-lg font-bold text-white">Über {name}</h2>
          <DescriptionText raw={character.descriptionDe || character.descriptionSource} className="leading-relaxed text-zinc-300" />
        </section>
      ) : null}

      {/* Synchronsprecher */}
      {voiceActors.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-white">Synchronsprecher</h2>
          <ul className="flex flex-wrap gap-2">
            {voiceActors.map((va: any, i: number) =>
              va.person && typeof va.person === 'object' ? (
                <li key={i}>
                  <Link
                    href={`/person/${va.person.slug}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/40 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-accent/40 hover:text-white"
                  >
                    {displayName(va.person)}
                    {va.language ? <span className="text-xs text-zinc-500">{va.language}</span> : null}
                  </Link>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      ) : null}

      {/* Auftritte */}
      {appearances.docs.length ? (
        <div className="mt-10">
          <MediaRow title={`Auftritte (${appearances.totalDocs})`} items={appearances.docs} />
        </div>
      ) : null}

      {/* Co-Charaktere */}
      {coChars.length ? (
        <div className="mt-10">
          <ScrollRow title="Charaktere aus denselben Anime">
            {coChars.map((c) => (
              <div key={c.id} className="w-[7rem] shrink-0 snap-start sm:w-32">
                <PortraitCard href={`/character/${c.slug}`} imageUrl={c.img} title={c.name} />
              </div>
            ))}
          </ScrollRow>
        </div>
      ) : null}

      {/* Genres / Studios der Auftritte */}
      <ChipSection title={`Genres mit ${name}`} base="/genre" items={extras.topGenres} withCount />
      <ChipSection title="Studios" base="/studio" items={extras.topStudios} withCount />

      {/* News */}
      <NewsSection title={`News zu ${name}`} entity={name} items={news.docs} />

      <AdBanner />

      {/* FAQ */}
      <Faq
        title={`Häufige Fragen zu ${name}`}
        items={[
          {
            q: `Wer ist ${name}?`,
            a:
              plainText(character.descriptionDe || character.descriptionSource).slice(0, 280) ||
              `${name} ist ein Anime-Charakter${topTitles.length ? `, bekannt u. a. aus ${topTitles.join(', ')}` : ''}.`,
          },
          {
            q: `In welchen Anime kommt ${name} vor?`,
            a: appearances.totalDocs
              ? `${name} tritt in ${appearances.totalDocs} erfassten Anime auf${topTitles.length ? `, darunter ${topTitles.join(', ')}` : ''}.`
              : `Aktuell sind keine Auftritte erfasst.`,
          },
          {
            q: `Wer synchronisiert ${name}?`,
            a: voiceActors.length
              ? `Sprecher:innen von ${name}: ${voiceActors
                  .filter((v) => v.person && typeof v.person === 'object')
                  .map((v) => `${displayName(v.person)}${v.language ? ` (${v.language})` : ''}`)
                  .join(', ')}.`
              : `Es sind noch keine Synchronsprecher erfasst.`,
          },
        ]}
      />

      {/* SEO-Footer */}
      <section className="mt-12 border-t border-white/10 pt-8">
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-zinc-400">
          <p>
            {name} ist einer der Charaktere in der OtakuPulse-Datenbank. Entdecke alle{' '}
            <Link href="/character" className="text-accent hover:underline">
              Charaktere
            </Link>
            , finde die{' '}
            <Link href="/person" className="text-accent hover:underline">
              Synchronsprecher
            </Link>{' '}
            dahinter oder stöbere durch die{' '}
            <Link href="/anime" className="text-accent hover:underline">
              Anime-Datenbank
            </Link>
            .
          </p>
        </div>
      </section>

      <SeoFooter data={character.footerText} vars={characterVars(character)} maxW="max-w-5xl" />
    </main>
  )
}
