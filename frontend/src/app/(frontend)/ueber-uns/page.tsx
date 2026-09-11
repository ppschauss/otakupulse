import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { JsonLd } from '@/components/JsonLd'
import { pageMeta } from '@/lib/seo'
import { DISCORD_INVITE, SITE_NAME, SITE_URL, TELEGRAM_CHANNEL, X_URL } from '@/lib/site'

export const dynamic = 'force-static'

export const metadata: Metadata = pageMeta({
  title: `Über ${SITE_NAME}: So prüfen wir, wer welchen Anime streamt`,
  description:
    'Wer hinter OtakuPulse steht, woher die Daten kommen und wie wir die Streaming-Verfügbarkeit (Anbieter, Ger Dub/Sub, Kosten, Ablaufdaten) für Deutschland prüfen und aktuell halten.',
  path: '/ueber-uns',
})

// E-E-A-T-Seite: Wer, Methodik, Quellen, Transparenz zu KI-Texten. Verlinkt aus Footer,
// Listen-Seiten („So entsteht diese Liste") und llms.txt.
export default function UeberUnsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'AboutPage',
          name: `Über ${SITE_NAME}`,
          url: `${SITE_URL}/ueber-uns`,
          mainEntity: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL, sameAs: [DISCORD_INVITE, X_URL, TELEGRAM_CHANNEL] },
        }}
      />
      <Breadcrumbs items={[{ name: 'Start', path: '/' }, { name: 'Über uns', path: '/ueber-uns' }]} />
      <h1 className="text-3xl font-extrabold text-white">Über {SITE_NAME}</h1>
      <p className="mt-3 leading-relaxed text-zinc-300">
        {SITE_NAME} ist eine deutschsprachige Anime-Datenbank mit einem klaren Schwerpunkt: <strong>Wer streamt welchen
        Anime in Deutschland</strong> – mit welcher Sprachfassung, im Abo oder kostenlos, und wie lange noch. Das Projekt
        ist privat und nicht-kommerziell und wird von Patrick Schauss aus Karben betrieben (siehe{' '}
        <Link href="/impressum" className="text-accent hover:underline">Impressum</Link>).
      </p>

      <div className="mt-8 space-y-8 leading-relaxed text-zinc-300">
        <section>
          <h2 className="text-lg font-bold text-white">So prüfen wir die Streaming-Verfügbarkeit</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <strong className="text-zinc-100">Quelle je Anbieter.</strong> Für jeden Titel gleichen wir die Kataloge der in
              Deutschland verfügbaren Dienste ab – Crunchyroll, Netflix, Amazon Prime Video, Disney+, Joyn, RTL+, WOW,
              Aniverse, ADN, Toggo und weitere. Ein Anbieter erscheint nur, wenn ein <strong className="text-zinc-100">direkter
              Link zum Titel</strong> existiert; Startseiten-Links oder bloße Vermutungen nehmen wir nicht auf.
            </li>
            <li>
              <strong className="text-zinc-100">Sprachfassung je Anbieter.</strong> Ob ein Titel mit deutscher Synchro (Ger
              Dub), deutschen Untertiteln (Ger Sub) oder nur im japanischen Original läuft, erfassen wir pro Dienst – nicht
              pauschal pro Anime. Ergänzend werten wir Crunchyrolls Sprachkatalog und die deutschsprachige Wikipedia aus.
            </li>
            <li>
              <strong className="text-zinc-100">Kosten.</strong> Wir unterscheiden Abo (Flatrate), werbefinanziert/kostenlos und
              Kauf/Leihe (z. B. Amazon Video, Apple TV). Kauf- und Leihangebote zählen nicht als „läuft bei“, werden aber
              genannt.
            </li>
            <li>
              <strong className="text-zinc-100">Staffeln, Folgen, Ablaufdatum.</strong> Wo der Anbieter es ausweist, zeigen
              wir, wie viele Staffeln und Folgen dort liegen und bis wann ein Titel verfügbar ist.
            </li>
            <li>
              <strong className="text-zinc-100">Aktualität.</strong> Der Katalog wird rollierend abgeglichen – jeder Titel
              regelmäßig neu, neue Titel täglich. Das Datum des letzten Abgleichs steht auf jeder Anime-Seite („Stand:“).
              Verschwindet ein Titel bei einem Anbieter, verschwindet er auch bei uns.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">Woher die übrigen Daten kommen</h2>
          <p className="mt-2">
            Stammdaten (Titel, Format, Studios, Genres, Charaktere, Staff, Episoden) stammen aus der offenen{' '}
            <a href="https://anilist.co" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">AniList</a>
            -Datenbank und werden nächtlich synchronisiert. Bewertungen sind Community-Scores von AniList (0–100 %).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">Transparenz zu Texten</h2>
          <p className="mt-2">
            Handlungsbeschreibungen und Nachrichtenartikel entstehen mit Unterstützung von KI auf Basis der Stammdaten und
            offizieller Ankündigungen; die Streaming-Angaben in den Guides und FAQs werden nicht „geschrieben“, sondern
            direkt aus unseren Verfügbarkeitsdaten erzeugt – jede Aussage dort hat einen Datensatz dahinter. Fehler? Schreib
            uns über die <Link href="/kontakt" className="text-accent hover:underline">Kontaktseite</Link>, wir korrigieren zeitnah.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">Was {SITE_NAME} nicht ist</h2>
          <p className="mt-2">
            Wir hosten keine Videos und verlinken ausschließlich auf legale Angebote der Anbieter. Welche Dienste wir
            nennen, entscheidet allein die Verfügbarkeit im Katalog – nicht, wer uns am besten gefällt.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-white">Community</h2>
          <p className="mt-2">
            Diskutiere mit auf unserem{' '}
            <a href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Discord</a>,
            folge uns auf{' '}
            <a href={X_URL} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">X</a> oder abonniere
            den{' '}
            <a href={TELEGRAM_CHANNEL} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Telegram-Kanal</a>{' '}
            für neue Simulcasts und Lizenz-News.
          </p>
        </section>
      </div>
    </main>
  )
}
