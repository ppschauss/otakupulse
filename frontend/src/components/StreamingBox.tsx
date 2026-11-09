import Link from 'next/link'
import { formatDateDe, joinNames } from '@/lib/anime'
import {
  MONETIZATION_LABELS,
  groupOffersByProvider,
  isAmazonChannelUrl,
  languageItems,
  purchaseOffersOf,
  streamingOffersOf,
  streamingSummary,
  type StreamingOffer,
} from '@/lib/streaming'
import { UNCONFIRMED_LABEL, isConfirmed, isUnconfirmed } from '@/lib/streamingConfidence'

/**
 * „Wo streamen?"-Block der Anime-Seite — ersetzt die frühere /streamen/-Seite.
 * Zeigt PRO Anbieter das, was Googles „Ansehen"-Box und JustWatch nicht liefern:
 * Sprachfassung je Anbieter, Abo/Kostenlos, Staffel-/Episodenstand beim
 * Anbieter, Ablaufdatum, „Neu"-Marker und den Prüfzeitpunkt. Bei Titeln, die
 * noch keine Offers haben (Backfill rollierend), fällt die Box auf die alten
 * Flags zurück und verzichtet dann bewusst auf Sprach-/Episodenangaben.
 */
export function StreamingBox({ anime, title }: { anime: any; title: string }) {
  const views = streamingOffersOf(anime)
  const groups = groupOffersByProvider(views)
  const s = streamingSummary(anime)
  const stand = formatDateDe(s.checkedAt)
  const verified = formatDateDe(anime?.streamingVerifiedAt)
  const stores = purchaseOffersOf(anime)

  return (
    <section id="stream" className="mt-8 scroll-mt-24">
      <h2 className="mb-1 text-lg font-bold text-white">Wo kann man {title} streamen?</h2>
      {groups.length ? (
        <>
          <p className="mb-4 text-sm text-zinc-400">
            {title} läuft in Deutschland bei {joinNames(groups.map((g) => g.provider.name))}
            {s.legacy ? '' : s.hasDeDub ? ' — mit deutscher Synchro' : s.hasDeSub ? ' — im Original mit deutschen Untertiteln' : ''}
            {s.hasFree ? ', teilweise kostenlos' : ''}.{stand ? ` Stand: ${stand}.` : ''}
            {s.hasUnconfirmed ? ' Bei einzelnen Anbietern ist die konkrete Staffel nicht bestätigt.' : ''}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map(({ provider, offers }) => {
              const unconfirmed = offers.every(isUnconfirmed)
              // Details (Sprache, Staffel, Ablauf) und Link nur von belegten Angeboten; fehlen sie, trägt die Karte nur das Badge.
              const confirmed = offers.filter(isConfirmed)
              const primary = confirmed[0] ?? offers[0]
              const shown = confirmed.length ? confirmed : offers
              return (
                <a
                  key={provider.slug}
                  href={primary.url}
                  target="_blank"
                  rel="nofollow noopener noreferrer"
                  className="group rounded-xl border border-white/10 bg-zinc-900/50 p-4 transition hover:border-accent/50 hover:bg-zinc-900"
                  style={provider.color ? { borderColor: `${provider.color}55` } : undefined}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <span
                        className="inline-block h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: provider.color || '#7c3aed' }}
                        aria-hidden
                      />
                      <span className="font-bold text-white group-hover:text-accent">{provider.name}</span>
                      {isNew(offers) ? (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                          Neu
                        </span>
                      ) : null}
                      {unconfirmed ? (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-300">
                          {UNCONFIRMED_LABEL}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-accent">Zum Stream →</span>
                  </div>
                  {isAmazonChannelUrl(primary.url) ? (
                    <p className="mt-1 text-[11px] text-zinc-500">über Amazon Prime buchbar</p>
                  ) : null}
                  {primary.legacy ? (
                    <p className="mt-2 text-xs text-zinc-500">Details zur Sprachfassung folgen — bitte beim Anbieter prüfen.</p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                      {langBadges(offers)}
                      {shown.map((o) =>
                        o.monetization ? (
                          <li
                            key={o.monetization}
                            className={`rounded-md px-2 py-0.5 ${
                              o.monetization === 'flatrate'
                                ? 'bg-white/5 text-zinc-300 ring-1 ring-white/10'
                                : 'bg-emerald-500/15 text-emerald-300'
                            }`}
                          >
                            {MONETIZATION_LABELS[o.monetization]}
                          </li>
                        ) : null,
                      )}
                      {!unconfirmed && scope(primary) ? <li className="text-zinc-500">{scope(primary)}</li> : null}
                      {!unconfirmed && primary.availableTo ? (
                        <li className="text-amber-400/80">bis {formatDateDe(primary.availableTo)}</li>
                      ) : null}
                    </ul>
                  )}
                </a>
              )
            })}
          </div>
        </>
      ) : (
        <p className="text-sm text-zinc-400">
          {/* „Bei keinem Anbieter" nur mit Nachweis (vollständiger Katalog-Durchlauf); sonst keine Aussage zur Nichtverfügbarkeit. */}
          {anime?.streamingVerifiedAt ? (
            <>
              Aktuell ist {title} bei keinem Anbieter in Deutschland im Abo- oder Gratis-Stream gelistet
              {verified ? ` (geprüft am ${verified})` : ''}. Sobald ein Dienst den Titel aufnimmt, erscheint er hier.
            </>
          ) : (
            <>Für {title} liegen uns noch keine geprüften Streaming-Angebote vor.</>
          )}{' '}
          <Link href="/plattform" className="text-zinc-300 underline-offset-2 hover:text-accent hover:underline">
            Alle Streaming-Anbieter
          </Link>
        </p>
      )}
      {/* Kauf/Leih (VoD-Stores) — kein Stream, aber die Antwort auf „kaufen oder leihen?" */}
      {stores.length ? (
        <p className="mt-3 text-xs text-zinc-500">
          Kaufen oder leihen:{' '}
          {stores.map((st, i) => (
            <span key={st.provider.slug}>
              {i > 0 ? ' · ' : ''}
              <a href={st.url} target="_blank" rel="nofollow noopener noreferrer" className="text-zinc-400 hover:text-accent">
                {st.provider.name}
              </a>
              <span className="text-zinc-600"> ({[st.buy ? 'Kauf' : '', st.rent ? 'Leihe' : ''].filter(Boolean).join('/')})</span>
            </span>
          ))}
        </p>
      ) : null}
    </section>
  )
}

const NEW_MS = 30 * 86400_000
function isNew(offers: StreamingOffer[]): boolean {
  return offers.some((o) => !!o.firstSeenAt && Date.now() - Date.parse(o.firstSeenAt) <= NEW_MS)
}

// „3 Staffeln · 120 Folgen" (nur, wenn der Anbieter Zahlen liefert).
function scope(o: StreamingOffer): string {
  const parts: string[] = []
  if (o.seasons) parts.push(`${o.seasons} ${o.seasons === 1 ? 'Staffel' : 'Staffeln'}`)
  if (o.episodes) parts.push(`${o.episodes} Folgen`)
  return parts.join(' · ')
}

// Sprach-Badges (Auswahl in languageItems: nur belegte Angebote).
function langBadges(offers: StreamingOffer[]) {
  return languageItems(offers).map((it) => (
    <li
      key={it.key}
      className={`rounded-md px-2 py-0.5 font-medium ${
        it.dub ? 'bg-accent/20 text-white ring-1 ring-accent/40' : 'border border-white/10 bg-white/5 text-zinc-300'
      }`}
    >
      {it.label}
    </li>
  ))
}
