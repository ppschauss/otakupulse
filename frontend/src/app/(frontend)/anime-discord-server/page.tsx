import type { Metadata } from 'next'
import Link from 'next/link'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Faq } from '@/components/Faq'
import { PageSeoFooter } from '@/components/SeoFooter'
import { pageMetaFor } from '@/lib/pageContent'
import { DISCORD_INVITE, SITE_NAME } from '@/lib/site'

// Statische Landingpage (kein Live-Datenbezug) → großzügiges ISR.
export const revalidate = 3600

export async function generateMetadata(): Promise<Metadata> {
  return pageMetaFor('anime-discord', {
    title: 'Anime Discord Server Deutsch — Deutscher Anime-Discord beitreten | OtakuPulse',
    description:
      'Du suchst einen deutschen Anime Discord Server? Tritt der OtakuPulse-Community bei: Simulcast-Talk, Season-Vorschau, Empfehlungen & Memes — auf Deutsch, kostenlos und ohne Gatekeeping.',
    path: '/anime-discord-server',
  })
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 127.14 96.36" aria-hidden="true" className={className}>
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z" />
    </svg>
  )
}

function JoinButton({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const cls =
    size === 'lg'
      ? 'gap-3 px-7 py-3.5 text-base'
      : 'gap-2 px-5 py-2.5 text-sm'
  return (
    <a
      href={DISCORD_INVITE}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center rounded-xl bg-[#5865F2] font-bold text-white shadow-lg shadow-[#5865F2]/20 transition hover:bg-[#4752c4] ${cls}`}
    >
      <DiscordIcon className={size === 'lg' ? 'h-6 w-6 fill-current' : 'h-4 w-4 fill-current'} />
      Discord-Server beitreten
    </a>
  )
}

const FEATURES: { icon: string; title: string; text: string }[] = [
  {
    icon: '📅',
    title: 'Simulcast in Echtzeit',
    text: 'Frische Episode gedroppt? Wir reagieren live mit — spoilerfreie Channels für alle, die noch nachholen.',
  },
  {
    icon: '🌸',
    title: 'Season-Vorschau & Hype',
    text: 'Welche Titel lohnen sich nächste Season? Gemeinsame Watchlists, Trailer-Talk und ehrliche Ersteindrücke.',
  },
  {
    icon: '💬',
    title: 'Empfehlungen ohne Gatekeeping',
    text: 'Egal ob erster Isekai oder seit Jahren dabei — frag einfach, die Community hat für jeden Geschmack einen Tipp.',
  },
  {
    icon: '🎭',
    title: 'Genres, Studios & Charaktere',
    text: 'Von Shounen-Klassikern über Slice-of-Life bis Seinen — Räume für deine Lieblingsnische und Deep-Dives.',
  },
  {
    icon: '😂',
    title: 'Memes & Community-Events',
    text: 'Shitposting erlaubt. Dazu Watch-Partys, Quiz-Runden und Voice-Hangouts mit anderen deutschen Anime-Fans.',
  },
  {
    icon: '🔔',
    title: 'News zuerst',
    text: 'Ankündigungen, Trailer und Release-Termine landen direkt im Server — verpass keinen Drop mehr.',
  },
]

const FAQ_ITEMS = [
  {
    q: 'Gibt es einen deutschen Anime Discord Server?',
    a: `Ja — der OtakuPulse-Discord ist ein deutschsprachiger Anime-Server für Fans aus Deutschland, Österreich und der Schweiz. Die Umgangssprache ist Deutsch, alle sind willkommen, vom Einsteiger bis zum Veteranen.`,
  },
  {
    q: 'Ist der Anime-Discord kostenlos?',
    a: 'Komplett kostenlos. OtakuPulse ist ein privates Projekt — der Beitritt zum Discord-Server kostet nichts und es gibt keine Paywall.',
  },
  {
    q: 'Worüber wird auf dem Server gesprochen?',
    a: 'Aktuelle Simulcast-Episoden, Season-Empfehlungen, Lieblings-Studios und -Charaktere, Streaming-Tipps (Crunchyroll, Netflix & Co.), News, Memes und gemeinsame Watch-Partys. Es gibt spoilerfreie Bereiche, damit niemand etwas vorweggenommen bekommt.',
  },
  {
    q: 'Wie trete ich dem deutschen Anime-Discord bei?',
    a: 'Einfach auf „Discord-Server beitreten" klicken — du brauchst nur einen (kostenlosen) Discord-Account. Danach kurz die Regeln bestätigen und du bist drin.',
  },
  {
    q: 'Brauche ich Vorwissen über Anime?',
    a: 'Nein. Egal ob du gerade deinen ersten Anime entdeckst oder seit Jahren jede Season verschlingst — die Community ist anfängerfreundlich und hilft gern bei Einstieg und Empfehlungen.',
  },
]

export default function AnimeDiscordServerPage() {
  return (
    <>
      <main className="mx-auto max-w-4xl px-4 py-10">
        <Breadcrumbs
          items={[
            { name: 'Start', path: '/' },
            { name: 'Anime Discord Server', path: '/anime-discord-server' },
          ]}
        />

        {/* Hero */}
        <section className="mt-4 rounded-2xl border border-[#5865F2]/30 bg-gradient-to-br from-[#5865F2]/15 via-zinc-900/40 to-zinc-950 p-8 sm:p-10">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#aab1ff]">Deutscher Anime-Discord</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight text-white sm:text-4xl">
            Anime Discord Server (Deutsch) — tritt der OtakuPulse-Community bei
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-zinc-200">
            Du suchst einen <strong className="text-white">deutschen Anime Discord Server</strong>, auf dem wirklich was
            los ist? Bei OtakuPulse triffst du auf eine aktive, deutschsprachige Anime-Community: Simulcast-Talk in
            Echtzeit, ehrliche Empfehlungen, Season-Hype, Memes und Watch-Partys — auf Deutsch, kostenlos und ohne
            Gatekeeping.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <JoinButton size="lg" />
            <span className="text-sm text-zinc-400">Kostenlos · DE/AT/CH · anfängerfreundlich</span>
          </div>
        </section>

        {/* Was dich erwartet */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-white">Das erwartet dich auf unserem Anime-Discord</h2>
          <p className="mt-2 max-w-2xl text-zinc-400">
            Ein deutschsprachiger Anime Discord lebt von den Leuten — und davon, dass für jede Stimmung der richtige
            Channel da ist.
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
          <h2 className="text-2xl font-bold text-white">Für wen ist der deutsche Anime-Discord?</h2>
          <p className="mt-3 leading-relaxed text-zinc-300">
            Für alle, die Anime auf <strong className="text-white">Deutsch</strong> feiern wollen: Simulcast-Jäger,
            Season-Planer, Empfehlungs-Sucher und alle, die einfach über ihre Lieblingsserien quatschen möchten. Während
            du auf dem Server unterwegs bist, kannst du auf OtakuPulse parallel den{' '}
            <Link href="/kalender" className="text-accent hover:underline">Simulcast-Kalender</Link> checken, die{' '}
            <Link href="/season" className="text-accent hover:underline">aktuelle Anime-Season</Link> durchstöbern, nach{' '}
            <Link href="/genre" className="text-accent hover:underline">Genre</Link> oder{' '}
            <Link href="/plattform" className="text-accent hover:underline">Streaming-Anbieter</Link> filtern und die
            neuesten <Link href="/news" className="text-accent hover:underline">Anime-News</Link> lesen. Lieber nur News
            ohne Chat? Dann abonniere unseren{' '}
            <Link href="/anime-telegram-kanal" className="text-accent hover:underline">deutschen Anime-Telegram-Kanal</Link>.
          </p>
        </section>

        {/* Mid-page CTA */}
        <section className="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-zinc-900/40 px-6 py-10 text-center">
          <h2 className="text-2xl font-bold text-white">Bereit für die Community?</h2>
          <p className="max-w-xl text-zinc-400">
            Einmal klicken, Discord-Account verbinden, fertig. Wir freuen uns auf dich. 🌸
          </p>
          <JoinButton size="lg" />
        </section>

        <Faq items={FAQ_ITEMS} title="Häufige Fragen zum Anime Discord Server" />

        {/* SEO-Closing */}
        <section className="mt-12 max-w-2xl text-sm leading-relaxed text-zinc-400">
          <h2 className="text-lg font-bold text-white">Über die OtakuPulse-Community</h2>
          <p className="mt-3">
            {SITE_NAME} ist die deutschsprachige Anime-Datenbank — und der dazugehörige Discord-Server ist der Treffpunkt
            für die Community. Wenn du also einen <strong className="text-zinc-200">deutschen Anime Discord</strong>{' '}
            gesucht hast, auf dem über aktuelle Episoden, kommende Seasons und zeitlose Klassiker geredet wird, bist du
            hier richtig. Komm vorbei, stell dich vor und werde Teil einer wachsenden Runde deutschsprachiger Anime-Fans.
          </p>
        </section>
      </main>
      <PageSeoFooter pageKey="anime-discord" maxW="max-w-4xl" />
    </>
  )
}
