import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { pageMeta } from '@/lib/seo'
import { SITE_NAME } from '@/lib/site'
import { ConsentSettingsLink } from '@/components/ConsentSettingsLink'

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
            <a href="mailto:info@otakupulse.de" className="text-accent hover:underline">
              info@otakupulse.de
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
          <h2 className="text-lg font-bold text-white">3. Cookies &amp; Einwilligung</h2>
          <p className="mt-2">
            Technisch notwendige Cookies/Speicherzugriffe sind für den Betrieb der Website erforderlich und werden ohne
            gesonderte Einwilligung verwendet (Rechtsgrundlage § 25 Abs. 2 TDDDG, Art. 6 Abs. 1 lit. f DSGVO). Deine
            Cookie-Auswahl selbst speichern wir lokal in deinem Browser (localStorage), nicht in einem Cookie.
          </p>
          <p className="mt-2">
            Optionale Dienste – insbesondere die Reichweitenmessung (Kategorie „Statistik") sowie Werbung und
            Drittanbieter-Inhalte (Kategorie „Marketing") – werden ausschließlich nach deiner ausdrücklichen
            Einwilligung geladen (Opt-in, Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG). Ohne Einwilligung werden
            diese Dienste nicht aktiviert. Du kannst deine Auswahl jederzeit ändern oder widerrufen:{' '}
            <ConsentSettingsLink className="font-medium text-accent underline-offset-2 hover:underline" />.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">4. Reichweitenmessung (Kategorie „Statistik")</h2>
          <p className="mt-2">
            Soweit aktiviert und von dir eingewilligt, nutzen wir eine datenschutzfreundliche, cookielose
            Reichweitenmessung (Plausible bzw. Umami). Dabei werden keine personenbezogenen Profile gebildet;
            IP-Adressen werden nicht dauerhaft gespeichert. Erhoben werden lediglich aggregierte Statistiken
            (z.&nbsp;B. Seitenaufrufe, Referrer, ungefähre Herkunftsregion). Das Skript wird erst nach deiner
            Einwilligung in die Kategorie „Statistik" geladen (Art. 6 Abs. 1 lit. a DSGVO); ohne Einwilligung findet
            keine Messung statt.
          </p>
          <p className="mt-2">
            Zusätzlich setzen wir – ebenfalls nur nach deiner Einwilligung in die Kategorie „Statistik" – <strong>Google
            Analytics 4</strong> ein, einen Dienst der Google Ireland Limited (Gordon House, Barrow Street, Dublin 4,
            Irland; Mutterkonzern Google LLC, USA). Google Analytics verwendet Cookies bzw. vergleichbare Technologien und
            verarbeitet u.&nbsp;a. gekürzte IP-Adresse (IP-Anonymisierung aktiv), Geräte-/Browser-Informationen,
            aufgerufene Seiten und Interaktionen, um die Nutzung der Website auszuwerten. Rechtsgrundlage ist deine
            Einwilligung (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG). Das Tracking-Skript wird erst nach deiner
            Zustimmung geladen; ohne Einwilligung findet keine Erhebung statt.
          </p>
          <p className="mt-2">
            Dabei kann es zu einer Übermittlung von Daten an Server von Google in die USA kommen. Google ist unter dem
            <strong> EU-US Data Privacy Framework</strong> zertifiziert; ergänzend bestehen Standardvertragsklauseln. Du
            kannst deine Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen, indem du deine{' '}
            <ConsentSettingsLink className="font-medium text-accent underline-offset-2 hover:underline" /> anpasst.
            Weitere Informationen findest du in der{' '}
            <a
              href="https://policies.google.com/privacy"
              rel="nofollow noopener noreferrer"
              target="_blank"
              className="text-accent hover:underline"
            >
              Datenschutzerklärung von Google
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">5. Werbung</h2>
          <p className="mt-2">
            Diese Website finanziert sich anteilig über Werbung. Dazu setzen wir – ausschließlich nach deiner
            Einwilligung – <strong>Google AdSense</strong> ein, einen Dienst der Google Ireland Limited (Gordon House,
            Barrow Street, Dublin 4, Irland; Mutterkonzern Google LLC, USA).
          </p>
          <p className="mt-2">
            Die Einwilligung für Werbung holen wir über ein von Google zertifiziertes{' '}
            <strong>Consent-Management-Tool (CMP)</strong> nach dem IAB-Transparency-&amp;-Consent-Framework (TCF
            v2.2) ein. Es erscheint beim ersten Besuch als eigenes Fenster und lässt dich zwischen personalisierter
            Werbung, nicht personalisierter Werbung und Ablehnung wählen. Erst wenn dort eine Einwilligung vorliegt,
            wird das Anzeigen-Skript überhaupt geladen; ohne Einwilligung werden keine Anzeigen ausgeliefert und keine
            Werbe-Cookies gesetzt. Deine Auswahl kannst du jederzeit über{' '}
            <strong>„Cookie-Einstellungen“</strong> im Seitenfuß ändern.
          </p>
          <p className="mt-2">
            Auf Seiten mit nicht jugendfreien oder freizügigen Themen (z. B. das Genre „Ecchi“) blenden wir
            grundsätzlich keine Werbung ein.
          </p>
          <p className="mt-2">
            AdSense verwendet Cookies bzw. vergleichbare Technologien, um Anzeigen auszuliefern, deren Auslieferung zu
            messen und Missbrauch zu erkennen. Dabei werden unter anderem deine gekürzte IP-Adresse, Angaben zu
            Browser und Endgerät sowie die aufgerufenen Seiten verarbeitet; es kann zu einer Übermittlung an Server
            von Google in die USA kommen. Google ist unter dem <strong>EU-US Data Privacy Framework</strong>
            {' '}zertifiziert; ergänzend bestehen Standardvertragsklauseln. Rechtsgrundlage ist deine Einwilligung
            nach Art. 6 Abs. 1 lit. a DSGVO i.&nbsp;V.&nbsp;m. § 25 Abs. 1 TDDDG.
          </p>
          <p className="mt-2">
            Ohne deine Einwilligung werden weder das Anzeigen-Skript geladen noch Werbe-Cookies gesetzt. Du kannst
            deine Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen, indem du deine{' '}
            <ConsentSettingsLink className="font-medium text-accent underline-offset-2 hover:underline" /> anpasst.
            Einstellungen zu personalisierter Werbung kannst du zusätzlich direkt bei Google unter{' '}
            <a
              href="https://adssettings.google.com/"
              rel="nofollow noopener noreferrer"
              target="_blank"
              className="text-accent hover:underline"
            >
              adssettings.google.com
            </a>{' '}
            vornehmen. Weitere Informationen findest du in der{' '}
            <a
              href="https://policies.google.com/technologies/ads"
              rel="nofollow noopener noreferrer"
              target="_blank"
              className="text-accent hover:underline"
            >
              Google-Information zu Werbung
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">6. Externe Inhalte (Bilder &amp; Verlinkungen)</h2>
          <p className="mt-2">
            Inhalte wie Cover und Bildmaterial können von externen Quellen (u.&nbsp;a. der AniList-CDN) stammen. Beim
            Laden solcher Inhalte kann deine IP-Adresse an den jeweiligen Anbieter übertragen werden. Zudem verlinken
            wir auf externe Websites (z.&nbsp;B. Streaming-Anbieter); für deren Datenverarbeitung sind ausschließlich
            die jeweiligen Betreiber verantwortlich.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">7. Kontaktaufnahme</h2>
          <p className="mt-2">
            Wenn du uns per E-Mail kontaktierst, verarbeiten wir die von dir übermittelten Daten (E-Mail-Adresse,
            Inhalt) zur Bearbeitung deiner Anfrage auf Grundlage von Art. 6 Abs. 1 lit. f bzw. lit. b DSGVO. Die Daten
            werden gelöscht, sobald sie nicht mehr erforderlich sind und keine gesetzlichen Aufbewahrungspflichten
            entgegenstehen.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">8. Deine Rechte</h2>
          <p className="mt-2">
            Du hast jederzeit das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17),
            Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) sowie Widerspruch (Art. 21
            DSGVO). Wende dich hierzu an die oben genannte Kontaktadresse.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">9. Beschwerderecht</h2>
          <p className="mt-2">
            Dir steht ein Beschwerderecht bei einer Datenschutz-Aufsichtsbehörde zu. Zuständig ist u.&nbsp;a. Der
            Hessische Beauftragte für Datenschutz und Informationsfreiheit, Postfach 3163, 65021 Wiesbaden.
          </p>
        </section>

        <p className="border-t border-white/10 pt-6 text-sm text-zinc-500">
          Siehe auch unser{' '}
          <Link href="/impressum" className="text-accent hover:underline">
            Impressum
          </Link>{' '}
          und unsere{' '}
          <Link href="/nutzungsbedingungen" className="text-accent hover:underline">
            Nutzungsbedingungen
          </Link>
          .
        </p>
      </div>
    </main>
  )
}
