import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { AnimeCard } from '@/components/AnimeCard'
import { Pagination } from '@/components/Pagination'
import { Faq } from '@/components/Faq'
import { ContentNote } from '@/components/ContentNote'
import { NUDITY_NOTE, NUDITY_NOTE_TITLE } from '@/lib/fanservice'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { ChipSection, NewsSection } from '@/components/HubSections'
import { SeoFooter } from '@/components/SeoFooter'
import { pageMeta } from '@/lib/seo'
import { hubExtras } from '@/lib/hub'
import { TAG_CATEGORY_LABELS } from '@/lib/anime'
import { tagVars } from '@/lib/entityVars'
import { applyVarsMeta } from '@/lib/vars'
import { adsAllowedForTag, publicAnimeFilter } from '@/lib/adult'
import { AdBanner } from '@/components/AdSlot'

export const dynamic = 'force-dynamic'
const PER_PAGE = 36

async function getTag(slug: string) {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'tags', where: { slug: { equals: slug } }, limit: 1, depth: 0 })
  return docs[0] as any
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const t = await getTag(slug)
  if (!t) return {}
  const meta = pageMeta({
    title: applyVarsMeta(t.seoTitle, tagVars(t)) || `${t.name}-Anime — Liste & Empfehlungen | OtakuPulse`,
    description:
      applyVarsMeta(t.seoDescription, tagVars(t)) ||
      (t.descriptionDe ? t.descriptionDe.slice(0, 160) : `Anime mit dem Tag „${t.name}" — sortiert nach Beliebtheit.`),
    path: `/tag/${slug}`,
    noindex: t.noindex || undefined,
    canonical: t.canonicalUrl || undefined,
  })
  if (t.isAdult) meta.robots = { index: false, follow: true }
  return meta
}

export default async function TagDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { slug } = await params
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const isFirst = page === 1

  const tag = await getTag(slug)
  if (!tag) notFound()

  const payload = await getPayload({ config })
  const result = await payload.find({
    collection: 'anime',
    where: { and: [{ 'tags.tag': { in: [tag.id] } }, publicAnimeFilter] },
    sort: '-popularity',
    limit: PER_PAGE,
    page,
    depth: 0,
  })

  const intro =
    tag.descriptionDe ||
    `Anime mit dem Tag „${tag.name}" teilen ein wiederkehrendes Motiv oder Element. Hier findest du alle Titel, in denen „${tag.name}" eine Rolle spielt — sortiert nach Beliebtheit.`

  const extras = isFirst ? await hubExtras(payload, { 'tags.tag': { in: [tag.id] } }) : null
  const relatedTags = isFirst
    ? (
        await payload.find({
          collection: 'tags',
          where: tag.category ? { and: [{ slug: { not_equals: slug } }, { category: { equals: tag.category } }] } : { slug: { not_equals: slug } },
          sort: 'name',
          limit: 24,
          depth: 0,
        })
      ).docs
    : []

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Tags', path: '/tag' },
          { name: tag.name, path: `/tag/${slug}` },
        ]}
      />
      <p className="text-sm font-semibold uppercase tracking-widest text-accent">Tag</p>
      <h1 className="mt-1 text-3xl font-extrabold text-white">{tag.name}</h1>
      <p className="mt-1 text-zinc-400">
        {result.totalDocs} Anime{tag.category ? ` · ${TAG_CATEGORY_LABELS[tag.category] ?? tag.category}` : ''}
      </p>

      <p className="mt-4 max-w-3xl leading-relaxed text-zinc-300">{intro}</p>

      <h2 className="mt-10 text-xl font-bold text-white">Anime mit „{tag.name}"</h2>
      {result.docs.length === 0 ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-zinc-900/50 p-8 text-center text-zinc-400">
          Noch keine Anime mit diesem Tag.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {result.docs.map((a: any) => (
            <AnimeCard key={a.id} anime={a} />
          ))}
        </div>
      )}

      <Pagination basePath={`/tag/${slug}`} page={page} totalPages={result.totalPages} />

      {isFirst && extras ? (
        <>
          <ChipSection
            title={`Genres mit „${tag.name}"`}
            subtitle={`In diesen Genres taucht „${tag.name}" besonders häufig auf:`}
            base="/genre"
            items={extras.topGenres}
            withCount
          />
          <ChipSection title={`Top-Studios für „${tag.name}"`} base="/studio" items={extras.topStudios} withCount />
          <NewsSection title={`News zu „${tag.name}"`} entity={`„${tag.name}"-Anime`} items={extras.news} />
          <ChipSection
            title={tag.category ? `Weitere ${TAG_CATEGORY_LABELS[tag.category] ?? ''}-Tags` : 'Weitere Tags'}
            base="/tag"
            items={relatedTags as any}
          />

          {/* Fanservice-Tags: Einordnung (kein Hentai, nur Anspielungen/kurze Szenen). */}
          {tag.slug === 'nudity' ? (
            <ContentNote title={NUDITY_NOTE_TITLE}>
              {NUDITY_NOTE.map((t, i) => (
                <p key={i}>{t}</p>
              ))}
            </ContentNote>
          ) : null}

          <AdBanner allowed={adsAllowedForTag(slug)} />

          <Faq
            title={`Häufige Fragen zu „${tag.name}"`}
            items={[
              ...(tag.slug === 'nudity'
                ? [
                    {
                      q: 'Heißt „Nudity" hier Hentai?',
                      a:
                        'Nein. Der Tag markiert kurze, meist nicht-sexuelle Szenen — Bad, Umkleide, Verwandlung — in ganz '
                        + 'normalen Serien. Pornografische Titel (Hentai) sind auf OtakuPulse nicht gelistet.',
                    },
                  ]
                : []),
              {
                q: `Was bedeutet das Tag „${tag.name}"?`,
                a: `„${tag.name}" markiert ein wiederkehrendes Thema, Setting oder Element. Anime mit diesem Tag teilen dieses Merkmal — ideal, um ähnliche Titel zu entdecken.`,
              },
              {
                q: `Wie viele Anime sind mit „${tag.name}" getaggt?`,
                a: `Aktuell ${result.totalDocs} Titel. Da Tags pro Anime gewichtet sind, stehen die relevantesten oben.`,
              },
              {
                q: `Welche Genres passen zu „${tag.name}"?`,
                a:
                  extras.topGenres.length > 0
                    ? `„${tag.name}" findet sich vor allem in ${extras.topGenres.slice(0, 5).map((g) => g.name).join(', ')}.`
                    : `Die Genres findest du auf den jeweiligen Anime-Detailseiten.`,
              },
            ]}
          />

          <section className="mt-12 border-t border-white/10 pt-8">
            <h2 className="mb-3 text-lg font-bold text-white">„{tag.name}"-Anime auf OtakuPulse</h2>
            <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-zinc-400">
              <p>{intro}</p>
              <p>
                Entdecke alle {result.totalDocs} Titel mit „{tag.name}", stöbere durch{' '}
                <Link href="/tag" className="text-accent hover:underline">
                  weitere Tags
                </Link>{' '}
                und{' '}
                <Link href="/genre" className="text-accent hover:underline">
                  Genres
                </Link>{' '}
                oder nutze die{' '}
                <Link href="/suche" className="text-accent hover:underline">
                  erweiterte Suche
                </Link>{' '}
                für gezielte Kombinationen.
              </p>
            </div>
          </section>
        </>
      ) : null}

      <SeoFooter data={tag.footerText} vars={{ ...tagVars(tag), count: result.totalDocs }} maxW="max-w-6xl" />
    </main>
  )
}
