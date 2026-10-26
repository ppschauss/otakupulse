import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { pageMeta } from '@/lib/seo'
import { SITE_NAME } from '@/lib/site'

export const dynamic = 'force-static'

export const metadata: Metadata = pageMeta({
  title: `Impressum | ${SITE_NAME}`,
  description: `Impressum und Anbieterkennzeichnung von ${SITE_NAME} gemäß § 5 DDG.`,
  path: '/impressum',
})

export default function ImpressumPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Impressum', path: '/impressum' },
        ]}
      />
      <h1 className="text-3xl font-extrabold text-white">Impressum</h1>

      <div className="mt-8 space-y-8 leading-relaxed text-zinc-300">
        <section>
          <h2 className="text-lg font-bold text-white">Angaben gemäß § 5 DDG</h2>
          <p className="mt-2">
            Patrick Schauss
            <br />
            Heldenbergerstr. 14
            <br />
            61184 Karben
            <br />
            Deutschland
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">Kontakt</h2>
          <p className="mt-2">
            E-Mail:{' '}
            <a href="mailto:info@otakupulse.de" className="text-accent hover:underline">
              info@otakupulse.de
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
          <p className="mt-2">
            Patrick Schauss
            <br />
            Heldenbergerstr. 14, 61184 Karben
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">Hinweis</h2>
          <p className="mt-2">
            {SITE_NAME} ist ein privat betriebenes Projekt. Auf der Website wird Werbung eingeblendet
            (Google AdSense), um die laufenden Kosten für Server und Domains anteilig zu decken. Es werden keine
            Aufträge entgegengenommen.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">Datenquellen &amp; Urheberrecht</h2>
          <p className="mt-2">
            Die auf {SITE_NAME} dargestellten Anime-Stammdaten (Titel, Beschreibungen, Cover, Charaktere, Personen,
            Studios u.&nbsp;a.) stammen u.&nbsp;a. aus der offenen{' '}
            <a href="https://anilist.co" rel="nofollow noopener noreferrer" target="_blank" className="text-accent hover:underline">
              AniList-API
            </a>
            . Cover und Bildmaterial sowie Marken-, Titel- und Werkrechte verbleiben bei den jeweiligen Rechteinhabern
            (Verlage, Studios, Lizenzgeber). Sie werden hier ausschließlich zu Informations- und Katalogzwecken
            verwendet. Sollte sich Inhalt auf dieser Seite befinden, der Rechte Dritter verletzt, bitten wir um einen
            kurzen Hinweis per E-Mail — beanstandete Inhalte werden umgehend entfernt.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">Haftung für Inhalte</h2>
          <p className="mt-2">
            Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen
            Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir als Diensteanbieter jedoch nicht verpflichtet,
            übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf
            eine rechtswidrige Tätigkeit hinweisen.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">Haftung für Links</h2>
          <p className="mt-2">
            Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben.
            Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten
            Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.
          </p>
        </section>

        <p className="border-t border-white/10 pt-6 text-sm text-zinc-500">
          Siehe auch unsere{' '}
          <Link href="/datenschutz" className="text-accent hover:underline">
            Datenschutzerklärung
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
