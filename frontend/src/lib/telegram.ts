/**
 * Telegram-Versand für Artikel — geteilt von `telegram-notify.ts` (Cron) und dem
 * Admin-Hook (Checkbox „Jetzt auf Telegram posten"). Liest Token/Channel aus der
 * Umgebung (secrets.env). Dedup läuft über das DB-Feld `telegramPostedAt`.
 */
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.otakupulse.de').replace(/\/$/, '')

export function telegramConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHANNEL_ID)
}

const api = (m: string) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${m}`

function esc(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function absUrl(u?: string | null): string | undefined {
  if (!u) return undefined
  if (/^https?:\/\//.test(u)) return u
  return `${SITE}${u.startsWith('/') ? '' : '/'}${u}`
}

export function articleCaption(a: any): string {
  const url = `${SITE}/news/${a.slug}`
  const head = a.category === 'news' ? '🆕 <b>Neu auf OtakuPulse</b>' : '📝 <b>OtakuPulse</b>'
  const parts = [head, '', `<b>${esc(a.title)}</b>`]
  if (a.excerpt) parts.push('', esc(a.excerpt))
  parts.push('', `👉 <a href="${url}">Zum Beitrag</a>`)
  return parts.join('\n').slice(0, 1000)
}

async function tg(method: string, body: any): Promise<{ ok: boolean; desc?: string }> {
  const res = await fetch(api(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j: any = await res.json().catch(() => ({}))
  return { ok: !!j.ok, desc: j.description }
}

/** Postet einen Artikel in den Channel (Foto+Caption, Fallback Textnachricht). */
export async function sendArticleToTelegram(a: any): Promise<{ ok: boolean; error?: string }> {
  if (!telegramConfigured()) return { ok: false, error: 'TELEGRAM_BOT_TOKEN/CHANNEL_ID fehlt' }
  const chat_id = process.env.TELEGRAM_CHANNEL_ID
  const cap = articleCaption(a)
  const photo = absUrl(a.coverImageUrl)
  if (photo) {
    const r = await tg('sendPhoto', { chat_id, photo, caption: cap, parse_mode: 'HTML' })
    if (r.ok) return { ok: true }
    // Bild zu groß/ungültig → Fallback Text
  }
  const r = await tg('sendMessage', { chat_id, text: cap, parse_mode: 'HTML', disable_web_page_preview: false })
  return r.ok ? { ok: true } : { ok: false, error: r.desc }
}
