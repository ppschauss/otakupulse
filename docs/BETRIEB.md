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
```

(Roh-Crontab `0 4 * * * /root/otakupulse-sync.sh` funktioniert auch, überlebt aber keinen Reboot.)

## Bewusst zurückgestellt (mit Begründung)

- **Episoden-Massenimport:** Der tägliche Sync deckt laufende + aktuelle-Season-Episoden ab (~1.100). Ein Voll-Backfill aller 2.080 Titel (~75 Min AniList-Last) bringt wenig, da AniList für ältere/abgeschlossene Titel oft keinen Airing-Schedule mehr hat. Bei Bedarf: `npm run import:batch -- --pages 42 --episodes`.
- **Sub/Dub-Sprachfilter (`availableLanguages`):** AniList liefert keine verlässliche DE-Dub/Sub-Verfügbarkeit. Bräuchte manuelle Pflege oder eine andere Quelle (z. B. dt. Streaming-API). Feld + Filter daher offen.
- **next/image (WebP/AVIF):** Aktuell `<img>` auf lokal gespiegelten, bereits passend dimensionierten Covern. next/image würde im Dev die Bildladezeiten verschlechtern (On-Demand-Optimierung von ~60k Bildern) bei moderatem Prod-Nutzen. Empfehlung: erst bei echtem Bandbreiten-Bedarf für die Karten-Komponenten aktivieren.
- **Watchlist/Favoriten:** Kommt ausschließlich in der **Android-App** — auf der Web-Seite bewusst nicht vorgesehen.

## Sicherheit

- **API-Key rotieren**, falls im Klartext geteilt (Anthropic-Dashboard) und neu in `secrets.env` ablegen.
- `secrets.env` ist in `.gitignore` (nie committen).
