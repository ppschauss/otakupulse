import { getPayload } from 'payload'
import config from '@payload-config'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { JsonLd } from '@/components/JsonLd'
import { Faq } from '@/components/Faq'
import { breadcrumbLd } from '@/lib/seo'
import { pageMetaFor } from '@/lib/pageContent'
import { PageSeoFooter } from '@/components/SeoFooter'
import { STREAMING_PROVIDERS } from '@/lib/streaming'
import { url } from '@/lib/site'
import { publicAnimeFilter } from '@/lib/adult'

// ISR: Anbieter-Übersicht ändert sich selten (Zahlen alle 10 Min frisch).
export const revalidate = 600

export async function generateMetadata(): Promise<Metadata> {
  return pageMetaFor('plattform', {
    title: 'Wer streamt es? — Anime-Streaming-Anbieter | OtakuPulse',
    description:
      'Wo du Anime legal streamen kannst: Crunchyroll, Netflix, Amazon Prime Video, Disney+ und mehr — mit kompletter Titel-Übersicht pro Anbieter.',
    path: '/plattform',
  })
}

export default async function PlatformListPage() {
  const payload = await getPayload({ config })

  // Live-Trefferzahl pro Anbieter (parallel, reiner Count statt Doc-Fetch).
  const counts = await Promise.all(
    STREAMING_PROVIDERS.map((p) =>
      payload
        .count({
          collection: 'anime',
          where: { and: [{ streamingProviders: { in: [p.slug] } }, publicAnimeFilter] },
        })
        .then((r) => ({ provider: p, total: r.totalDocs })),
    ),
  )
  // Leere Anbieter ausblenden, Rest nach Treffern absteigend.
  const visible = counts.filter((c) => c.total > 0).sort((a, b) => b.total - a.total)

  return (
    <>
    <main className="mx-auto max-w-5xl px-4 py-10">
      <JsonLd data={breadcrumbLd([{ name: 'Start', path: '/' }, { name: 'Streaming-Anbieter', path: '/plattform' }])} />
      <h1 className="text-2xl font-extrabold text-white">Wer streamt es?</h1>
      <p className="mt-2 max-w-2xl text-zinc-400">
        Finde heraus, wo ein Anime legal läuft — und stöbere pro Anbieter durch den kompletten Katalog. Die Zahlen zeigen,
        wie viele Titel in unserer Datenbank dort verfügbar sind.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {visible.map(({ provider, total }) => (
          <Link
            key={provider.slug}
            href={`/plattform/${provider.slug}`}
            className="group rounded-xl border border-white/10 bg-zinc-900/40 p-4 text-center transition hover:border-accent/40 hover:bg-zinc-900/80"
            style={provider.color ? { borderColor: `${provider.color}33` } : undefined}
          >
            {provider.logo ? (
              <span className="mx-auto mb-2 flex h-9 items-center justify-center rounded-md bg-white/90 px-2">
                <Image src={provider.logo} alt={provider.name} width={120} height={24} className="max-h-6 w-auto max-w-[120px] object-contain" />
              </span>
            ) : (
              <span
                className="block h-1.5 w-8 rounded-full"
                style={{ backgroundColor: provider.color || '#888', margin: '0 auto 0.6rem' }}
              />
            )}
            <span className="block text-sm font-medium text-zinc-100 group-hover:text-white">{provider.name}</span>
            <span className="mt-1 block text-xs text-zinc-500">{total.toLocaleString('de-DE')} Titel</span>
          </Link>
        ))}
      </div>

      <Faq
        title="Häufige Fragen zum Anime-Streaming"
        items={[
          {
            q: 'Wo kann ich Anime legal auf Deutsch streamen?',
            a: 'Die wichtigsten Anbieter im deutschsprachigen Raum sind Crunchyroll, ADN (Anime on Demand), aniverse, Netflix, Amazon Prime Video und Disney+. Pro Titel zeigen wir die verfügbaren Plattformen und ob deutsche Untertitel (Sub) oder Synchronisation (Dub) vorliegen.',
          },
          {
            q: 'Sind die Streaming-Angaben tagesaktuell?',
            a: 'Die Verfügbarkeit wird regelmäßig aktualisiert, kann sich aber je nach Region und Lizenzlage ändern. Maßgeblich ist immer die Anzeige beim jeweiligen Anbieter.',
          },
          {
            q: 'Was ist der Unterschied zwischen Sub und Dub?',
            a: 'Sub = Originalton (meist Japanisch) mit deutschen Untertiteln. Dub = deutsche Synchronisation. Beim Anime ist „Sub" oft früher verfügbar (Simulcast), „Dub" folgt später.',
          },
        ]}
      />

      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'Anime-Streaming-Anbieter',
          itemListElement: visible.map(({ provider }, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: url(`/plattform/${provider.slug}`),
            name: provider.name,
          })),
        }}
      />
    </main>
    <PageSeoFooter pageKey="plattform" vars={{ count: visible.length }} maxW="max-w-5xl" />
    </>
  )
}
