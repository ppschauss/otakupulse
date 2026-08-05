import { cache } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { MediaRow } from '@/components/MediaRow'
import { JsonLd } from '@/components/JsonLd'
import { pageMeta, breadcrumbLd } from '@/lib/seo'
import { displayTitle, languageLabel, statusLabel, seasonLabel, formatLabel, plainText, LANGUAGE_ORDER } from '@/lib/anime'
import { streamingProvidersOf } from '@/lib/streaming'

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


const getAnime = cache(async (slug: string) => {
  const payload = await getPayload({ config })
  const res = await payload.find({ collection: 'anime', where: { slug: { equals: slug } }, limit: 1, depth: 1 })
  return (res.docs[0] as any) || null
})

// Natürliche Aufzählung: [a,b,c] → „a, b und c".
function joinNames(names: (string | null | undefined)[]): string {
  const a = names.filter((n): n is string => !!n)
  if (a.length === 0) return ''
  if (a.length === 1) return a[0]
  if (a.length === 2) return `${a[0]} und ${a[1]}`
  return `${a.slice(0, -1).join(', ')} und ${a[a.length - 1]}`
}

// Sprachfassung für die Meta-Description (Dativ, nach „mit …").
const DUB_META: Record<string, string> = {
  'de-dub': 'deutschem Dub (Ger Dub)',
  'de-sub': 'deutschen Untertiteln (Ger Sub)',
  'en-dub': 'englischem Dub (Eng Dub)',
  'en-sub': 'englischen Untertiteln (Eng Sub)',
  ja: 'japanischem Originalton (OmU)',
}

// Alle „Wer streamt es?"-Bausteine aus dem Anime-Datensatz ableiten. Wird von
// generateMetadata UND der Seite genutzt (getAnime ist ge-cached).
function streamVars(anime: any) {
  const title = displayTitle(anime)
  const streaming = streamingProvidersOf(anime)
  const platformNames: string[] = streaming.map((s: any) => s.provider.name)
  const languages: string[] = (Array.isArray(anime.availableLanguages) ? anime.availableLanguages : [])
    .slice()
    .sort((a: string, b: string) => LANGUAGE_ORDER.indexOf(a) - LANGUAGE_ORDER.indexOf(b))
  const genres = (Array.isArray(anime.genres) ? anime.genres : []).filter((g: any) => typeof g === 'object')
  const studiosAll = (Array.isArray(anime.studios) ? anime.studios : []).filter((s: any) => typeof s === 'object')
  const animStudios = studiosAll.filter((s: any) => s.isAnimationStudio)
  const studios = (animStudios.length ? animStudios : studiosAll).slice(0, 2)

  const year: number | null = anime.seasonYear || anime.startDate?.year || null
  const seasonStr = anime.season && anime.seasonYear
    ? `${seasonLabel(anime.season)} ${anime.seasonYear}`
    : year
      ? String(year)
      : ''
  const isMovie = anime.format === 'MOVIE'
  const typ = formatLabel(anime.format) || 'Anime'
  const epCount: number | null = typeof anime.episodes === 'number' && anime.episodes > 0 ? anime.episodes : null
  const episodeCountLabel = isMovie ? '1 Film' : epCount ? `${epCount} Episoden` : 'alle Episoden'
  const episodePhrase = isMovie ? 'den kompletten Film' : epCount ? `alle ${epCount} Episoden` : 'alle Episoden'

  return {
    title,
    hasStream: platformNames.length > 0,
    platformNames,
    platformPhrase: platformNames.length ? joinNames(platformNames) : 'Crunchyroll, Netflix, Amazon Prime Video & Co.',
    languages,
    dubList: joinNames(languages.map(languageLabel)),
    dubMeta: languages.length ? DUB_META[languages[0]] ?? 'Untertiteln' : '',
    hasDeDub: languages.includes('de-dub'),
    hasDeSub: languages.includes('de-sub'),
    genresPhrase: joinNames(genres.slice(0, 3).map((g: any) => g.name)),
    studioNames: joinNames(studios.map((s: any) => s.name)),
    year,
    seasonStr,
    typ,
    isMovie,
    epCount,
    episodeCountLabel,
    episodePhrase,
    status: anime.status as string | null,
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const anime = await getAnime(slug)
  if (!anime) return {}
  const v = streamVars(anime)

  const metaTitle = `${v.title} | Wer streamt es? • Ger Anime Guide${v.year ? ` (${v.year})` : ''}`
  const descParts = [
    `${v.title}${v.seasonStr ? ` (${v.seasonStr})` : ''}: ${v.typ}.`,
    `Erfahre, wo du ${v.episodePhrase} legal${v.hasStream ? ` auf ${v.platformPhrase}` : ''}${v.dubMeta ? ` mit ${v.dubMeta}` : ''} online schauen kannst.`,
  ]
  return pageMeta({
    title: metaTitle,
    description: descParts.join(' '),
    path: `/streamen/${slug}`,
    // Ohne erfasste Anbieter ist die Seite dünn → nicht indexieren.
    noindex: !v.hasStream,
  })
}

export default async function StreamenPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const anime = await getAnime(slug)
  if (!anime) notFound()

  const title = displayTitle(anime)
  const v = streamVars(anime)
  const streaming = streamingProvidersOf(anime)
  const languages: string[] = (Array.isArray(anime.availableLanguages) ? anime.availableLanguages : [])
    .slice()
    .sort((a: string, b: string) => LANGUAGE_ORDER.indexOf(a) - LANGUAGE_ORDER.indexOf(b))
  const recommendations = (Array.isArray(anime.recommendations) ? anime.recommendations : []).filter(
    (r: any) => typeof r === 'object',
  )
  const desc = plainText(anime.descriptionDe || anime.descriptionSource).slice(0, 280)

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Anime', path: '/anime' },
          { name: title, path: `/anime/${slug}` },
          { name: 'Streamen', path: `/streamen/${slug}` },
        ]}
      />
      <h1 className="text-3xl font-extrabold text-white sm:text-4xl">Wo läuft {title} im Stream?</h1>
      <p className="mt-3 max-w-3xl leading-relaxed text-zinc-300">
        {streaming.length
          ? `${title} kannst du bei den folgenden Anbietern legal streamen. Wir zeigen dir die verfügbaren Plattformen und Sprachfassungen.`
          : `Für ${title} ist aktuell kein Streaming-Anbieter in unserer Datenbank erfasst. Schau im Simulcast-Kalender vorbei oder entdecke alle Streaming-Anbieter.`}
      </p>

      {streaming.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-white">Verfügbare Streaming-Anbieter</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {streaming.map(({ provider, url }) => (
              <a
                key={provider.slug}
                href={url}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="group flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-zinc-900/50 p-4 transition hover:border-accent/50 hover:bg-zinc-900"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: provider.color || '#7c3aed' }}
                      aria-hidden
                    />
                    <span className="font-bold text-white group-hover:text-accent">{provider.name}</span>
                  </div>
                  {provider.blurb ? <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{provider.blurb}</p> : null}
                </div>
                <span className="shrink-0 text-sm font-semibold text-accent">Zum Anbieter →</span>
              </a>
            ))}
          </div>
        </section>
      ) : (
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/kalender" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:bg-accent/90">
            Simulcast-Kalender
          </Link>
          <Link href="/plattform" className="rounded-lg bg-white/10 px-5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/20">
            Alle Streaming-Anbieter
          </Link>
        </div>
      )}

      {languages.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold text-white">Sprachfassungen</h2>
          <div className="flex flex-wrap gap-2">
            {languages.map((l) => (
              <span key={l} className="rounded-full bg-white/5 px-3 py-1 text-sm text-zinc-200 ring-1 ring-white/10">
                {languageLabel(l)}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {/* Ausführlicher „Wer streamt es?"-Guide (SEO-Content, tagesaktuell) */}
      <section className="mt-10 max-w-3xl space-y-4 leading-relaxed text-zinc-300">
        <h2 className="text-xl font-bold text-white">Wer streamt {title} in Deutschland?</h2>
        <p>
          Du fragst dich, <strong className="text-zinc-100">wo du {title} legal online schauen</strong> kannst? In
          unserem großen Stream-Guide für Deutschland zeigen wir dir tagesaktuell, welche Streaming-Dienste den Titel
          im Programm haben und auf welcher Plattform er abrufbar ist.
          {v.seasonStr ? (
            <>
              {' '}
              {title} feierte seine Premiere in der <strong className="text-zinc-100">{v.seasonStr}</strong>
              {v.studioNames ? (
                <>
                  {' '}
                  und stammt aus dem Hause <strong className="text-zinc-100">{v.studioNames}</strong>
                </>
              ) : null}
              .
            </>
          ) : v.studioNames ? (
            <>
              {' '}
              Verantwortlich für die Produktion zeichnet das Studio{' '}
              <strong className="text-zinc-100">{v.studioNames}</strong>.
            </>
          ) : null}{' '}
          Ob {title} bei Crunchyroll, Netflix, Amazon Prime Video oder einem anderen seriösen Anbieter läuft, siehst du
          hier auf einen Blick.
        </p>
        <p>
          {v.hasStream ? (
            <>
              Aktuell kannst du {title} bei <strong className="text-zinc-100">{v.platformPhrase}</strong> im Stream
              abrufen — {v.platformNames.length === 1 ? 'dieser Dienst hat' : 'diese Dienste haben'} {v.episodePhrase}{' '}
              legal im Angebot. Damit musst du nicht lange suchen, wo {title} verfügbar ist: Ein Klick auf den jeweiligen
              Anbieter bringt dich direkt zum Stream.
            </>
          ) : (
            <>
              Aktuell ist für {title} noch kein legaler Streaming-Anbieter in unserer Datenbank erfasst. Sobald der Titel
              bei einem Dienst wie Crunchyroll, Netflix oder Amazon Prime Video ins Programm aufgenommen wird und legal
              verfügbar ist, findest du die Info hier zuerst — es lohnt sich also, regelmäßig vorbeizuschauen.
            </>
          )}
          {v.status === 'RELEASING' ? (
            <> Da {title} derzeit noch wöchentlich neue Folgen erhält, hältst du dich am besten über unseren Simulcast-Kalender auf dem Laufenden.</>
          ) : v.status === 'FINISHED' && !v.isMovie ? (
            <> Da {title} bereits abgeschlossen ist, kannst du die komplette Serie am Stück durchbingen, sobald du den passenden Anbieter gefunden hast.</>
          ) : null}
        </p>

        <h3 className="pt-2 text-lg font-bold text-white">
          {title} mit Ger Dub oder Ger Sub online schauen
        </h3>
        <p>
          Für viele Anime-Fans entscheidet die Sprachfassung darüber, wo geschaut wird: Läuft der Titel mit{' '}
          <strong className="text-zinc-100">deutscher Synchronisation (Ger Dub)</strong> oder als Original mit
          Untertiteln <strong className="text-zinc-100">(Ger Sub)</strong>?
          {v.dubList ? (
            <>
              {' '}
              Im Stream ist {title} aktuell vor allem in folgenden Fassungen abrufbar:{' '}
              <strong className="text-zinc-100">{v.dubList}</strong>.
              {v.hasDeDub ? (
                <> Gute Nachrichten für alle, die ungern mitlesen: Eine deutsche Tonspur ist mit an Bord.</>
              ) : v.hasDeSub ? (
                <> Eine deutsche Synchro fehlt zwar, dafür kannst du {title} im Originalton mit deutschen Untertiteln genießen.</>
              ) : null}
            </>
          ) : (
            <>
              {' '}
              Zur Sprachfassung von {title} liegen uns aktuell keine gesicherten Angaben vor — wir ergänzen sie, sobald
              ein Anbieter Ger Dub oder Ger Sub offiziell bestätigt.
            </>
          )}
          {v.genresPhrase ? (
            <>
              {' '}
              Erzählerisch bewegt sich {title} vor allem in den Genres <em>{v.genresPhrase}</em>
              {v.epCount && !v.isMovie ? (
                <>
                  {' '}
                  und umfasst insgesamt <strong className="text-zinc-100">{v.epCount} Episoden</strong>
                </>
              ) : null}
              .
            </>
          ) : null}{' '}
          Egal ob du einen schnellen Rewatch planst oder {title} zum ersten Mal entdeckst – wir halten dich über alle
          legalen Anime-Streams auf dem Laufenden.
        </p>
        <p className="text-sm italic text-zinc-500">
          Hinweis: Die Verfügbarkeit der Streams für {title} kann sich je nach Lizenzlage der Plattformen (etwa
          Crunchyroll, Netflix &amp; Co.) kurzfristig ändern. Wir aktualisieren diesen Guide regelmäßig, damit du keine
          Folge verpasst.
        </p>
      </section>

      {desc ? (
        <section className="mt-8 max-w-3xl">
          <h2 className="mb-2 text-lg font-bold text-white">Worum geht es in {title}?</h2>
          <p className="leading-relaxed text-zinc-400">
            {desc}…{' '}
            <Link href={`/anime/${slug}`} className="text-accent hover:underline">
              Alle Details zu {title}
            </Link>
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            {anime.status ? statusLabel(anime.status) : ''}
            {anime.season && anime.seasonYear ? ` · ${seasonLabel(anime.season)} ${anime.seasonYear}` : ''}
            {anime.episodes ? ` · ${anime.episodes} Episoden` : ''}
          </p>
        </section>
      ) : null}

      {recommendations.length ? (
        <div className="mt-12">
          <MediaRow title={`Ähnlich wie ${title}`} href={`/aehnlich/${slug}`} items={recommendations} />
        </div>
      ) : null}

      <JsonLd
        data={breadcrumbLd([
          { name: 'Start', path: '/' },
          { name: 'Anime', path: '/anime' },
          { name: title, path: `/anime/${slug}` },
          { name: 'Streamen', path: `/streamen/${slug}` },
        ])}
      />
    </main>
  )
}
