// Lädt das Global "settings" (Jugendschutz & Allgemein). Pro Request gecached.
import { cache } from 'react'
import { getPayload } from 'payload'
import config from '@payload-config'

/**
 * Sollen Cover der Genre „Hentai" unkenntlich gemacht werden (Blur + FSK-18-Siegel)?
 * Default `true` (Schutz an), auch wenn das Global noch nicht gepflegt ist oder ein
 * Fehler auftritt — im Zweifel lieber blurren als ungewollt zeigen.
 */
export const getBlurAdult = cache(async (): Promise<boolean> => {
  try {
    const payload = await getPayload({ config })
    const g: any = await payload.findGlobal({ slug: 'settings' })
    return g?.blurAdultCovers !== false
  } catch {
    return true
  }
})
