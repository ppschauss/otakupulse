'use server'

import { getPayload } from 'payload'
import config from '@payload-config'
import { headers } from 'next/headers'

type ContactState = { ok?: boolean; error?: string }

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// --- Anti-Spam-Härtung (alles serverseitig, DSGVO-frei, kein Drittdienst) ---

// In-Memory-Rate-Limit pro IP. Der App-Container läuft als Single-Instance
// (`next start`), daher genügt ein prozesslokaler Zähler; bei Neustart wird er
// zurückgesetzt (unkritisch). Cloudflare reicht die echte Client-IP als
// `cf-connecting-ip` durch.
const RATE_MAX = 5 // max. Einsendungen …
const RATE_WINDOW_MS = 60 * 60 * 1000 // … pro Stunde je IP
const submissions = new Map<string, number[]>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (submissions.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  recent.push(now)
  submissions.set(ip, recent)
  // Gelegentliches Aufräumen, damit die Map nicht unbegrenzt wächst.
  if (submissions.size > 5000) {
    for (const [k, v] of submissions) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) submissions.delete(k)
    }
  }
  return recent.length > RATE_MAX
}

async function clientIp(): Promise<string> {
  const h = await headers()
  const cf = h.get('cf-connecting-ip')
  if (cf) return cf.trim()
  const xff = h.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return 'unknown'
}

// Link-Heuristik: klassischer Kontakt-Spam kippt mehrere URLs / BBCode-Links in
// die Nachricht. Menschen tun das praktisch nie (Datenkorrekturen mit 1–2
// Quell-Links bleiben erlaubt).
function looksLikeLinkSpam(message: string): boolean {
  const urls = (message.match(/https?:\/\/|www\.|\[url|<a\s+href/gi) ?? []).length
  return urls >= 4
}

export async function submitContact(_prev: ContactState, formData: FormData): Promise<ContactState> {
  // 1) Honeypot: echte Nutzer lassen dieses (versteckte) Feld leer; Bots füllen es.
  //    Still „ok" zurückmelden, damit der Bot sich für erfolgreich hält.
  if (String(formData.get('website') || '').trim()) return { ok: true }

  // 2) JS-Zeittrap: das Formular setzt per JS beim Absenden die verstrichene Zeit
  //    seit Mount (ms). Ist der Wert vorhanden UND unrealistisch klein (<2,5 s),
  //    war es ein Bot, der sofort abgeschickt hat. Fehlt der Wert (kein JS),
  //    lassen wir es durch (kein Hard-Drop echter No-JS-Nutzer) und verlassen uns
  //    auf Honeypot + Rate-Limit + Heuristik.
  const elapsed = Number(formData.get('_elapsed'))
  if (Number.isFinite(elapsed) && elapsed > 0 && elapsed < 2500) return { ok: true }

  // 3) Rate-Limit pro IP.
  if (isRateLimited(await clientIp())) {
    return { error: 'Zu viele Anfragen in kurzer Zeit. Bitte versuche es später erneut.' }
  }

  const name = String(formData.get('name') || '').trim().slice(0, 120)
  const email = String(formData.get('email') || '').trim().slice(0, 200)
  const subject = String(formData.get('subject') || '').trim().slice(0, 200)
  const category = String(formData.get('category') || 'feedback')
  const message = String(formData.get('message') || '').trim()

  if (!EMAIL_RE.test(email)) return { error: 'Bitte gib eine gültige E-Mail-Adresse an.' }
  if (message.length < 10) return { error: 'Deine Nachricht ist zu kurz (mindestens 10 Zeichen).' }
  if (message.length > 5000) return { error: 'Deine Nachricht ist zu lang (maximal 5000 Zeichen).' }

  // 4) Link-Spam still verwerfen (Bot hält es für erfolgreich).
  if (looksLikeLinkSpam(message)) return { ok: true }

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
