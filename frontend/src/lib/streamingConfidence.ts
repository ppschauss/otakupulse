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

/**
 * Zusatz hinter einem Titel im Artikeltext: leer für belegte Angebote (auch NULL),
 * sonst der Hinweis, dass die Staffel nicht bestätigt ist. Verworfene Angebote
 * gelangen nie in einen Artikel; sollte doch eines durchrutschen, kennzeichnet
 * die Funktion es nicht als belegt-unbestätigt, sondern bleibt leer.
 */
export const offerNote = (confidence: Confidence | null): string =>
  confidence === 'unconfirmed' ? ` (${UNCONFIRMED_LABEL})` : ''

type WithConfidence = { confidence?: Confidence | null }

/** Belegt — oder Altbestand ohne `confidence` (NULL/fehlend gilt als belegt). */
export const isConfirmed = (o: WithConfidence): boolean => o.confidence == null || o.confidence === 'confirmed'

/** Nur aus dem Serien-Angebot geerbt; `rejected` zählt hier nicht dazu. */
export const isUnconfirmed = (o: WithConfidence): boolean => o.confidence === 'unconfirmed'

/**
 * Anbieter-Slugs, die der Redakteur für diesen Titel per Veto verworfen hat
 * (`confidence: 'rejected'`). Gemeinsame Quelle für Anzeige und Indexregel, damit
 * der Slug-Index `streamingProviders` ein Veto nicht unterläuft. Tolerant gegenüber
 * Titeln, deren `streamingOffers` nicht geladen sind (dann: nichts verworfen).
 */
export function rejectedProviderSlugs(anime: any): Set<string> {
  const offers: any[] = Array.isArray(anime?.streamingOffers) ? anime.streamingOffers : []
  return new Set(offers.filter((o) => o?.confidence === 'rejected').map((o) => o?.provider))
}

/**
 * Anbieter-Slugs, deren Angebote für diesen Titel AUSSCHLIESSLICH unbestätigt sind
 * (vom Serien-Angebot geerbt). Ein Slug mit mindestens einem belegten Angebot — auch
 * Altbestand ohne `confidence` — gehört nicht dazu.
 *
 * Gegenstück zu `rejectedProviderSlugs` für die Indexregel: der Slug-Index
 * `streamingProviders` enthält unbestätigte Anbieter bewusst (Entscheidung 4, damit die
 * Plattform-Listen sie zeigen), aber ein geerbtes Angebot ist kein Indexbeleg
 * (Entscheidung 20). Genauso tolerant wie `rejectedProviderSlugs`: sind die
 * `streamingOffers` nicht geladen, ist nichts bekannt und die Menge bleibt leer.
 */
export function unconfirmedOnlyProviderSlugs(anime: any): Set<string> {
  const offers: any[] = Array.isArray(anime?.streamingOffers) ? anime.streamingOffers : []
  const confirmed = new Set(offers.filter((o) => isConfirmed(o ?? {})).map((o) => o?.provider))
  return new Set(
    offers
      .filter((o) => isUnconfirmed(o ?? {}) && !confirmed.has(o?.provider))
      .map((o) => o?.provider),
  )
}
