'use server'

import { getPayload } from 'payload'
import config from '@payload-config'

type ContactState = { ok?: boolean; error?: string }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export async function submitContact(_prev: ContactState, formData: FormData): Promise<ContactState> {
  // Honeypot: echte Nutzer lassen dieses (versteckte) Feld leer; Bots füllen es.
  if (String(formData.get('website') || '').trim()) return { ok: true }

  const name = String(formData.get('name') || '').trim().slice(0, 120)
  const email = String(formData.get('email') || '').trim().slice(0, 200)
  const subject = String(formData.get('subject') || '').trim().slice(0, 200)
  const category = String(formData.get('category') || 'feedback')
  const message = String(formData.get('message') || '').trim()

  if (!EMAIL_RE.test(email)) return { error: 'Bitte gib eine gültige E-Mail-Adresse an.' }
  if (message.length < 10) return { error: 'Deine Nachricht ist zu kurz (mindestens 10 Zeichen).' }
  if (message.length > 5000) return { error: 'Deine Nachricht ist zu lang (maximal 5000 Zeichen).' }

  try {
    const payload = await getPayload({ config })
    await payload.create({
      collection: 'contact-messages',
      data: { name: name || undefined, email, subject: subject || undefined, category, message } as any,
      overrideAccess: true, // create ist für die öffentliche API gesperrt → hier bewusst erlauben
    })
    return { ok: true }
  } catch {
    return { error: 'Senden fehlgeschlagen. Bitte versuche es später erneut oder schreib uns direkt per E-Mail.' }
  }
}
