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
 * Die Aussage zur Nichtverfügbarkeit — EINE Quelle für Seite und Meta-Description.
 *
 * Sie reicht nur so weit wie der Katalog-Durchlauf, der sie belegt: geblättert werden
 * die Anbieter MIT Paket (`PACKAGES` in `justwatch-catalog.py`), nicht alle gemappten.
 * Im Abo-/Gratis-Bereich haben HIDIVE, Paramount+, Anime on Demand und Apple TV+ keines.
 * „bei keinem Anbieter" wäre für einen Titel, der nur dort läuft, falsch.
 *
 * Als Konstante, weil die Formulierung an zwei Orten erscheint (`StreamingBox.tsx` und
 * `streamingText.ts`). Als Kommentar-Bitte, beide gleichzeitig zu ändern, würde sie
 * irgendwann auseinanderlaufen — und dann behauptet eine der beiden Stellen mehr, als
 * der Stempel trägt. Nur mit `streamingVerifiedAt` verwenden.
 */
export const NO_PROVIDER_PHRASE =
  'bei keinem der von uns geprüften Streaming-Anbieter in Deutschland im Abo- oder Gratis-Stream'

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

/** Platzhalter in Tabellen, wenn es keine belegbare Sprachangabe gibt (wie beim Score). */
export const NO_LANGUAGE = '—'

/**
 * Sprachfassung EINER Angebotszeile für die Plattform-News („Neu auf <Anbieter>",
 * „verlässt <Anbieter>"). `audio`/`subs` sind die Komma-Strings der Angebotszeile.
 *
 * Für belegte Zeilen (auch Altbestand ohne `confidence`) bleibt der alte Rückfall
 * `'Japanisch (OmU)'` — er ist älter als die Vertrauensstufen und bleibt unberührt.
 * Eine UNBESTÄTIGTE Zeile ohne jede Sprachangabe bekommt dagegen `NO_LANGUAGE`:
 * geerbte Angebote tragen leeres `audio` und `subs` (Entscheidung 7), und eine
 * behauptete Sprachfassung direkt neben dem Zusatz „Staffel nicht bestätigt" wäre
 * genau die Unwahrheit, die die StreamingBox dort schon unterdrückt. Liegen Daten
 * vor, werden sie auch für eine unbestätigte Zeile gezeigt — die Daten sind belegt,
 * nur die Staffelzuordnung ist es nicht.
 */
export function offerLanguageLabel(
  audio?: string | null,
  subs?: string | null,
  confidence?: Confidence | null,
): string {
  const a = (audio || '').split(',')
  const su = (subs || '').split(',')
  if (a.includes('de')) return 'Deutscher Dub'
  if (su.includes('de')) return 'Deutscher Sub'
  if (isUnconfirmed({ confidence }) && !(audio || '').trim() && !(subs || '').trim()) return NO_LANGUAGE
  return 'Japanisch (OmU)'
}

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
