# Spec: Streaming-Merge & Listen-Seiten (SEO-Umbau)

Stand: 2026-09-10. Ergebnis der GSC-Auswertung (3 Monate: 36 Klicks, 4.9k Impressionen,
Ø Pos. 55, 77 % der Impressionen auf Pos. 51+) und eines Crawls aller 3.907 `/streamen/`-Seiten.

## Befund

- ~70k URLs in den Sitemaps, Authority Score 6, Backlink-Profil überwiegend Spam.
- Pro Anime drei URLs mit überlappendem Inhalt: `/anime/<slug>`, `/streamen/<slug>`, `/aehnlich/<slug>`.
- `/streamen/`: 3.907 × derselbe 400-Wörter-Textbaustein, Title-Template „… | Wer streamt es? • Ger Anime Guide (2026)“.
- Streaming-Daten sind Flags (`streamingProviders`, aus JustWatch DE) + AniList-Links. RTL+/Joyn/WOW/Paramount+
  haben 0 % Deep-Links, Prime 90 % nicht. Sprachfassungen gelten global pro Titel, nicht pro Anbieter.
- JustWatch liefert pro Angebot: Deep-Link, Monetarisierung (FLATRATE/ADS/FREE/BUY/RENT), Audio- und
  Untertitelsprachen, Staffel-/Episodenzahl, Ablaufdatum. Anbieter Aniverse, ADN, Toggo sind nicht gemappt
  (z. B. Clannad läuft bei ADN/Aniverse, hat aber keine Streaming-Daten).
- Nachfrage in der GSC sitzt bei Plattform-/Listen-Suchen („anime auf crunchyroll“, „anime ab 12 netflix“,
  „welche animes gibt es auf netflix“), nicht bei „wer streamt <titel>“ (dort beantwortet Googles „Ansehen“-Box).
- 10.636 von 11.001 Anime haben eine eigene deutsche Beschreibung ≥ 100 Zeichen. 0 von 75.127 Charakteren haben
  deutschen Text (Sitemap lässt englischen AniList-Text durch).

## Entscheidungen

1. **Merge:** Eine URL pro Titel. `/streamen/<slug>` und `/aehnlich/<slug>` → 308 auf `/anime/<slug>`.
   Streaming-Block direkt unter dem Header, vor der Handlung. Kein SEO-Textbaustein mehr; 2–3 datengetriebene Sätze.
2. **Datenmodell:** Neues Array-Feld `streamingOffers` am Anime (Anbieter, Deep-Link, Monetarisierung,
   Audio/Sub, Staffeln, Episoden, gültig bis, zuerst/zuletzt gesehen). `streamingProviders` bleibt als
   abgeleiteter Filter-Index. `availableLanguages` wird aus den Offers additiv ergänzt. Kein Anbieter ohne Deep-Link.
3. **Listen-Seiten:** `/plattform/<anbieter>/<filter>` mit `deutscher-dub`, `deutscher-sub`, `kostenlos`,
   `neu`, `filme`, `<genre-slug>`. Nur ≥ 10 Titel → indexierbar + Sitemap, sonst `noindex`.
4. **Indexierung:** Anime-Seiten bleiben indexiert, außer: kein Streaming UND (kein deutscher Text ≥ 100 Zeichen
   ODER Format MUSIC). Charaktere/Personen nur noch mit **deutschem** Text (kein Fallback auf Quelltext).
5. **Title-Templates** datenabhängig: mit Stream `„<Titel> im Stream: Crunchyroll, Netflix (Deutscher Dub) | OtakuPulse“`,
   ohne Stream `„<Titel> — Anime: Infos, Charaktere & Stream | OtakuPulse“`. Redaktionelles `seoTitle` gewinnt weiterhin.
6. **Redirects vollständig:** Routen, Sitemap-Typen, interne Links, IndexNow, alte Sitemap-Dateien → 404.

## Nicht in diesem Umbau

- Backlink-Bereinigung/Disavow, Startseiten-HTML-Größe (920 KB), Charakter-Übersetzungen.
