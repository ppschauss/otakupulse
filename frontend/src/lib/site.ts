// Zentrale Seiten-Konstanten. Öffentliche URL via Env überschreibbar.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001').replace(/\/$/, '')
export const SITE_NAME = 'OtakuPulse'
// Community-Discord (Einladungslink). Zentral, damit Header/Footer/Homepage dieselbe URL nutzen.
export const DISCORD_INVITE = 'https://discord.gg/UwX9akYq5F'
// Telegram-News-Kanal (öffentlich). Broadcast: neue Artikel + Anime-Ankündigungen.
export const TELEGRAM_CHANNEL = 'https://t.me/otakupulse_de'
// X / Twitter-Profil.
export const X_URL = 'https://x.com/OtakuPulseDE'
// Google AdSense: Publisher-ID für das Verifizierungs-Meta-Tag im <head>.
// Leer lassen (oder Env auf '' setzen) blendet das Tag aus.
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? 'ca-pub-5566154579483105'

/**
 * Anzeigenblock-IDs aus dem AdSense-Konto („Anzeigen → Nach Anzeigenblock").
 * Eine Quelle für alle Platzierungen; einzeln per Env überschreibbar, damit die
 * Staging-Umgebung auf Testblöcke zeigen kann, ohne den Code zu ändern.
 *
 *  banner     — responsives Display (data-ad-format="auto")
 *  inArticle  — natives In-Article (fluid), gehört zwischen Fließtext
 *  multiplex  — „Verwandte Inhalte" (autorelaxed), gehört ans Seitenende
 */
export const ADSENSE_SLOTS = {
  banner: process.env.NEXT_PUBLIC_ADSENSE_SLOT_BANNER ?? '5322153949',
  inArticle: process.env.NEXT_PUBLIC_ADSENSE_SLOT_IN_ARTICLE ?? '4484634861',
  multiplex: process.env.NEXT_PUBLIC_ADSENSE_SLOT_MULTIPLEX ?? '1858471525',
} as const

export const SITE_DESCRIPTION =
  'Die deutschsprachige Anime-Datenbank: Anime, Charaktere, Synchronsprecher, Studios, Genres, Seasons, Kalender und News — alles verlinkt und durchsuchbar.'

export const url = (path = '') => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
