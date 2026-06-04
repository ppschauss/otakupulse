# OtakuPulse — Betrieb & Deployment

## Production-Build (Performance)

Die App läuft aktuell als `next dev` (unkompiliert, langsam). Für Produktion:

```sh
docker exec otakupulse-app npm run build      # einmalig kompilieren
# Container-Command von `npm run dev` auf `npm run start` umstellen
# (in deinem docker run / compose), dann Container neu erstellen.
```

- **ISR ist aktiv:** Startseite & Kalender (`export const revalidate = 600`) werden im Prod-Build gecacht (alle 10 Min neu) → instant für Besucher. Detailseiten sind dynamisch (lesen `?page`), profitieren aber stark vom kompilierten Build.
- Trade-off: kein Hot-Reload mehr → Code-Änderungen brauchen `npm run build` + Neustart. Daher erst zum Launch umstellen.

## Analytics (datenschutzfreundlich, cookieless)

In `secrets.env` setzen (dann automatisch aktiv, sonst kein Tracking):

```
# Plausible
NEXT_PUBLIC_PLAUSIBLE_DOMAIN=otakupulse.de
# optional Self-Hosted: NEXT_PUBLIC_PLAUSIBLE_SRC=https://<plausible>/js/script.js

# ODER Umami
NEXT_PUBLIC_UMAMI_WEBSITE_ID=...
NEXT_PUBLIC_UMAMI_SRC=https://<umami>/script.js
```

## Google Search Console

1. In `secrets.env`: `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=<token aus GSC>` → erzeugt die Verifizierungs-Meta.
2. Property in der Search Console anlegen (Domain oder URL-Präfix).
3. Sitemap einreichen: `https://<domain>/sitemap.xml`

## Täglicher Auto-Sync (Cron)

Script ist fertig: `npm run sync` (aktualisiert laufende Anime + aktuelle Season inkl. Episoden). Wrapper: `/root/otakupulse-sync.sh`.

Auf Unraid am besten über das **User Scripts**-Plugin (überlebt Reboots) — Schedule „daily", Inhalt:

```sh
docker exec otakupulse-app npm run sync
# Streaming/Dub frisch halten (HOST, brauchen curl_cffi; wöchentlich reicht):
F=/mnt/cache/appdata/otakupulse/frontend/src/scripts
python3 $F/crunchyroll-dub.py        # echte Ger/Eng-Dub (audio_locales)
python3 $F/justwatch-streaming.py     # Anbieter-Verfügbarkeit (alle DE-Plattformen)
python3 $F/wikipedia-dub.py           # legale Ger-Dub-Ergänzung (Klassiker/Filme)
python3 $F/studio-logos.py            # Studio-Logos + Websites aus Wikidata (selten nötig)
```

(Roh-Crontab `0 4 * * * /root/otakupulse-sync.sh` funktioniert auch, überlebt aber keinen Reboot.)
Die drei Host-Skripte müssen nicht täglich laufen — wöchentlich reicht. Einmalig vorher: `pip install curl_cffi`.

## Bewusst zurückgestellt (mit Begründung)

- **Episoden-Massenimport:** Der tägliche Sync deckt laufende + aktuelle-Season-Episoden ab (~1.100). Ein Voll-Backfill aller 2.080 Titel (~75 Min AniList-Last) bringt wenig, da AniList für ältere/abgeschlossene Titel oft keinen Airing-Schedule mehr hat. Bei Bedarf: `npm run import:batch -- --pages 42 --episodes`.
- **Sprach-/Dub-Filter (`availableLanguages`) — fertig & datenbestückt:** Radio auf `/suche` (Alle / Japanisch / Deutscher Dub / Englischer Dub / Deutscher Sub / Englischer Sub). `ja` aus JP-Herkunft. **Dub/Sub-Daten:** Crunchyroll-Sync (echte audio_locales) **+ Wikipedia** (legale Ergänzung für Klassiker/Filme). Stand 2026-06 → 734 Ger-Dub, 696 Eng-Dub, 1038 Ger-Sub, 959 Eng-Sub. AniList liefert KEINE Sprachinfo (`externalLinks.language` ist bei STREAMING immer null); aniSearch scheidet aus (ToS: Weiterverbreitung verboten).
- **„Wer streamt es" (Streaming-Anbieter):** Fertig. Normalisiertes Feld `streamingProviders` (Slugs), gespeist aus AniList `externalLinks` **+ JustWatch** (DE-Aggregator: Netflix, Amazon, Disney+, WOW, Joyn, RTL+ …). Anbieter-Register `lib/streaming.ts`. Seiten `/plattform` (+ pro Anbieter, leere ausgeblendet), Filter in `/suche`, „Wo streamen?"-Box auf Anime-Detail (verlinkt konkreten externalLink, sonst Anbieter-Startseite). Sagt NICHT, in welcher Sprache — nur, wo der Titel läuft.

## JustWatch-Streaming-Sync (`justwatch-streaming.py`)

Erweitert `streamingProviders` um ALLE DE-Anbieter via JustWatch (inoffizielle GraphQL-API).
HOST, `curl_cffi` + `docker`. Titel-Match per Ähnlichkeit (Schwelle 0.90), nur
FLATRATE/FREE/ADS (kein Kauf/Verleih), gemerged. Liefert KEINE Sprache/Dub.

## Wikipedia-Dub-Sync (`wikipedia-dub.py`)

Legale Dub-Ergänzung: Wikidata (MAL-ID P4086 / AniList-ID P8729) → de.wikipedia-Artikel →
Abschnitt „Synchronisation" vorhanden ⇒ `de-dub` (gemerged). HOST, `curl_cffi` + `docker`.
Fängt Klassiker/Filme, die Crunchyroll fehlen (FMA: Brotherhood, Code Geass, Your Name …).

## Studio-Logos (`studio-logos.py`)

Holt Studio-Logo (Wikidata P154 → Wikimedia Commons) + offizielle Website (P856),
validiert über Label-Match + instance-of (Animationsstudio/Produktionsfirma). HOST,
`curl_cffi` + `docker`. Muss selten laufen (Logos ändern sich kaum). Stand: 309 Logos,
466 Websites. WICHTIG: kein `maxlag`-Parameter (Wikidata-Replikations-Lag ließ sonst
jeden Read als Fehler zurückkommen → 0 Treffer).

## Crunchyroll-Dub-Sync (`crunchyroll-dub.py`)

Holt echte deutsche/englische Dub- & Sub-Verfügbarkeit aus der Crunchyroll-Content-API
(`audio_locales`/`subtitle_locales`) für alle Anime mit Crunchyroll-`/series/<ID>`-Link
und schreibt sie nach `anime_available_languages`.

**Läuft auf dem HOST** (nicht im Container), weil zwei Host-Voraussetzungen nötig sind:

```sh
pip install curl_cffi          # TLS-Impersonation — Crunchyroll steht hinter Cloudflare
python3 /mnt/cache/appdata/otakupulse/frontend/src/scripts/crunchyroll-dub.py
```

- Die **Host-IP muss in DE liegen** (das Skript warnt sonst): Crunchyroll liefert den
  Katalog regionsabhängig, der deutsche Dub erscheint nur im DE-Katalog.
- Grau-Zone: anonymer `cr_web`-Token, konservativ rate-limitiert (8 parallel, 429-Backoff).
- Idempotent: ersetzt pro Anime die Sprach-Zeilen neu. Der AniList-Import/Sync **merged**
  `availableLanguages` (überschreibt also die Dub-Daten nicht).
- **Maximale Abdeckung:** Das Skript löst nicht nur die ~461 `/series/<ID>`-Links direkt
  auf, sondern sucht ALLE übrigen Titel über die CR-Such-API und matcht per `slug_title`
  (alte `/<slug>`-Links) bzw. Titel-Ähnlichkeit. Titel, die nicht im CR-DE-Katalog sind
  (z. B. Netflix-Exklusiv wie Hunter×Hunter), werden bewusst verworfen — keine Fehl-Labels.
- **next/image (WebP/AVIF):** Aktuell `<img>` auf lokal gespiegelten, bereits passend dimensionierten Covern. next/image würde im Dev die Bildladezeiten verschlechtern (On-Demand-Optimierung von ~60k Bildern) bei moderatem Prod-Nutzen. Empfehlung: erst bei echtem Bandbreiten-Bedarf für die Karten-Komponenten aktivieren.
- **Watchlist/Favoriten:** Kommt ausschließlich in der **Android-App** — auf der Web-Seite bewusst nicht vorgesehen.

## Sicherheit

- **API-Key rotieren**, falls im Klartext geteilt (Anthropic-Dashboard) und neu in `secrets.env` ablegen.
- `secrets.env` ist in `.gitignore` (nie committen).
