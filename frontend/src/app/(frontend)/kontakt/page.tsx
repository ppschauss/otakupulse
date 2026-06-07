import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { pageMeta } from '@/lib/seo'
import { SITE_NAME } from '@/lib/site'
import { ContactForm } from './ContactForm'

export const dynamic = 'force-static'

export const metadata: Metadata = pageMeta({
  title: `Kontakt | ${SITE_NAME}`,
  description: `Feedback, Fehlermeldungen, Datenkorrekturen, Kooperations- und Rechtsanfragen an ${SITE_NAME} — schnell über das Kontaktformular.`,
  path: '/kontakt',
})

export default function KontaktPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Breadcrumbs items={[{ name: 'Start', path: '/' }, { name: 'Kontakt', path: '/kontakt' }]} />
      <h1 className="text-3xl font-extrabold text-white">Kontakt</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-zinc-300">
        Feedback, ein Fehler entdeckt, falsche Anime-Daten, eine Kooperationsidee oder eine rechtliche Anfrage?
        Schreib uns über das Formular — wir freuen uns über jede Nachricht.
      </p>

      <ContactForm />

      <p className="mt-8 border-t border-white/10 pt-6 text-sm text-zinc-500">
        Lieber klassisch per E-Mail? Schreib an{' '}
        <a href="mailto:info@otakupulse.de" className="text-accent hover:underline">info@otakupulse.de</a>.
        Bei urheberrechtlichen Hinweisen siehe auch unser{' '}
        <a href="/impressum" className="text-accent hover:underline">Impressum</a>.
      </p>
    </main>
  )
}
