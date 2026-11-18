import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import type { Metadata } from 'next'
import { AnimeCard } from '@/components/AnimeCard'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Faq } from '@/components/Faq'
import { JsonLd } from '@/components/JsonLd'
import { PageSeoFooter } from '@/components/SeoFooter'
import { AdBanner } from '@/components/AdSlot'
import { breadcrumbLd } from '@/lib/seo'
import { pageMetaFor } from '@/lib/pageContent'
import { formatDateDe, joinNames } from '@/lib/anime'
import { dubOverview, topDubAnime, MIN_LIST_SIZE } from '@/lib/platformLists'

/**
 * Anbieterübergreifende Ger-Dub-Übersicht.
 *
 * Die Einzelanbieter-Listen (/plattform/<x>/deutscher-dub) beantworten „läuft
 * Ger Dub bei X?". Die Frage davor — „welcher Anbieter hat überhaupt die meisten
 * deutschen Synchros?" — hatte keine Seite, obwohl genau sie gesucht wird. Auf
 * dieser SERP stehen Prosa-Artikel ohne Datenbank (giga.de, kino.de, mein-mmo.de);
 * eine gepflegte Tabelle mit Zahlen und Stand-Datum ist das, was die nicht haben.
 */
export const dynamic = 'force-dynamic'
const TOP = 24

export async function generateMetadata(): Promise<Metadata> {
  const payload = await getPayload({ config })
  const { unique } = await dubOverview(payload)
  // Title ≤ ~60 Zeichen (Google kürzt danach), Description ≤ ~155: der Staging-Crawl
  // vom 18.11.2026 fand die erste Fassung mit 85 bzw. über 170 Zeichen.
  return pageMetaFor('ger-dub', {
    title: `Anime mit deutschem Dub: ${unique.toLocaleString('de-DE')} Titel im Vergleich | OtakuPulse`,
    description: `Welcher Anbieter hat die meisten Anime mit deutscher Synchro? ${unique.toLocaleString('de-DE')} Ger-Dub-Titel bei Crunchyroll, Netflix, Aniverse & Co. im Vergleich — mit Stand-Datum.`,
    path: '/anime-mit-deutschem-dub',
  })
}

export default async function GerDubPage() {
  const payload = await getPayload({ config })
  const [{ rows, unique, checkedAt }, top] = await Promise.all([
    dubOverview(payload),
    topDubAnime(payload, TOP),
  ])
  const stand = formatDateDe(checkedAt)
  const linkable = rows.filter((r) => r.dub >= MIN_LIST_SIZE)
  const leader = rows[0]
  const anyFallback = rows.some((r) => r.fallback && r.dub > 0)

  const faq = [
    {
      q: 'Welcher Streaming-Anbieter hat die meisten Anime mit deutschem Dub?',
      a: leader
        ? `${leader.name} — ${leader.dub.toLocaleString('de-DE')} der ${leader.total.toLocaleString('de-DE')} dort verfügbaren Einträge haben eine deutsche Synchronfassung${
            rows[1] ? `, dahinter ${rows[1].name} mit ${rows[1].dub.toLocaleString('de-DE')}` : ''
          }. Insgesamt zählen wir ${unique.toLocaleString('de-DE')} Anime mit Ger Dub über alle Anbieter hinweg; Titel, die bei mehreren Diensten laufen, sind dabei nur einmal gezählt.`
        : 'Dazu liegen aktuell keine Daten vor.',
    },
    {
      q: 'Was bedeutet Ger Dub und Ger Sub?',
      a: 'Ger Dub ist die deutsche Synchronfassung — die Stimmen sind auf Deutsch eingesprochen. Ger Sub bedeutet japanischer Originalton mit deutschen Untertiteln. Beim Simulcast erscheint fast immer zuerst der Sub, der Dub folgt Wochen oder Monate später, manchmal gar nicht. Deshalb lohnt der Blick auf das Stand-Datum.',
    },
    {
      q: 'Woher kommen diese Angaben?',
      a: `Die Verfügbarkeit stammt aus den Katalogdaten der Anbieter, die Tonspuren aus den Anbieter-APIs; ergänzt wird mit Wikidata/Wikipedia für Klassiker, die kein Streaming-Anbieter führt. Aufgenommen wird nur, was einen direkten Link zum Stream hat.${stand ? ` Letzter Abgleich: ${stand}.` : ''}`,
    },
    ...(anyFallback
      ? [
          {
            q: `Warum steht bei ${joinNames(rows.filter((r) => r.fallback && r.dub > 0).map((r) => r.name))} ein Sternchen?`,
            a: `Dieser Anbieter veröffentlicht in seinem Katalog keine Tonspuren. Dort zählen wir deshalb Titel, die beim Anbieter verfügbar sind und für die eine deutsche Synchronfassung bekannt ist — ob die Fassung im Player auswählbar ist, können wir nicht zusagen. Bei allen anderen Anbietern ist die deutsche Tonspur im Katalog ausgewiesen.`,
          },
        ]
      : []),
    {
      q: 'Gibt es Anime mit deutschem Dub kostenlos?',
      a: 'Ja. Werbefinanzierte Dienste führen einen Teil ihres Katalogs gratis — welche Titel das sind, steht in den „Kostenlos"-Listen der jeweiligen Anbieter. Dazu kommen Probemonate der Abo-Dienste; wer nur eine Serie nachholen will, kommt damit oft ohne Kosten durch.',
    },
  ]

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <JsonLd
        data={breadcrumbLd([
          { name: 'Start', path: '/' },
          { name: 'Anime mit deutschem Dub', path: '/anime-mit-deutschem-dub' },
        ])}
      />
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Anime mit deutschem Dub', path: '/anime-mit-deutschem-dub' },
        ]}
      />

      <p className="text-sm font-semibold uppercase tracking-widest text-accent">Ger Dub</p>
      <h1 className="mt-1 text-3xl font-extrabold text-white">
        Anime mit deutschem Dub: Welcher Anbieter hat was?
      </h1>
      <p className="mt-3 max-w-3xl leading-relaxed text-zinc-300">
        <strong className="text-white">{unique.toLocaleString('de-DE')} Anime</strong> laufen in Deutschland mit{' '}
        <strong className="text-white">deutscher Synchronfassung</strong> — verteilt auf {rows.length} Streaming-Anbieter.
        Hier siehst du, wer wie viel <strong className="text-white">Ger Dub</strong> im Katalog hat, statt in fünf
        Diensten einzeln zu suchen. Titel, die bei mehreren Anbietern laufen, zählen in der Gesamtzahl nur einmal.
        {stand ? ` Stand: ${stand}.` : ''}
      </p>

      {/* Anbieter-Vergleich */}
      <section className="mt-8">
        <h2 className="text-xl font-bold text-white">Ger-Dub-Kataloge im Vergleich</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-semibold">Anbieter</th>
                <th className="px-4 py-3 font-semibold">Mit deutscher Synchro</th>
                <th className="px-4 py-3 font-semibold">Katalog insgesamt</th>
                <th className="px-4 py-3 font-semibold">Anteil</th>
                <th className="px-4 py-3 font-semibold">Liste</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.slug} className="border-t border-white/5">
                  <td className="px-4 py-3 font-bold text-white">
                    <Link href={`/plattform/${r.slug}`} className="hover:text-accent">
                      {r.name}
                    </Link>
                    {r.fallback && r.dub > 0 ? <span className="text-zinc-500">&nbsp;*</span> : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-200">{r.dub.toLocaleString('de-DE')}</td>
                  <td className="px-4 py-3 text-zinc-400">{r.total.toLocaleString('de-DE')}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {r.total ? `${Math.round((r.dub / r.total) * 100)} %` : '–'}
                  </td>
                  <td className="px-4 py-3">
                    {r.dub >= MIN_LIST_SIZE ? (
                      <Link href={`/plattform/${r.slug}/deutscher-dub`} className="text-accent hover:underline">
                        alle ansehen →
                      </Link>
                    ) : (
                      <span className="text-zinc-600">zu wenige Titel</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {anyFallback ? (
          <p className="mt-2 text-xs text-zinc-500">
            * Dieser Anbieter weist in seinem Katalog keine Tonspuren aus. Gezählt sind Titel, die dort verfügbar sind
            und für die eine deutsche Synchronfassung bekannt ist — ohne Zusage, dass die Fassung im Player auswählbar
            ist.
          </p>
        ) : null}
        <p className="mt-2 text-xs text-zinc-500">
          Gezählt werden Einträge, nicht Franchises: Staffeln, Filme, OVAs und Specials stehen einzeln.
        </p>
      </section>

      <AdBanner />

      {/* Beliebteste Ger-Dub-Titel */}
      {top.length ? (
        <section className="mt-10">
          <h2 className="text-xl font-bold text-white">Die beliebtesten Anime mit Ger Dub</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">
            Nach Beliebtheit sortiert — der schnellste Einstieg, wenn du auf Deutsch bingen willst und noch nicht
            weißt, womit.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {top.map((a: any) => (
              <AnimeCard key={a.id} anime={a} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Einstiege */}
      {linkable.length ? (
        <section className="mt-10">
          <h2 className="text-xl font-bold text-white">Ger-Dub-Listen nach Anbieter</h2>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {linkable.map((r) => (
              <Link
                key={r.slug}
                href={`/plattform/${r.slug}/deutscher-dub`}
                className="rounded-full border border-white/10 bg-zinc-900/40 px-3 py-1.5 text-zinc-300 transition hover:border-accent/40 hover:text-white"
              >
                Ger Dub auf {r.name} <span className="text-zinc-500">{r.dub}</span>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-sm text-zinc-400">
            Du suchst stattdessen nach Genre, Jahr oder Sprachfassung?{' '}
            <Link href="/suche" className="text-accent hover:underline">
              Zur Suche
            </Link>{' '}
            — oder alle{' '}
            <Link href="/plattform" className="text-accent hover:underline">
              Streaming-Anbieter im Überblick
            </Link>
            .
          </p>
        </section>
      ) : null}

      <Faq items={faq} title="Häufige Fragen zu Anime mit deutschem Dub" />

      <section className="mt-10 rounded-xl border border-white/10 bg-zinc-900/40 p-4 text-sm leading-relaxed text-zinc-400">
        <strong className="text-zinc-300">So entstehen diese Zahlen:</strong> Wir gleichen die Kataloge der Anbieter
        regelmäßig ab und übernehmen nur Titel mit direktem Link zum Stream. Die Tonspur eines Titels zählt als
        deutsche Synchro, wenn der Anbieter sie ausweist; wo ein Anbieter keine Tonspuren veröffentlicht, ist das in der
        Tabelle markiert. Kataloge ändern sich laufend und unterscheiden sich je nach Region — maßgeblich ist immer das
        aktuelle Angebot beim Anbieter selbst.{' '}
        <Link href="/ueber-uns" className="text-zinc-300 underline-offset-2 hover:text-accent hover:underline">
          So prüfen wir die Verfügbarkeit →
        </Link>
      </section>

      <PageSeoFooter pageKey="ger-dub" maxW="max-w-6xl" />
    </main>
  )
}
