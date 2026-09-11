import type { ReactNode } from 'react'

/**
 * Rendert `**fett**`-Marker aus generierten Texten (lib/streamingText) als <strong>.
 * Bewusst minimal: nur Fettung, kein weiteres Markup — die Texte sind serverseitig
 * generiert, aber wir wollen trotzdem kein HTML aus Strings injizieren.
 */
export function RichLine({ text }: { text: string }): ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-zinc-100">
        {p}
      </strong>
    ) : (
      p
    ),
  )
}
