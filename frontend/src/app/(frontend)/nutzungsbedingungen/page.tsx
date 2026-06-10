import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { pageMeta } from '@/lib/seo'
import { SITE_NAME } from '@/lib/site'

export const dynamic = 'force-static'

export const metadata: Metadata = pageMeta({
  title: `Nutzungsbedingungen | ${SITE_NAME}`,
  description: `Nutzungsbedingungen für ${SITE_NAME} — die deutschsprachige Anime-Datenbank und News-Plattform.`,
  path: '/nutzungsbedingungen',
})

export default function NutzungsbedingungenPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Nutzungsbedingungen', path: '/nutzungsbedingungen' },
        ]}
      />
      <h1 className="text-3xl font-extrabold text-white">Nutzungsbedingungen</h1>

      <div className="mt-8 space-y-8 leading-relaxed text-zinc-300">
        <p>
          Diese Nutzungsbedingungen regeln die Nutzung der Website {SITE_NAME} (im Folgenden „Website") unter der
          Domain www.otakupulse.de. Mit dem Aufruf und der Nutzung der Website erklärst du dich mit diesen Bedingungen
          einverstanden.
        </p>

        <section>
          <h2 className="text-lg font-bold text-white">1. Anbieter</h2>
          <p className="mt-2">
            Anbieter der Website ist Patrick Schauss, Heldenbergerstr. 14, 61184 Karben, Deutschland (Kontakt:{' '}
            <a href="mailto:info@otakupulse.de" className="text-accent hover:underline">info@otakupulse.de</a>). Weitere
            Angaben findest du im{' '}
            <Link href="/impressum" className="text-accent hover:underline">Impressum</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">2. Gegenstand des Angebots</h2>
          <p className="mt-2">
            {SITE_NAME} ist eine kostenlose, privat betriebene und nicht-kommerzielle Informationsplattform rund um
            Anime: Datenbank zu Anime-Titeln, Charakteren, Studios, Synchronsprechern, Genres und Seasons, ein
            Simulcast-Kalender sowie redaktionelle und automatisiert erstellte News-Beiträge. Es besteht kein Anspruch
            auf Vollständigkeit, Richtigkeit oder ständige Verfügbarkeit der Inhalte.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">3. Nutzung der Inhalte</h2>
          <p className="mt-2">
            Die Nutzung der Website ist kostenlos und überwiegend ohne Registrierung möglich. Du darfst die Inhalte zum
            privaten, nicht-kommerziellen Gebrauch abrufen. Eine systematische Auslesung (z.&nbsp;B. automatisiertes
            Scraping), Vervielfältigung, Verbreitung oder öffentliche Zugänglichmachung größerer Teile der Inhalte ist
            ohne vorherige Zustimmung nicht gestattet. Einzelne Beiträge dürfen unter Angabe der Quelle und mit
            Verlinkung geteilt werden.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">4. Rechte Dritter &amp; Datenquellen</h2>
          <p className="mt-2">
            Metadaten zu Anime stammen unter anderem von AniList und weiteren Quellen; Cover, Bildmaterial, Titel,
            Marken und sonstige Kennzeichen sind Eigentum der jeweiligen Rechteinhaber (Studios, Verlage, Lizenzgeber,
            Streaming-Anbieter). Ihre Darstellung erfolgt zu Informations- und Identifikationszwecken. Sollten Inhalte
            Rechte Dritter verletzen, bitten wir um einen kurzen Hinweis an die oben genannte Kontaktadresse — wir
            entfernen betroffene Inhalte umgehend.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">5. Externe Links</h2>
          <p className="mt-2">
            Die Website enthält Links zu externen Websites Dritter (z.&nbsp;B. Streaming-Anbieter, soziale Netzwerke).
            Auf deren Inhalte und Datenverarbeitung haben wir keinen Einfluss; hierfür sind ausschließlich die
            jeweiligen Betreiber verantwortlich. Zum Zeitpunkt der Verlinkung waren keine Rechtsverstöße erkennbar.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">6. Verfügbarkeit &amp; Haftung</h2>
          <p className="mt-2">
            Ein Anspruch auf ununterbrochene Verfügbarkeit der Website besteht nicht. Wir haften unbeschränkt bei
            Vorsatz und grober Fahrlässigkeit sowie bei der Verletzung von Leben, Körper oder Gesundheit. Im Übrigen ist
            die Haftung auf die Verletzung wesentlicher Vertragspflichten und auf den vorhersehbaren, typischen Schaden
            begrenzt. Für die kostenlose Nutzung der bereitgestellten Informationen wird keine Gewähr für deren
            Richtigkeit, Aktualität oder Eignung für einen bestimmten Zweck übernommen.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">7. Datenschutz</h2>
          <p className="mt-2">
            Informationen zur Verarbeitung personenbezogener Daten findest du in unserer{' '}
            <Link href="/datenschutz" className="text-accent hover:underline">Datenschutzerklärung</Link>.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">8. Änderungen der Nutzungsbedingungen</h2>
          <p className="mt-2">
            Wir behalten uns vor, diese Nutzungsbedingungen mit Wirkung für die Zukunft anzupassen, etwa bei
            Änderungen des Angebots oder der Rechtslage. Es gilt jeweils die zum Zeitpunkt der Nutzung auf dieser Seite
            veröffentlichte Fassung.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">9. Anwendbares Recht</h2>
          <p className="mt-2">
            Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts, soweit dem keine
            zwingenden gesetzlichen Bestimmungen entgegenstehen.
          </p>
        </section>

        <p className="border-t border-white/10 pt-6 text-sm text-zinc-500">
          Siehe auch{' '}
          <Link href="/datenschutz" className="text-accent hover:underline">Datenschutzerklärung</Link> und{' '}
          <Link href="/impressum" className="text-accent hover:underline">Impressum</Link>.
        </p>
      </div>
    </main>
  )
}
