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

export const SITE_DESCRIPTION =
  'Die deutschsprachige Anime-Datenbank: Anime, Charaktere, Synchronsprecher, Studios, Genres, Seasons, Kalender und News — alles verlinkt und durchsuchbar.'

export const url = (path = '') => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
