/**
 * Vertrauensstufen für Streaming-Angebote.
 *
 *  - `confirmed`   — belegt (Anbieter-Katalog oder JustWatch nennt genau diese Staffel).
 *  - `unconfirmed` — aus dem Serien-Angebot geerbt, die Staffel selbst ist nicht belegt.
 *  - `rejected`    — von Hand verworfen; wird nirgends angezeigt und nicht wieder angelegt.
 *
 * Der Bestand (Angebotszeilen vor Einführung des Felds) hat keine `confidence`.
 * Diese Zeilen gelten bewusst als belegt, sonst verlöre die halbe Seite ihre Anbieter.
 */

export type Confidence = 'confirmed' | 'unconfirmed' | 'rejected'

export type OfferSource = 'justwatch' | 'crunchyroll' | 'adn' | 'manual'

/** Text, den „Wo streamen?"-Box und News für unbestätigte Angebote verwenden. */
export const UNCONFIRMED_LABEL = 'Staffel nicht bestätigt'

type WithConfidence = { confidence?: Confidence | null }

/** Belegt — oder Altbestand ohne `confidence` (NULL/fehlend gilt als belegt). */
export const isConfirmed = (o: WithConfidence): boolean => o.confidence == null || o.confidence === 'confirmed'

/** Nur aus dem Serien-Angebot geerbt; `rejected` zählt hier nicht dazu. */
export const isUnconfirmed = (o: WithConfidence): boolean => o.confidence === 'unconfirmed'
