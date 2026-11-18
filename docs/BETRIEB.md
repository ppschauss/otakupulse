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

## Cron-Jobs auf dem VPS (Stand 18.11.2026)

Definition: `/etc/cron.d/otakupulse` (Backup: `/root/otakupulse.cron.bak-*`). Die Skripte
liegen in `/opt/otakupulse-cron/` und werden **aus dem Repo installiert, nicht dort
bearbeitet**: `sudo install -m 750 /srv/sites/otakupulse/app-src/<skript> /opt/otakupulse-cron/`.
Jedes Skript setzt seinen `PATH` selbst — `/opt/otakupulse-cron/bin/docker` übersetzt die
alten Containernamen (`otakupulse-db`) auf die Coolify-Namen. Ohne das scheitert ein
Aufruf von Hand, und ein Test kann falsch positiv ausfallen (der Watchdog meldete Exit 0,
weil er den Container nicht fand).

| Zeit | Job | Log |
|---|---|---|
| alle 5 min | `watchdog.sh` — Neustart bei HTTP ≠ 200, hält bei Deploy-Sperre still | `/srv/backups/otakupulse/watchdog.log` |
| alle 15 min | `app-memory.sh` — Speicherstand der App (Heap-Diagnose) | `/srv/backups/otakupulse/app-memory.log` |
| alle 30 min | `telegram-notify.ts --max 8` (enrich) | `/tmp/otaku-telegram.log` |
| stündlich :23 | 0-Byte-Dateien im Next-Bildcache löschen | — |
| alle 4 h :45 | `refresh-streaming.sh` — `--due 80`, Nachholaktion, Audit | `/tmp/otaku-streaming-refresh.log` |
| täglich 03:30 | `backup-db.sh` — lokal 14 Tage, offsite 7 (B2) | `/srv/backups/otakupulse/backup.log` |
| täglich 04:15 | `otakupulse-sync.sh` — AniList, JustWatch neu, Blog, Telegram, IndexNow | `/tmp/otaku-sync.log` |
| täglich 06:30 | `restart-app.sh` — kontrollierter Neustart (Heap) | `watchdog.log` |
| So 02:15 | `wikipedia-dub.py` — Ger-Dub-Flag, ID-basiert | `/tmp/otaku-wikipedia-dub.log` |
| Mo 07:55 / Mi 12:00 / So 19:00 | Wochenvorschau / Tag-Spotlight / Wochenrückblick | `/tmp/otaku-news.log` |
| Do 08:00 / Fr 08:00 | Neu auf / Verlässt (Plattform-Listen) | `/tmp/otaku-news.log` |
| 1. des Monats 08:10 | `qa-dub-sample.sh` — Stichprobe zur Handprüfung | `/tmp/otaku-qa-dub.log` |

**Zeitfenster bewusst gewählt:** Der AniList-Sync läuft ab 04:15 *im* App-Container
(`docker exec … npm run sync`) — ein App-Neustart vorher würde ihn abschießen, deshalb
`restart-app.sh` erst um 06:30 (und es prüft zusätzlich, ob der Sync noch läuft).
`wikipedia-dub.py` und die Streaming-Auffrischung schreiben beide `availableLanguages`,
darum liegt der Wikipedia-Lauf zwischen zwei Auffrischungen.

**Deploy-Sperre:** `deploy-vps.sh` und `restart-app.sh` legen `/tmp/otakupulse-deploy.lock`
an (per `trap` auch bei Abbruch entfernt). Der Watchdog hält dann still — vorher startete
er die App mitten im Deploy neu (18.11.2026, das Deploy fiel auf den alten Build zurück).
Eine Sperre älter als 20 Minuten gilt als liegengeblieben.

**Heap-Abstürze:** Die App stirbt etwa alle 2–4 Tage mit `JavaScript heap out of memory`
(Limit 4.144 MB), immer zwischen 21:30 und 22:05 Uhr. `restart-app.sh` verlegt das in die
ruhigste Stunde, behebt es aber nicht. `app-memory.log` zeigt nach ein paar Tagen, ob die
Kurve gleichmäßig wächst (Leck) oder vor 21:30 springt (Auslöser).

**Offsite-Backup:** `offsite_sync` lädt ERST die neuesten 7 lokalen Dumps hoch und entfernt
nur bei Erfolg den Rest. Die umgekehrte Reihenfolge hat am 18.11.2026 den Bucket geleert,
ohne dass der Upload danach klappte: die Speichergrenze (`403 storage_cap_exceeded`) gilt
fürs ganze B2-Konto, nicht für den Bucket. Behebt sich nur unter *Caps & Alerts* im B2-Konto.
Betroffen war ab 13.11.2026 auch das Matrix-Backup auf dem Unraid (selbes Konto).

**Zweites Offsite-Ziel: der Unraid zieht die Dumps** (`pull-backup-unraid.sh`, installiert als
`/mnt/cache/appdata/backups/otakupulse-vps-pull.sh`, Cron-Fragment
`/boot/config/plugins/dynamix/otakupulse-vps-pull.cron`, täglich 04:05). Pull statt Push:
der VPS hat keinen Zugang zum Unraid, ein kompromittierter VPS kann diese Kopien nicht
löschen. Ziel `/mnt/cache/appdata/backups/otakupulse-vps/`, 30 Stände je Präfix, jeder neue
Dump mit `gzip -t` geprüft. Fehlschläge, defekte Dumps und ein neuester Dump älter als
36 h melden sich über Unraids Benachrichtigung (Stufe alert/warning → Web-UI + Discord +
Telegram). **Tailscale:** die Verbindung läuft über Tailscale SSH. Steht die Regel für
`isekai` → VPS auf `check`, scheitert der Abzug nach Ablauf der Check-Frist (mit Meldung) —
dauerhaft nur über `"action": "accept"` in der Tailscale-ACL zu lösen.

## Auto-Blog für neue Titel + Telegram-Channel

**Blog-Beitrag pro neuem Titel** (`generate-anime-news.ts`, Claude Sonnet): erzeugt für
angekündigte (NOT_YET_RELEASED) und im Simulcast laufende (RELEASING) Titel je einen
Artikel (Kategorie `news`, Slug `neu-<anime-slug>` → Dedup). Der **Steckbrief** (Titel,
Studio, Genres, Episoden m. Fallback „unbekannt", Format, Release = Season+Jahr, Status,
Plattform, „Fortsetzung von …" via PREQUEL-Relation) wird DETERMINISTISCH aus DB-Fakten
gebaut; nur Headline + Teaser + der Beschreibungs-Rewrite (Otaku-/Weeb-Style) kommen von
der KI. Standard: **veröffentlicht** (`--draft` für Entwurf). Modi: `--recent N` (Pipeline),
`--season-current --limit N` (Backfill), `--slug <s>` (Test), `--dry`.

**Telegram-Bot** (`telegram-notify.ts`): postet neu *veröffentlichte* Artikel (Anime +
News) in einen Channel. Inkrementell über `frontend/.telegram-posted.json` (gitignored,
kein Schema-Feld). Env in `secrets.env`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`
(@name oder -100…; Bot muss Channel-Admin sein). `--seed` markiert den Altbestand als
gepostet (kein Versand), `--max N`, `--dry`. Selbstdrosselung 3 s/Post; sendPhoto mit
Fallback auf sendMessage.

Beide laufen im **enrich-Container** (bind-mountet Live-Code) via
`docker exec --env-file secrets.env otakupulse-enrich …`. Verdrahtung:
- Täglicher Wrapper (04:15) macht jetzt 4 Schritte: AniList-Sync → JustWatch (neue Titel)
  → `generate-anime-news.ts --recent 3` → `telegram-notify.ts --max 15`.
- Zusätzlicher Cron alle 30 Min: `telegram-notify.ts --max 8`
  (`/boot/config/plugins/dynamix/otakupulse-telegram.cron`) — postet auch manuell
  erstellte Redaktions-News zeitnah.

> **Voraussetzungen:** (1) `ANTHROPIC_API_KEY` mit freiem Limit (News + Übersetzungen).
> (2) `TELEGRAM_CHANNEL_ID` gesetzt + Bot als Channel-Admin. Fehlt eins, no-op'en die
> Scripts sauber (dedup/seed verhindern Dubletten bzw. Flut).

## Bewusst zurückgestellt (mit Begründung)

- **Episoden-Massenimport:** Der tägliche Sync deckt laufende + aktuelle-Season-Episoden ab (~1.100). Ein Voll-Backfill aller 2.080 Titel (~75 Min AniList-Last) bringt wenig, da AniList für ältere/abgeschlossene Titel oft keinen Airing-Schedule mehr hat. Bei Bedarf: `npm run import:batch -- --pages 42 --episodes`.
- **Sprach-/Dub-Filter (`availableLanguages`) — fertig & datenbestückt:** Radio auf `/suche` (Alle / Japanisch / Deutscher Dub / Englischer Dub / Deutscher Sub / Englischer Sub). `ja` aus JP-Herkunft. **Dub/Sub-Daten:** Crunchyroll-Sync (echte audio_locales) **+ Wikipedia** (legale Ergänzung für Klassiker/Filme). Stand 2026-06 → 734 Ger-Dub, 696 Eng-Dub, 1038 Ger-Sub, 959 Eng-Sub. AniList liefert KEINE Sprachinfo (`externalLinks.language` ist bei STREAMING immer null); aniSearch scheidet aus (ToS: Weiterverbreitung verboten).
- **„Wer streamt es" (Streaming-Anbieter):** Fertig. Normalisiertes Feld `streamingProviders` (Slugs), gespeist aus AniList `externalLinks` **+ JustWatch** (DE-Aggregator: Netflix, Amazon, Disney+, WOW, Joyn, RTL+ …). Anbieter-Register `lib/streaming.ts`. Seiten `/plattform` (+ pro Anbieter, leere ausgeblendet), Filter in `/suche`, „Wo streamen?"-Box auf Anime-Detail (verlinkt konkreten externalLink, sonst Anbieter-Startseite). Sagt NICHT, in welcher Sprache — nur, wo der Titel läuft.

## JustWatch-Streaming-Sync (`justwatch-streaming.py`)

Schreibt pro Anime `anime_streaming_offers` (Feld `streamingOffers`): je Anbieter Deep-Link,
`flatrate`/`ads`/`free`, Audio-/Untertitelsprachen, Staffeln/Episoden, Ablaufdatum,
first/last_seen. Leitet `streamingProviders` ab (autoritativ bei Match) und ergänzt
`availableLanguages` **additiv** (de/en Audio → Dub, de/en Sub → Sub). Quelle JustWatch DE
(inoffizielle GraphQL-API), HOST, `curl_cffi` + `docker`. Titel-Match per Ähnlichkeit
(Schwelle 0.90) — ohne Match bleibt der Bestand unangetastet. Nur FLATRATE/FREE/ADS, nur
Angebote mit Deep-Link. Aufrufe: ohne Flag = alle Titel (Backfill), `--recent N`,
`--only-missing`, `--stale N`, `--due N` (Cron, nach Aktualität gestaffelt), `--slugs a,b` + `--dry-run` zum Testen.
`--due` nimmt nur fällige Titel: laufend/angekündigt alle 3 Tage, bis 16 Monate alle 7,
bis 5 Jahre alle 30, bis 15 Jahre alle 90, älter alle 180 (`REFRESH_TIERS` im Skript).
Das sind ~230 Titel/Tag statt 900 bei `--stale 150`, bei häufigerer Prüfung der
laufenden Season. Reihenfolge: am stärksten überfällig zuerst, gemessen in Vielfachen
des eigenen Intervalls.
Rate-Limit: 1 Worker + 1,2 s pro Request, Instanz-Sperre (nie zwei Läufe parallel). JustWatch sperrt
die IP für ~1 h, sobald zu viel Volumen kommt — große Läufe deshalb NUR in Batches (`--stale 150`
stündlich, siehe `backfill-offers-batches.sh` im Scratch-Ordner) und mit `--initial` beim Erst-Backfill
(kein `first_seen_at`, sonst ist der ganze Katalog 30 Tage „Neu"). Kauf/Leih (BUY/RENT) wird miterfasst,
zählt aber nicht als Streaming. Neue Anbieter im Mapping müssen auch in `lib/streaming.ts` stehen
(Enum `streamingProviders` → `db-push.ts` vor dem ersten Lauf).

## Wikipedia-Dub-Sync (`wikipedia-dub.py`)

Legale Dub-Ergänzung: Wikidata (MAL-ID P4086 / AniList-ID P8729) → de.wikipedia-Artikel →
Abschnitt „Synchronisation" vorhanden ⇒ `de-dub` (gemerged). HOST, `curl_cffi` + `docker`.
Fängt Klassiker/Filme, die Crunchyroll fehlen (FMA: Brotherhood, Code Geass, Your Name …).
Läuft sonntags 02:15 per Cron. Seit 18.11.2026 seriell (vorher 6 parallel) mit User-Agent
samt Kontakt — Wikimedia-Etikette für Bots. Wichtiger als früher: der Dub-Fallback für
Anbieter ohne Tonspurdaten (Netflix, Joyn, Toggo, WOW) zählt genau dieses Flag.

## Studio-Logos (`studio-logos.py`)

Holt Studio-Logo (Wikidata P154 → Wikimedia Commons) + offizielle Website (P856),
validiert über Label-Match + instance-of (Animationsstudio/Produktionsfirma). HOST,
`curl_cffi` + `docker`. Muss selten laufen (Logos ändern sich kaum). Stand: 309 Logos,
466 Websites. WICHTIG: kein `maxlag`-Parameter (Wikidata-Replikations-Lag ließ sonst
jeden Read als Fehler zurückkommen → 0 Treffer).

## Crunchyroll-Dub-Sync (`crunchyroll-dub.py`) — STILLGELEGT seit 18.11.2026

Läuft nur noch mit `--trotzdem`. Gleicht für Titel ohne CR-Link per Titelähnlichkeit ab
(für Titel mit Link ausdrücklich großzügiger) und ersetzt pro Treffer den kompletten
Sprachsatz — dieselbe Fehlerklasse, die im JustWatch-Sync hunderte Spinoffs mit den
Anbietern ihrer Hauptserie versehen hatte. Überholt durch die Tonspuren aus JustWatch
(98,5 % der Crunchyroll-Angebote) und den ID-Abgleich über Wikipedia. Die Beschreibung
unten ist der Stand vor der Stilllegung.

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
