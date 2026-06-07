import { stripHtml } from '@/lib/articleBody'

/**
 * Rendert Beschreibungs-/Bio-Texte SICHER: das (teils aus Drittquellen wie AniList
 * stammende) HTML wird zu reinem Text reduziert und von React escaped — damit ist
 * Stored-XSS via <img onerror>, <script>, javascript:-Links etc. ausgeschlossen.
 * Absätze (Leerzeile) und Zeilenumbrüche bleiben erhalten.
 */
export function DescriptionText({ raw, className }: { raw?: string | null; className?: string }) {
  const text = stripHtml(raw)
  if (!text) return null
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim())
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i} className={i ? 'mt-3' : ''}>
          {p.split('\n').map((line, j) => (
            <span key={j}>
              {j > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </p>
      ))}
    </div>
  )
}
