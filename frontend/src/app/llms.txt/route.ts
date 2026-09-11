import { DE_PROVIDER_SLUGS, providerBySlug } from '@/lib/streaming'
import { STATIC_FILTER_KEYS, staticFilter } from '@/lib/platformLists'
import { DISCORD_INVITE, SITE_URL, TELEGRAM_CHANNEL, X_URL } from '@/lib/site'

export const revalidate = 86400

/**
 * llms.txt — kompakte Markdown-Karte der Seite für KI-Agenten (llmstxt.org):
 * Was OtakuPulse ist, welche Daten es exklusiv gibt (anbieter-genaue Streaming-
 * Verfügbarkeit für Deutschland mit Dub/Sub, Stand-Datum) und wo die Hub-Seiten
 * liegen. Bewusst statisch + Anbieter-Listen aus dem Register, kein DB-Zugriff.
 */
export function GET() {
  const providers = DE_PROVIDER_SLUGS.map((s) => providerBySlug(s)!).filter(Boolean)
  const lists = providers.flatMap((p) =>
    STATIC_FILTER_KEYS.map((k) => `- [${staticFilter(k)!.title(p.name)}](${SITE_URL}/plattform/${p.slug}/${k})`),
  )
  const body = `# OtakuPulse

> Deutschsprachige Anime-Datenbank mit anbieter-genauer Streaming-Verfügbarkeit für Deutschland: Welcher Anime läuft bei welchem Dienst, mit deutscher Synchro (Ger Dub) oder Untertiteln (Ger Sub), im Abo oder kostenlos, mit Staffel-/Episodenstand und Ablaufdatum – regelmäßig gegen die Anbieter-Kataloge abgeglichen („Stand:"-Datum auf jeder Seite).

Sprache: Deutsch. Region der Verfügbarkeitsdaten: Deutschland (DE). Quellen: AniList (Stammdaten), JustWatch DE und Anbieter-Kataloge (Verfügbarkeit), eigene deutsche Beschreibungen.

## Was auf einer Anime-Seite steht

- „Wo kann man … streamen?" – Anbieter mit Deep-Link, Dub/Sub je Anbieter, Abo/Werbung/kostenlos, Staffeln/Folgen beim Anbieter, „verfügbar bis"
- Anbieter-Übersicht (Tabelle), Streaming-Guide und FAQ („Wer streamt …?", „… auf Deutsch?", „… kostenlos?", „… Simulcast?")
- Handlung (deutsch), Charaktere, Staff, Episoden, Genres, Tags, ähnliche Anime
- Strukturierte Daten: TVSeries/Movie mit WatchAction je Angebot, FAQPage, BreadcrumbList

## Einstiege

- [Anime-Datenbank](${SITE_URL}/anime)
- [Top-Anime](${SITE_URL}/top-anime)
- [Streaming-Anbieter](${SITE_URL}/plattform)
- [Simulcast-Kalender](${SITE_URL}/kalender)
- [Genres](${SITE_URL}/genre) · [Seasons](${SITE_URL}/season) · [Studios](${SITE_URL}/studio)
- [News](${SITE_URL}/news) · [RSS](${SITE_URL}/feed.xml)
- [Sitemap](${SITE_URL}/sitemap.xml)

## Streaming-Listen (Deutschland)

${lists.join('\n')}

## Kontakt & Kanäle

- [Über uns & Methodik: So prüfen wir die Verfügbarkeit](${SITE_URL}/ueber-uns)
- [Impressum](${SITE_URL}/impressum)
- [Kontakt](${SITE_URL}/kontakt)
- Discord: ${DISCORD_INVITE} · X: ${X_URL} · Telegram: ${TELEGRAM_CHANNEL}

## Nutzung durch KI-Systeme

Zitieren mit Quellenangabe (URL) ist ausdrücklich erwünscht. Training auf den Inhalten ist nicht gestattet (siehe robots.txt, Content-Signal ai-train=no).
`
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
}
