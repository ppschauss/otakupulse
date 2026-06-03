// Zentrale Seiten-Konstanten. Öffentliche URL via Env überschreibbar.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001').replace(/\/$/, '')
export const SITE_NAME = 'OtakuPulse'
export const SITE_DESCRIPTION =
  'Die deutschsprachige Anime-Datenbank: Anime, Charaktere, Synchronsprecher, Studios, Genres, Seasons, Kalender und News — alles verlinkt und durchsuchbar.'

export const url = (path = '') => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
