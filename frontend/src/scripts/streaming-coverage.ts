/**
 * Lagebericht Streaming-Abdeckung & Indexierung.
 *
 * Beantwortet zwei Fragen vor dem Scharfschalten der Indexregel:
 *   1. Wie viele Titel haben überhaupt belegte Streaming-Angebote (und bei wem)?
 *      Unterschieden nach Vertrauensstufe (confirmed / unconfirmed / rejected; NULL = belegt)
 *      und nach Prüfstempel `streamingVerifiedAt`, plus die Lücke der laufenden Season.
 *   2. Wie viele Seiten wären mit der aktuellen Regel (lib/anime.ts → animeIndexable)
 *      indexierbar — und was fällt bei welcher Popularitätsschwelle weg?
 *
 * Aufruf:  npx tsx src/scripts/streaming-coverage.ts
 *          INDEX_MIN_POPULARITY=2000 npx tsx src/scripts/streaming-coverage.ts
 */
import { getPayload } from 'payload'
import config from '../payload.config'
import { INDEX_MIN_POPULARITY } from '../lib/anime'

const q = async (payload: any, sql: string, params: any[] = []) => (await (payload.db as any).pool.query(sql, params)).rows

async function main() {
  const payload = await getPayload({ config })
  const pub = 'a.is_hentai IS NOT TRUE'
  // `rejected` ist ein Veto (die Seite zeigt die Zeile nicht) und zählt nie als Angebot.
  // `confidence IS NULL` ist belegt (Altbestand) und zählt wie `confirmed`.
  const STREAM = "o.monetization IN ('flatrate','ads','free') AND o.confidence IS DISTINCT FROM 'rejected'"

  const [total] = await q(payload, `SELECT count(*)::int n FROM anime a WHERE ${pub}`)
  const [withOffers] = await q(
    payload,
    `SELECT count(DISTINCT a.id)::int n FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id WHERE ${STREAM} AND ${pub}`,
  )
  const [withFlags] = await q(
    payload,
    `SELECT count(DISTINCT a.id)::int n FROM anime a JOIN anime_streaming_providers p ON p.parent_id = a.id WHERE ${pub}`,
  )
  const [blocked] = await q(payload, `SELECT count(*)::int n FROM anime a WHERE a.is_hentai IS TRUE`)
  const [checked] = await q(payload, `SELECT count(*)::int n FROM anime a WHERE a.streaming_checked_at IS NOT NULL AND ${pub}`)
  const [stale] = await q(
    payload,
    `SELECT count(*)::int n FROM anime a WHERE ${pub} AND (a.streaming_checked_at IS NULL OR a.streaming_checked_at < now() - interval '30 days')`,
  )

  console.log('=== Streaming-Abdeckung ===')
  console.log(`  Öffentlicher Bestand:        ${total.n}`)
  console.log(`  Davon mit Angeboten:         ${withOffers.n}  (${((withOffers.n / total.n) * 100).toFixed(1)} %)`)
  console.log(`  Anbieter-Index gesetzt:      ${withFlags.n}`)
  console.log(`  Geprüft (JustWatch):         ${checked.n}`)
  console.log(`  Prüfung älter als 30 Tage:   ${stale.n}`)
  console.log(`  Gesperrt (Adult-Policy):     ${blocked.n}`)

  const perProvider = await q(
    payload,
    `SELECT o.provider, count(DISTINCT a.id)::int n
     FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
     WHERE ${STREAM} AND ${pub} GROUP BY 1 ORDER BY 2 DESC`,
  )
  console.log('\n=== Titel je Anbieter ===')
  for (const r of perProvider) console.log(`  ${String(r.provider).padEnd(22)} ${r.n}`)

  // --- Vertrauensstufen: Angebote (Zeilen) und Titel je Stufe. NULL = belegt = confirmed. ---
  const tiers = await q(
    payload,
    `SELECT COALESCE(o.confidence::text, 'confirmed') AS stufe, count(*)::int zeilen, count(DISTINCT a.id)::int titel
     FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
     WHERE o.monetization IN ('flatrate','ads','free') AND ${pub} GROUP BY 1`,
  )
  const tier = (k: string) => tiers.find((r: any) => r.stufe === k) ?? { zeilen: 0, titel: 0 }
  const [onlyUnconfirmed] = await q(
    payload,
    `SELECT count(*)::int n FROM anime a WHERE ${pub}
       AND EXISTS (SELECT 1 FROM anime_streaming_offers o WHERE o._parent_id = a.id AND ${STREAM} AND o.confidence = 'unconfirmed')
       AND NOT EXISTS (SELECT 1 FROM anime_streaming_offers o WHERE o._parent_id = a.id AND ${STREAM} AND o.confidence IS DISTINCT FROM 'unconfirmed')`,
  )
  const [verified] = await q(payload, `SELECT count(*)::int n FROM anime a WHERE a.streaming_verified_at IS NOT NULL AND ${pub}`)
  console.log('\n=== Vertrauensstufen (Angebote / Titel) ===')
  for (const k of ['confirmed', 'unconfirmed', 'rejected']) {
    const t = tier(k)
    console.log(`  ${k.padEnd(12)} ${String(t.zeilen).padStart(6)} Angebote  ${String(t.titel).padStart(6)} Titel${k === 'rejected' ? '  (Veto, nie sichtbar)' : ''}`)
  }
  console.log(`  Titel NUR mit unbestätigten Angeboten: ${onlyUnconfirmed.n}`)
  console.log(`  streamingVerifiedAt gesetzt:           ${verified.n}  (${((verified.n / total.n) * 100).toFixed(1)} %)`)

  // --- Lücke der laufenden Season: dieselbe Zahl, die der Telegram-Alarm überwacht. ---
  const now = new Date()
  const season = ['WINTER', 'SPRING', 'SUMMER', 'FALL'][Math.floor(now.getUTCMonth() / 3)]
  const year = now.getUTCFullYear()
  const [cur] = await q(
    payload,
    `SELECT count(*)::int total,
            count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM anime_streaming_offers o WHERE o._parent_id = a.id AND ${STREAM}))::int ohne_angebot,
            count(*) FILTER (WHERE a.streaming_verified_at IS NULL)::int ohne_stempel,
            count(*) FILTER (WHERE a.streaming_verified_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM anime_streaming_offers o WHERE o._parent_id = a.id))::int luecke
     FROM anime a WHERE a.season_year = $1 AND a.season = $2 AND ${pub}`,
    [year, season],
  )
  console.log(`\n=== Laufende Season ${season} ${year} ===`)
  console.log(`  Titel:                                   ${cur.total}`)
  console.log(`  ohne Angebot:                            ${cur.ohne_angebot}   (Abnahmeziel ≤ 10)`)
  console.log(`  ohne streamingVerifiedAt:                ${cur.ohne_stempel}`)
  console.log(`  Lücke (weder Angebot noch Stempel):      ${cur.luecke}   (Alarm ab > 0; Abnahmeziel 0)`)

  console.log(`\n=== Indexierung (aktuelle Schwelle: popularity ≥ ${INDEX_MIN_POPULARITY}) ===`)
  for (const th of [0, 1000, 2000, 5000, 10000, 20000]) {
    const [row] = await q(
      payload,
      `SELECT
         count(*) FILTER (WHERE off)::int AS by_stream,
         count(*) FILTER (WHERE NOT off AND dlen >= 100 AND fmt <> 'MUSIC' AND pop >= $1)::int AS by_demand,
         count(*) FILTER (WHERE NOT off AND (dlen < 100 OR fmt = 'MUSIC' OR pop < $1))::int AS dropped
       FROM (
         SELECT a.id, COALESCE(a.popularity, 0) pop, COALESCE(length(a.description_de), 0) dlen, a.format::text fmt,
                EXISTS (SELECT 1 FROM anime_streaming_offers o WHERE o._parent_id = a.id AND ${STREAM}) off
         FROM anime a WHERE ${pub}
       ) x`,
      [th],
    )
    const idx = row.by_stream + row.by_demand
    const mark = th === INDEX_MIN_POPULARITY ? ' ←' : ''
    console.log(
      `  pop ≥ ${String(th).padStart(5)}:  indexierbar ${String(idx).padStart(5)}  (Stream ${row.by_stream} + Nachfrage ${row.by_demand})  ·  noindex ${row.dropped}${mark}`,
    )
  }

  const topDropped = await q(
    payload,
    `SELECT a.slug, COALESCE(a.popularity,0) pop, a.format::text fmt
     FROM anime a
     WHERE ${pub} AND NOT EXISTS (SELECT 1 FROM anime_streaming_offers o WHERE o._parent_id = a.id AND ${STREAM})
       AND COALESCE(a.popularity,0) >= $1
     ORDER BY a.popularity DESC LIMIT 10`,
    [INDEX_MIN_POPULARITY],
  )
  console.log('\n=== Bekannte Titel ohne Streaming-Angebot (bleiben indexiert) ===')
  for (const r of topDropped) console.log(`  ${String(r.slug).slice(0, 44).padEnd(46)} pop ${r.pop}  ${r.fmt}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
