import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Faq } from '@/components/Faq'
import { PageSeoFooter } from '@/components/SeoFooter'
import { pageMetaFor } from '@/lib/pageContent'
import { TELEGRAM_CHANNEL, SITE_NAME } from '@/lib/site'

// Statische Landingpage (kein Live-Datenbezug) → großzügiges ISR.
export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  return pageMetaFor('anime-telegram', {
    title: 'Anime Telegram Kanal Deutsch — Anime-News auf Telegram | OtakuPulse',
    description:
      'Du suchst einen deutschen Anime Telegram Kanal? Abonniere OtakuPulse auf Telegram: neue Anime-Ankündigungen, Simulcast-Releases und News direkt aufs Handy — kostenlos, werbefrei, ohne Algorithmus.',
    path: '/anime-telegram-kanal',
  })
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
    </svg>
  )
}

function JoinButton({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const cls = size === 'lg' ? 'gap-3 px-7 py-3.5 text-base' : 'gap-2 px-5 py-2.5 text-sm'
  return (
    <a
      href={TELEGRAM_CHANNEL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center rounded-xl bg-[#229ED9] font-bold text-white shadow-lg shadow-[#229ED9]/20 transition hover:bg-[#1b86ba] ${cls}`}
    >
      <TelegramIcon className={size === 'lg' ? 'h-6 w-6 fill-current' : 'h-4 w-4 fill-current'} />
      Telegram-Kanal abonnieren
    </a>
  )
}

const FEATURES: { icon: string; title: string; text: string }[] = [
  {
    icon: '🆕',
    title: 'Neue Anime-Ankündigungen',
    text: 'Sobald ein neuer Titel oder eine neue Staffel angekündigt wird, landet die Meldung direkt im Kanal.',
  },
  {
    icon: '📅',
    title: 'Simulcast-Releases',
    text: 'Welche Episode läuft heute an? Wir posten die frischen Simulcast-Drops der laufenden Season.',
  },
  {
    icon: '📰',
    title: 'News zuerst',
    text: 'Trailer, Release-Termine, Studio-Neuigkeiten — die wichtigsten Anime-News kompakt und auf Deutsch.',
  },
  {
    icon: '📲',
    title: 'Direkt aufs Handy',
    text: 'Kein Feed-Reader, kein Umweg. Die Updates kommen als Push-Nachricht in deinen Telegram-Chat.',
  },
  {
    icon: '🚫',
    title: 'Werbefrei & ohne Algorithmus',
    text: 'Reine Chronologie, keine Werbung, kein „Engagement"-Sortieren. Du verpasst nichts.',
  },
  {
    icon: '🆓',
    title: 'Kostenlos & jederzeit kündbar',
    text: 'Ein Tipp auf „Abonnieren" genügt — und wenn’s dir zu viel wird, bist du genauso schnell wieder raus.',
  },
]

const FAQ_ITEMS = [
  {
    q: 'Gibt es einen deutschen Anime Telegram Kanal?',
    a: `Ja — OtakuPulse betreibt einen deutschsprachigen Anime-News-Kanal auf Telegram. Dort posten wir neue Anime-Ankündigungen, Simulcast-Releases und News auf Deutsch.`,
  },
  {
    q: 'Was wird im Telegram-Kanal gepostet?',
    a: 'Neue Anime-Ankündigungen und Staffel-News, Simulcast-Episoden der aktuellen Season, Trailer und Release-Termine sowie ausgewählte Beiträge von OtakuPulse — alles mit Link zur passenden Detailseite.',
  },
  {
    q: 'Kostet der Telegram-Kanal etwas?',
    a: 'Nein, der Kanal ist kostenlos und werbefrei. OtakuPulse ist ein privates Projekt ohne Paywall; die Website selbst finanziert sich anteilig über Werbung.',
  },
  {
    q: 'Wie abonniere ich den Anime-Telegram-Kanal?',
    a: 'Auf „Telegram-Kanal abonnieren" tippen — Telegram öffnet sich und du klickst auf „Beitreten". Du brauchst nur die (kostenlose) Telegram-App oder den Web-Client.',
  },
  {
    q: 'Kann ich im Kanal mitschreiben?',
    a: 'Der Telegram-Kanal ist ein News-Broadcast (einseitig). Wenn du dich mit anderen Fans austauschen möchtest, komm in unseren Discord-Server — dort wird diskutiert, empfohlen und gemeinsam geschaut.',
  },
]

export default function AnimeTelegramKanalPage() {
  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-10">
        <Breadcrumbs
          items={[
            { name: 'Start', path: '/' },
            { name: 'Anime Telegram Kanal', path: '/anime-telegram-kanal' },
          ]}
        />

        {/* Hero */}
        <section className="mt-4 rounded-2xl border border-[#229ED9]/30 bg-gradient-to-br from-[#229ED9]/15 via-zinc-900/40 to-zinc-950 p-8 sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#7fd0f0]">Deutscher Anime-Telegram-Kanal</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
            Anime-News auf Telegram — abonniere den OtakuPulse-Kanal
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-200">
            Du suchst einen <strong className="text-white">deutschen Anime Telegram Kanal</strong>, der dich auf dem
            Laufenden hält? Bei OtakuPulse bekommst du neue Anime-Ankündigungen, Simulcast-Releases und die wichtigsten
            News direkt aufs Handy — kostenlos, werbefrei und ohne nervigen Algorithmus.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <JoinButton size="lg" />
            <span className="text-sm text-zinc-400">Kostenlos · werbefrei · jederzeit kündbar</span>
          </div>
        </section>

        {/* Was dich erwartet */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-white">Das bekommst du im Anime-Telegram-Kanal</h2>
          <p className="mt-2 max-w-2xl text-zinc-400">
            Ein guter Anime-News-Kanal liefert das Wichtige sofort — ohne dass du irgendwo nachschauen musst.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-white/10 bg-zinc-900/40 p-5">
                <div className="text-2xl">{f.icon}</div>
                <h3 className="mt-2 font-semibold text-white">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Für wen + interne Verlinkung */}
        <section className="mt-12 max-w-2xl">
          <h2 className="text-2xl font-bold text-white">Für wen ist der Telegram-Kanal?</h2>
          <p className="mt-3 leading-relaxed text-zinc-300">
            Für alle, die <strong className="text-white">keine Anime-News verpassen</strong> wollen, ohne ständig selbst
            nachzuschauen. Du kannst die Updates im Kanal lesen und parallel auf OtakuPulse den{' '}
            <Link href="/kalender" className="text-accent hover:underline">Simulcast-Kalender</Link> checken, die{' '}
            <Link href="/season" className="text-accent hover:underline">aktuelle Anime-Season</Link> durchstöbern, nach{' '}
            <Link href="/genre" className="text-accent hover:underline">Genre</Link> oder{' '}
            <Link href="/plattform" className="text-accent hover:underline">Streaming-Anbieter</Link> filtern und alle{' '}
            <Link href="/news" className="text-accent hover:underline">Anime-News</Link> im Detail nachlesen. Lieber
            quatschen statt nur lesen? Dann komm in unseren{' '}
            <Link href="/anime-discord-server" className="text-accent hover:underline">deutschen Anime-Discord-Server</Link>.
          </p>
        </section>

        {/* Mid-page CTA */}
        <section className="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-zinc-900/40 px-6 py-10 text-center">
          <h2 className="text-2xl font-bold text-white">Nichts mehr verpassen?</h2>
          <p className="max-w-xl text-zinc-400">
            Ein Tipp und die neuesten Anime-News kommen direkt zu dir. 🌸
          </p>
          <JoinButton size="lg" />
        </section>

        <Faq items={FAQ_ITEMS} title="Häufige Fragen zum Anime-Telegram-Kanal" />

        {/* SEO-Closing */}
        <section className="mt-12 max-w-2xl text-sm leading-relaxed text-zinc-400">
          <h2 className="text-lg font-bold text-white">Über OtakuPulse auf Telegram</h2>
          <p className="mt-3">
            {SITE_NAME} ist die deutschsprachige Anime-Datenbank — und der Telegram-Kanal ist die schnellste Art, mit
            neuen <strong className="text-zinc-200">Anime-News</strong> und Ankündigungen versorgt zu werden. Wenn du
            also einen <strong className="text-zinc-200">deutschen Anime Telegram Channel</strong> gesucht hast, der dir
            Simulcast-Releases und frische Meldungen direkt aufs Handy schickt, abonniere uns und bleib am Puls des
            Anime-Geschehens.
          </p>
        </section>
      </main>
      <PageSeoFooter pageKey="anime-telegram" maxW="max-w-4xl" />
    </>
  )
}
