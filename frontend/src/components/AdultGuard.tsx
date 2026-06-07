// Async-Serverkomponente: rendert die Jugendschutz-Sperre NUR, wenn der Anime der
// Genre „Hentai" angehört (anime.isHentai) UND der Jugendschutz im Admin aktiv ist.
// Die eigentliche Anzeige/Freigabe übernimmt <AdultGate> client-seitig (Button +
// Altersabfrage, Merken via localStorage). Für Nicht-Hentai-Titel kehrt es sofort
// (ohne DB-Abfrage) mit null zurück.
import { getBlurAdult } from '@/lib/settings'
import { AdultGate } from './AdultGate'

export async function AdultGuard({
  anime,
  size = 'md',
  rounded = 'rounded-xl',
  interactive = false,
}: {
  anime: any
  size?: 'sm' | 'md'
  rounded?: string
  interactive?: boolean
}) {
  if (!anime?.isHentai) return null
  const blur = await getBlurAdult()
  if (!blur) return null
  return <AdultGate size={size} rounded={rounded} interactive={interactive} />
}
