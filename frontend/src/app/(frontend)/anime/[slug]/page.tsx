import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { AnimeCard } from '@/components/AnimeCard'
import { AdultGuard } from '@/components/AdultGuard'
import { DescriptionText } from '@/components/DescriptionText'
import { PortraitCard } from '@/components/PortraitCard'
import { ScrollRow } from '@/components/ScrollRow'
import { MediaRow } from '@/components/MediaRow'
import { JsonLd } from '@/components/JsonLd'
import { SeoFooter } from '@/components/SeoFooter'
import { ShareButtons } from '@/components/ShareButtons'
import { animeLd, breadcrumbLd, pageMeta } from '@/lib/seo'
import { url } from '@/lib/site'
import {
  displayTitle,
  displayName,
  formatLabel,
  statusLabel,
  languageLabel,
  LANGUAGE_ORDER,
  seasonLabel,
  characterRoleLabel,
  relationLabel,
  plainText,
  animeCover,
  animeBanner,
  localImage,
  animeIndexable,
} from '@/lib/anime'
import { importAnimeBySlug } from '@/lib/import'
import { StreamingBox } from '@/components/StreamingBox'
import { similarAnime } from '@/lib/similar'
import { streamingGuide, streamingMetaDescription, streamingMetaTitle, type GuideSection } from '@/lib/streamingText'
import { Faq } from '@/components/Faq'
import { RichLine } from '@/components/RichLine'
import { animeVars } from '@/lib/entityVars'
import { applyVarsMeta } from '@/lib/vars'

// ISR statt force-dynamic: Detailseiten wurden bislang bei JEDEM Aufruf neu aus
// der DB gerendert und schickten `Cache-Control: no-store` — dadurch konnte weder
// Cloudflare noch ein Crawler-Cache greifen. Bei ~149k crawlbaren URLs auf einem
// Heim-NAS ist das der Flaschenhals: Googles Crawl-Kapazität ist site-weit
// gedeckelt und wird über alle Crawler geteilt, und langsame Antworten drücken
// sie zusätzlich. Die Daten hier ändern sich selten (der Sync fasst pro Nacht
// ~255 von 11k Anime an), deshalb ist ein Cache-Fenster von 1 Stunde unkritisch.
export const revalidate = 3600

// Leere Liste + dynamicParams: zur Build-Zeit wird NICHTS vorgerendert (bei ~149k
// URLs wäre das absurd), aber Next registriert das dynamische Segment überhaupt
// erst als ISR-fähig. Ohne generateStaticParams landet die Route nicht im
// prerender-manifest und `revalidate` bleibt wirkungslos — die Seite würde
// weiterhin bei jedem Aufruf neu gerendert und `no-store` ausliefern.
export const dynamicParams = true
export async function generateStaticParams() {
  return []
}


// Auf 160 Zeichen kürzen, aber an der Wortgrenze (kein „…Naruto Uzumaki ist ei").
function truncateWords(s: string, max: number): string {
  if (s.length <= max) return s
  const cut = s.slice(0, max - 1)
  const i = cut.lastIndexOf(' ')
  return (i > max * 0.6 ? cut.slice(0, i) : cut).replace(/[,;:\s]+$/, '') + '…'
}

// Textsektion des Streaming-Guides (Vorlage A–F): h3 + Absätze, optional Unterabschnitte je Anbieter + Link-Satz.
function GuideBlock({ section }: { section: GuideSection }) {
  return (
    <div id={section.id} className="mt-8">
      <h3 className="mb-2 text-base font-bold text-white">{section.heading}</h3>
      <div className="space-y-3 leading-relaxed text-zinc-300">
        {section.paragraphs.map((p, i) => (
          <p key={i}>
            <RichLine text={p} />
          </p>
        ))}
        {section.subsections?.map((sub) => (
          <div key={sub.heading}>
            <h4 className="mb-1 mt-4 text-sm font-bold text-zinc-200">{sub.heading}</h4>
            <p>
              <RichLine text={sub.paragraph} />
            </p>
          </div>
        ))}
        {section.ctaSentence ? (
          <p>
            {section.ctaSentence.before}
            <a
              href={section.ctaSentence.url}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="font-semibold text-accent underline-offset-2 hover:underline"
            >
              {section.ctaSentence.linkText}
            </a>
            {section.ctaSentence.after}
          </p>
        ) : null}
      </div>
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-300">
      {children}
    </span>
  )
}

async function findBySlug(slug: string) {
  const payload = await getPayload({ config })
  const { docs } = await payload.find({ collection: 'anime', where: { slug: { equals: slug } }, limit: 1, depth: 2 })
  return docs[0] as any
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const anime = await findBySlug(slug)
  if (!anime) return {}
  const title = displayTitle(anime)
  const vars = animeVars(anime)
  // Title/Description datenabhängig (lib/streamingText): Mit Stream stehen Anbieter,
  // Sprachfassung und Kosten vorn (Suchintention „x streamen"), ohne Stream die
  // Datenbank-Infos. Ein redaktionelles seoTitle/seoDescription gewinnt weiterhin.
  const autoTitle = streamingMetaTitle(anime)
  const autoDesc = truncateWords(streamingMetaDescription(anime), 160)
  return pageMeta({
    title: applyVarsMeta(anime.seoTitle, vars) || autoTitle,
    description: applyVarsMeta(anime.seoDescription, vars) || autoDesc,
    path: `/anime/${anime.slug}`,
    image: anime.coverImageUrl,
    // Inhaltliche Indexregel (Stream ODER deutscher Text) — identisch zum Sitemap-keep.
    noindex: !animeIndexable(anime) || undefined,
    canonical: anime.canonicalUrl || undefined,
  })
}

export default async function AnimeDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayload({ config })

  let anime: any = await findBySlug(slug)

  // On-Demand-Fallback: Slug noch nicht in der DB → live von AniList importieren.
  if (!anime) {
    const importedSlug = await importAnimeBySlug(payload, slug)
    if (!importedSlug) notFound()
    // Fuzzy-Treffer landete unter anderem Slug → auf die kanonische URL umleiten.
    if (importedSlug !== slug) redirect(`/anime/${importedSlug}`)
    anime = await findBySlug(slug)
    if (!anime) notFound()
  }

  const title = displayTitle(anime)
  const genres = (Array.isArray(anime.genres) ? anime.genres : []).filter((g: any) => typeof g === 'object')
  const studios = (Array.isArray(anime.studios) ? anime.studios : []).filter((s: any) => typeof s === 'object')
  const tags = (Array.isArray(anime.tags) ? anime.tags : []).filter((t: any) => t?.tag && typeof t.tag === 'object')
  const characters = (Array.isArray(anime.characters) ? anime.characters : []).filter(
    (c: any) => c?.character && typeof c.character === 'object',
  )
  const staff = (Array.isArray(anime.staff) ? anime.staff : []).filter((s: any) => s?.person && typeof s.person === 'object')
  const relations = (Array.isArray(anime.relations) ? anime.relations : []).filter(
    (r: any) => r?.anime && typeof r.anime === 'object',
  )
  const season = anime.animeSeason && typeof anime.animeSeason === 'object' ? anime.animeSeason : null
  const languages: string[] = (Array.isArray(anime.availableLanguages) ? anime.availableLanguages : [])
    .slice()
    .sort((a: string, b: string) => LANGUAGE_ORDER.indexOf(a) - LANGUAGE_ORDER.indexOf(b))

  const episodes = await payload.find({
    collection: 'episodes',
    where: { anime: { equals: anime.id } },
    sort: 'number',
    limit: 60,
    depth: 0,
  })
  const similar = await similarAnime(payload, anime)
  const guide = streamingGuide(anime)

  return (
    <main>
      <JsonLd data={animeLd(anime)} />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Start', path: '/' },
          { name: 'Anime', path: '/anime' },
          { name: title, path: `/anime/${anime.slug}` },
        ])}
      />
      {/* Banner */}
      <div className="relative h-48 w-full overflow-hidden sm:h-72">
        {animeBanner(anime) ? (
          <Image src={animeBanner(anime)!} alt="" fill priority sizes="100vw" className="object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-accent/30 to-accent-2/30" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
        <AdultGuard anime={anime} size="md" rounded="" />
      </div>

      {/* relative z-10: Der Inhalt ragt per -mt-20 in den Banner; dessen absolut
          positionierte Bild-/Gradient-Ebenen würden sonst über den (nicht
          positionierten) Titel malen — bei zweizeiligen Titeln war die obere
          Zeile halb verdeckt. */}
      <div className="relative z-10 mx-auto max-w-5xl px-4">
        <div className="-mt-20 flex flex-col gap-6 sm:flex-row sm:items-end">
          {/* Cover */}
          <div className="relative aspect-[2/3] w-36 shrink-0 sm:w-48">
            {animeCover(anime) ? (
              <Image
                src={animeCover(anime)!}
                alt={title}
                fill
                sizes="(max-width: 768px) 144px, 192px"
                className="rounded-xl object-cover shadow-xl ring-1 ring-white/10"
              />
            ) : null}
            <AdultGuard anime={anime} size="md" rounded="rounded-xl" interactive />
          </div>

          {/* Titel & Meta */}
          <div className="flex-1 pb-1">
            <h1 className="text-2xl font-extrabold text-white sm:text-4xl">{title}</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {anime.titleRomaji}
              {anime.titleNative ? ` · ${anime.titleNative}` : ''}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {anime.format ? <Badge>{formatLabel(anime.format)}</Badge> : null}
              {anime.status ? <Badge>{statusLabel(anime.status)}</Badge> : null}
              {season ? (
                <Link href={`/season/${season.slug}`}>
                  <Badge>
                    {seasonLabel(anime.season)} {anime.seasonYear}
                  </Badge>
                </Link>
              ) : anime.season || anime.seasonYear ? (
                <Badge>
                  {seasonLabel(anime.season)} {anime.seasonYear}
                </Badge>
              ) : null}
              {anime.episodes ? <Badge>{anime.episodes} Episoden</Badge> : null}
              {anime.averageScore ? (
                <span className="rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400">
                  ★ {anime.averageScore}%
                </span>
              ) : null}
            </div>

            {languages.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-zinc-500">Sprachen:</span>
                {languages.map((l) => {
                  const isDub = l.endsWith('-dub')
                  return (
                    <span
                      key={l}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                        isDub
                          ? 'bg-accent/20 text-white ring-1 ring-accent/40'
                          : 'border border-white/10 bg-white/5 text-zinc-300'
                      }`}
                    >
                      {languageLabel(l)}
                    </span>
                  )
                })}
              </div>
            ) : null}

            <div className="mt-4">
              <ShareButtons url={url(`/anime/${anime.slug}`)} title={title} message={`Schau dir den Anime „${title}“ auf OtakuPulse an 👀`} />
            </div>
          </div>
        </div>

        {/* Genres */}
        {genres.length ? (
          <div className="mt-8 flex flex-wrap gap-2">
            {genres.map((g: any) => (
              <Link
                key={g.id}
                href={`/genre/${g.slug}`}
                className="rounded-full bg-gradient-to-r from-accent/15 to-accent-2/15 px-3 py-1 text-sm text-zinc-200 ring-1 ring-white/10 transition hover:text-white"
              >
                {g.name}
              </Link>
            ))}
          </div>
        ) : null}

        <StreamingBox anime={anime} title={title} />

        {/* Beschreibung */}
        {anime.descriptionDe || anime.descriptionSource ? (
          <section className="mt-8 max-w-3xl">
            <h2 className="mb-2 text-lg font-bold text-white">Handlung</h2>
            <DescriptionText raw={anime.descriptionDe || anime.descriptionSource} className="leading-relaxed text-zinc-300" />
          </section>
        ) : null}

        {/* Streaming-Guide: Fließtext aus den Angebotsdaten (nur mit Anbietern) */}
        {guide ? (
          <section className="mt-10 max-w-3xl" id="wer-streamt">
            <h2 className="mb-2 text-lg font-bold text-white">{guide.heading}</h2>
            <p className="leading-relaxed text-zinc-300">
              <RichLine text={guide.intro} />
            </p>
            <GuideBlock section={guide.howTo} />
            <h3 className="mt-6 mb-2 text-base font-bold text-white">{guide.overviewHeading}</h3>
            <ul className="divide-y divide-white/10 rounded-xl border border-white/10 bg-zinc-900/40 text-sm">
              {guide.overview.map((row) => (
                <li key={row.label} className="flex gap-4 px-4 py-2.5">
                  <strong className="w-44 shrink-0 font-semibold text-zinc-400">{row.label}:</strong>
                  <span className="text-zinc-200">{row.value}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-zinc-300">
              {guide.cta.lead}{' '}
              <a
                href={guide.cta.url}
                target="_blank"
                rel="nofollow noopener noreferrer"
                title={guide.cta.title}
                className="font-semibold text-accent underline-offset-2 hover:underline"
              >
                {guide.cta.text}
              </a>
            </p>
            {guide.sections.map((sec) => (
              <GuideBlock key={sec.id} section={sec} />
            ))}
            <GuideBlock section={guide.summary} />
          </section>
        ) : null}

        {/* Infos */}
        <section className="mt-10 grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-5">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-400">Details</h3>
            <dl className="space-y-1.5 text-sm">
              {studios.length ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">Studio</dt>
                  <dd className="text-right">
                    {studios.map((s: any, i: number) => (
                      <span key={s.id}>
                        {i > 0 ? ', ' : ''}
                        <Link href={`/studio/${s.slug}`} className="text-zinc-200 hover:text-accent">
                          {s.name}
                        </Link>
                      </span>
                    ))}
                  </dd>
                </div>
              ) : null}
              {anime.source ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">Vorlage</dt>
                  <dd className="text-zinc-200">{anime.source}</dd>
                </div>
              ) : null}
              {anime.countryOfOrigin ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">Herkunft</dt>
                  <dd className="text-zinc-200">{anime.countryOfOrigin}</dd>
                </div>
              ) : null}
              {anime.popularity ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-500">Popularität</dt>
                  <dd className="text-zinc-200">{anime.popularity.toLocaleString('de-DE')}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          {anime.trailerUrl ? (
            <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-5">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-400">Trailer</h3>
              <a
                href={anime.trailerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-accent to-accent-2 px-4 py-2 font-semibold text-white"
              >
                ▶ Trailer ansehen
              </a>
            </div>
          ) : null}
        </section>

        {/* Charaktere */}
        {characters.length ? (
          <div className="mt-10">
            <ScrollRow title="Charaktere" href={`/anime/${anime.slug}/charaktere`}>
              {characters.map((c: any) => (
                <div key={c.character.id} className="w-[7rem] shrink-0 snap-start sm:w-32">
                  <PortraitCard
                    href={`/character/${c.character.slug}`}
                    imageUrl={localImage(c.character)}
                    title={displayName(c.character)}
                    subtitle={characterRoleLabel(c.role)}
                  />
                </div>
              ))}
            </ScrollRow>
          </div>
        ) : null}

        {/* Staff */}
        {staff.length ? (
          <section className="mt-10">
            <h2 className="mb-3 text-lg font-bold text-white">Staff</h2>
            <ul className="flex flex-wrap gap-2">
              {staff.slice(0, 20).map((s: any, i: number) => (
                <li key={i}>
                  <Link
                    href={`/person/${s.person.slug}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/40 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-accent/40 hover:text-white"
                  >
                    {displayName(s.person)}
                    {s.role ? <span className="text-xs text-zinc-500">{s.role}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Episoden */}
        {episodes.docs.length ? (
          <section className="mt-10">
            <div className="mb-3 flex items-end justify-between">
              <h2 className="text-lg font-bold text-white">Episoden ({episodes.totalDocs})</h2>
              <Link href={`/anime/${anime.slug}/episoden`} className="text-sm font-medium text-zinc-400 transition hover:text-accent">
                Alle Episoden →
              </Link>
            </div>
            <ul className="divide-y divide-white/10 rounded-xl border border-white/10 bg-zinc-900/40">
              {episodes.docs.map((ep: any) => (
                <li key={ep.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                  <span className="text-zinc-200">
                    <span className="text-zinc-500">#{ep.number}</span> {ep.titleGerman || ep.titleEnglish || ''}
                  </span>
                  {ep.airDate ? (
                    <span className="shrink-0 text-xs text-zinc-500">
                      {new Date(ep.airDate).toLocaleDateString('de-DE')}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Tags */}
        {tags.length ? (
          <section className="mt-10">
            <h2 className="mb-3 text-lg font-bold text-white">Tags</h2>
            <div className="flex flex-wrap gap-2">
              {tags.map((t: any) => (
                <Link
                  key={t.tag.id}
                  href={`/tag/${t.tag.slug}`}
                  className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-zinc-300 transition hover:text-accent"
                >
                  {t.tag.name}
                  {typeof t.rank === 'number' ? <span className="ml-1 text-zinc-600">{t.rank}%</span> : null}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {/* Relationen */}
        {relations.length ? (
          <section className="mt-10">
            <h2 className="mb-4 text-lg font-bold text-white">Verknüpfte Anime</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {relations.map((r: any, i: number) => (
                <div key={i}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent">{relationLabel(r.relationType)}</p>
                  <AnimeCard anime={r.anime} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* FAQ zum Streaming (FAQPage-JSON-LD über die Faq-Komponente) */}
        {guide?.faq.length ? <Faq items={guide.faq} title={guide.faqHeading} /> : null}

        {/* Ähnliche Anime — früher /aehnlich/<slug>, seit dem Merge Teil dieser Seite */}
        {similar.length ? (
          <section id="aehnlich" className="mt-10 scroll-mt-24 pb-4">
            <MediaRow title={`Anime ähnlich wie ${title}`} items={similar} />
          </section>
        ) : null}
      </div>

      <SeoFooter data={anime.footerText} vars={animeVars(anime)} maxW="max-w-6xl" />
    </main>
  )
}
