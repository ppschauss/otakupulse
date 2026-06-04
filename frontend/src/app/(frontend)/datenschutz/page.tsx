import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { pageMeta } from '@/lib/seo'
import { SITE_NAME } from '@/lib/site'

export const dynamic = 'force-static'

export const metadata: Metadata = pageMeta({
  title: `Datenschutzerklärung | ${SITE_NAME}`,
  description: `Informationen zur Verarbeitung personenbezogener Daten auf ${SITE_NAME} gemäß DSGVO.`,
  path: '/datenschutz',
})

export default function DatenschutzPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Breadcrumbs
        items={[
          { name: 'Start', path: '/' },
          { name: 'Datenschutz', path: '/datenschutz' },
        ]}
      />
      <h1 className="text-3xl font-extrabold text-white">Datenschutzerklärung</h1>

      <div className="mt-8 space-y-8 leading-relaxed text-zinc-300">
        <p>
          Der Schutz deiner personenbezogenen Daten ist uns wichtig. Nachfolgend informieren wir dich gemäß
          Art. 13 DSGVO über die Verarbeitung personenbezogener Daten bei der Nutzung von {SITE_NAME}.
        </p>

        <section>
          <h2 className="text-lg font-bold text-white">1. Verantwortlicher</h2>
          <p className="mt-2">
            Patrick Schauss
            <br />
            Heldenbergerstr. 14, 61184 Karben, Deutschland
            <br />
            E-Mail:{' '}
            <a href="mailto:info@patrickschauss.de" className="text-accent hover:underline">
              info@patrickschauss.de
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">2. Hosting &amp; Server-Logfiles</h2>
          <p className="mt-2">
            Beim Aufruf dieser Website werden durch den Server automatisch Informationen erfasst, die dein Browser
            übermittelt (sog. Server-Logfiles): IP-Adresse, Datum und Uhrzeit der Anfrage, aufgerufene Seite/Datei,
            übertragene Datenmenge, Referrer-URL sowie Browser- und Betriebssystemkennung. Diese Daten dienen
            ausschließlich dem technischen Betrieb, der Sicherheit und der Stabilität der Website.
          </p>
          <p className="mt-2">
            Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einer fehlerfreien und sicheren
            Bereitstellung). Die Logfiles werden nach kurzer Zeit gelöscht, soweit sie nicht zur Aufklärung von
            Störungen oder Missbrauch benötigt werden.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">3. Cookies</h2>
          <p className="mt-2">
            {SITE_NAME} setzt für den Betrieb keine Tracking-Cookies und keine Cookies zu Marketingzwecken. Technisch
            notwendige Cookies können bei der Nutzung des geschützten Verwaltungsbereichs (Login) gesetzt werden;
            für die öffentliche Nutzung der Website ist keine Einwilligung erforderlich.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">4. Reichweitenmessung (cookieless)</h2>
          <p className="mt-2">
            Soweit aktiviert, nutzen wir eine datenschutzfreundliche, cookielose Reichweitenmessung (Plausible bzw.
            Umami). Dabei werden keine Cookies gesetzt und keine personenbezogenen Profile gebildet; IP-Adressen werden
            nicht dauerhaft gespeichert. Erhoben werden lediglich aggregierte Statistiken (z.&nbsp;B. Seitenaufrufe,
            Referrer, ungefähre Herkunftsregion). Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes
            Interesse an der statistischen Auswertung zur Verbesserung des Angebots).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">5. Externe Inhalte (Bilder &amp; Verlinkungen)</h2>
          <p className="mt-2">
            Inhalte wie Cover und Bildmaterial können von externen Quellen (u.&nbsp;a. der AniList-CDN) stammen. Beim
            Laden solcher Inhalte kann deine IP-Adresse an den jeweiligen Anbieter übertragen werden. Zudem verlinken
            wir auf externe Websites (z.&nbsp;B. Streaming-Anbieter); für deren Datenverarbeitung sind ausschließlich
            die jeweiligen Betreiber verantwortlich.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">6. Kontaktaufnahme</h2>
          <p className="mt-2">
            Wenn du uns per E-Mail kontaktierst, verarbeiten wir die von dir übermittelten Daten (E-Mail-Adresse,
            Inhalt) zur Bearbeitung deiner Anfrage auf Grundlage von Art. 6 Abs. 1 lit. f bzw. lit. b DSGVO. Die Daten
            werden gelöscht, sobald sie nicht mehr erforderlich sind und keine gesetzlichen Aufbewahrungspflichten
            entgegenstehen.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">7. Deine Rechte</h2>
          <p className="mt-2">
            Du hast jederzeit das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17),
            Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) sowie Widerspruch (Art. 21
            DSGVO). Wende dich hierzu an die oben genannte Kontaktadresse.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">8. Beschwerderecht</h2>
          <p className="mt-2">
            Dir steht ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde zu. Zuständig ist u.&nbsp;a. Der
            Hessische Beauftragte für Datenschutz und Informationsfreiheit, Postfach 3163, 65021 Wiesbaden.
          </p>
        </section>

        <p className="border-t border-white/10 pt-6 text-sm text-zinc-500">
          Siehe auch unser{' '}
          <Link href="/impressum" className="text-accent hover:underline">
            Impressum
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
