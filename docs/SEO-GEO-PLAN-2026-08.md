# OtakuPulse — SEO- & GEO-Plan (Stand 2026-08-05)

Grundlage: Auswertung von seroundtable.com (Webmaster-Reports Juli + August 2026,
Search Central Live Milan, Discover-Core-Update, Zero-Click-Studie) plus ein
Live-Audit von www.otakupulse.de am 05.08.2026.

Priorisierung: **P0 = blutet gerade**, **P1 = größter Marketing-Hebel**,
**P2 = Technik/UX-Fundament**, **P3 = Wachstum/Fernziel**.
Aufwand ist in Personenstunden geschätzt, für dich als Umsetzer.

---

## 0. Die Lage draußen (was sich seit Mai 2026 geändert hat)

| Fakt | Quelle | Konsequenz für uns |
|---|---|---|
| AI Overviews auf **43–48 %** aller Queries (vor einem Jahr 13–20 %) | Similarweb/Semrush, 30.07.2026 | Klassische blaue Links werden nach unten gedrückt |
| Nur noch **27,6 %** aller Google-Klicks landen im offenen Web; 68 % der Suchen enden ohne Klick | Sparktoro/Similarweb, 10.06.2026 | Traffic-Diversifizierung ist Pflicht, nicht Kür |
| **Discover** ist bei Publishern von 37 % auf **67,5 %** des Google-Traffics gewachsen, Websuche von 51 % auf 27,4 % gefallen | Feb-2026-Discover-Core-Update-Berichte | Discover ist der Hauptkanal — wir sind dort technisch **gar nicht startberechtigt** (s. P0-2) |
| Google geht **restriktiv gegen „synthetische oder programmatische Texte ohne proprietäre Daten"** vor (Scaled Content Abuse) | Search Central Live Milan, 18.06.2026 | Direktes Risiko für unsere News-Pipeline |
| Belohnt wird Content, der **Unique / Specific / Authentic** ist — „generische Guides aus Rewrites verlieren an Relevanz" | Milan, 18.06.2026 | Unser Vorteil: wir *haben* proprietäre Daten, nutzen sie nur nicht als Content |
| Site-**Level**-Quality: „URLs sind keine Inseln" — schlechte Masse zieht gute Seiten mit runter | Milan + Mueller, 16.07.2026 | 11k dünne Entity-Seiten sind ein Klumpenrisiko |
| „crawled – currently not indexed" ist meist ein **Qualitäts-**, kein Technikproblem; explizit bei KI-Content, der nach KI klingt | Mueller, Search Off the Record, 16.07.2026 | Erst in der GSC messen, dann handeln |
| Jede Site startet mit **konservativem Crawl-Limit**, das über alle Crawler geteilt wird; Google bittet um **304-Support** und schnelle Antwortzeiten | Crawl-Budget-Doc-Update, 22.07.2026 | Bei 149k URLs auf einem Heim-NAS ist das der Flaschenhals |
| **Falsche `lastmod`-Daten sind schlechter als gar keine** | Gary Illyes, 16.07.2026 | Wir senden täglich „alle 11k Seiten geändert" → P0-4 |
| Interne Suchergebnisse: nicht mehr in den Richtlinien, aber **weiterhin blockieren** (Serverlast + „hacked"-Flag bei beliebigen Suchbegriffen) | Mueller, 31.07.2026 | `/suche` ist bei uns offen → P0-3 |
| **Preferred Sources** global in Top Stories *und* AI-Antworten; Google empfiehlt ausdrücklich einen **On-Site-Button**. Nutzer klicken bei Preferred Sources **doppelt so oft** | Google, 28.05.2026 | Billigster Marketing-Hebel, den es gerade gibt |
| **`llms.txt` ist für Google wirkungslos** (weder Nutzen noch Schaden); keine Markdown-/AI-Dateien nötig | Google-Doc-Update, 16.06.2026 | Nicht bauen. Zeit sparen. |
| Erzwungenes „Chunking" für KI ist **nutzlos** — Struktur soll menschlicher Lesbarkeit folgen | Milan, 18.06.2026 | Kein GEO-Voodoo, sondern gute Artikel |
| Klicks aus AI Overviews haben **höhere Verweildauer** (Nutzer kommt vorinformiert) | Milan, 18.06.2026 | AIO-Sichtbarkeit ist wertvoll, nicht wertlos |
| „Fan-out": komplexe Queries werden in **parallele Teilsuchen** zerlegt | Milan, 18.06.2026 | Teilfragen explizit beantworten (P1-5) |
| Search Console: **AI-Performance-Report** + **Generative-AI-Controls** + **Platform-Properties** (Instagram/TikTok/X/YouTube) sind live | Juli/Aug 2026 | Kostenlose Messbarkeit, die wir nicht nutzen |

---

## P0 — Sofort. Klein im Aufwand, groß im Schaden.

### P0-1 · Cloudflare blockiert alle KI-Crawler — der GEO-Kill-Switch
**Aufwand: 15 Min · Wirkung: entscheidet, ob GEO überhaupt möglich ist**

`https://www.otakupulse.de/robots.txt` liefert einen Block, der **nicht** aus
unserer `app/robots.ts` stammt — Cloudflare injiziert ihn („Managed robots.txt" /
AI Crawl Control):

```
Content-Signal: search=yes, ai-train=no, use=reference
User-agent: GPTBot          Disallow: /
User-agent: ClaudeBot       Disallow: /
User-agent: CCBot           Disallow: /
User-agent: Google-Extended Disallow: /
User-agent: Applebot-Extended, meta-externalagent, Bytespider, Amazonbot  Disallow: /
```

Das heißt: OtakuPulse ist in **ChatGPT, Claude und Gemini-Grounding unsichtbar**.
Wer „Wo kann ich Anime X auf Deutsch streamen?" in ChatGPT fragt, bekommt uns
nicht als Quelle — obwohl wir dafür die beste Datenbasis im deutschsprachigen
Raum haben. Genau das ist GEO, und wir haben es abgeschaltet.

Zwei Entwarnungen: **AI Overviews und AI Mode sind nicht betroffen** (die laufen
über den normalen Googlebot, nicht Google-Extended). Und das `Content-Signal`
ignoriert Google ohnehin — hat Google im Juli 2026 ausdrücklich bestätigt.

**Empfehlung — differenziert statt alles-oder-nichts:**

| Bot | Zweck | Empfehlung |
|---|---|---|
| `OAI-SearchBot` | ChatGPT-Suche/Zitate | **freigeben** |
| `ChatGPT-User` | Nutzer fragt live nach | **freigeben** |
| `PerplexityBot` | Perplexity-Index | freigeben (aktuell nicht geblockt) |
| `ClaudeBot` | Claude-Suche + Training | **freigeben** |
| `Google-Extended` | Gemini-Grounding | **freigeben** |
| `GPTBot` | primär Modelltraining | Geschmackssache — ich würde freigeben |
| `CCBot`, `Bytespider`, `Amazonbot` | Scraping/Training ohne Rückkanal | blockiert lassen |

Das ist deine Entscheidung, nicht meine: Sichtbarkeit gegen Content-Schutz.
Aber solange der Block steht, ist jede weitere GEO-Maßnahme wirkungslos.

**Nebenbei:** `Disallow: /admin` ist veraltet — das Panel liegt unter
`/legal/admin` (und wird ohnehin von `proxy.ts` mit 404 abgeriegelt, was stärker
ist als robots.txt).

---

### P0-2 · `max-image-preview:large` fehlt komplett — kein Discover
**Aufwand: 30 Min · Wirkung: Zugang zum mit Abstand größten Publisher-Kanal**

Keine einzige Seite sendet ein `robots`-Meta mit `max-image-preview:large`.
Das ist die technische Eintrittskarte für **Google Discover** — ohne sie gibt es
keine großformatigen Bildkarten, und damit praktisch keine Discover-Ausspielung.

Discover ist inzwischen **67,5 % des Google-Traffics bei Publishern**. Wir haben
694 Artikel, täglich neue, ein bildstarkes Thema und eine junge Zielgruppe — das
ist ein Discover-Format wie aus dem Lehrbuch. Und wir sind nicht startberechtigt.

**Umsetzung** in `lib/seo.ts` → `pageMeta()`, global:

```ts
robots: {
  index: !noindex, follow: true,
  googleBot: { index: !noindex, follow: true,
    'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
}
```

Achtung: die bestehende `noindex`-Logik (dünne Charakter-/Personen-Seiten,
Hentai, `/news?q=`) muss erhalten bleiben — nur ergänzen, nicht ersetzen.

---

### P0-3 · `/suche` ist indexierbar
**Aufwand: 20 Min · Wirkung: Risiko-Abwehr**

`https://www.otakupulse.de/suche?q=naruto` liefert **kein** `noindex`. Mueller am
31.07.2026: nicht mehr Richtlinie, aber weiterhin dringend empfohlen — aus zwei
Gründen, die beide auf uns zutreffen:

1. **Serverlast/Crawl-Verschwendung**: unendlicher URL-Raum auf einem NAS, das
   sich das Crawl-Budget mit 149k echten URLs teilt.
2. **„Hacked"-Flag**: Wenn jemand `?q=<Pharma-/Adult-/Casino-Begriff>` crawlen
   lässt, erzeugt *unsere eigene Seite* indexierbare Treffer für diese Terme.
   Google flaggt das als gehackt — mit Ranking-Abwertung. Mueller nennt genau
   dieses Szenario.

**Umsetzung:** `noindex, follow` auf `/suche` immer wenn Query-Parameter gesetzt
sind, plus `Disallow: /suche?` in `robots.ts`. Die parameterlose `/suche` bleibt
als Landingpage indexierbar.

---

### P0-4 · `lastmod` ist unglaubwürdig — Google lernt, uns zu misstrauen
**Aufwand: 1–2 h · Wirkung: Crawl-Budget**

Stichprobe aus `/sitemaps/anime-0.xml`: Hunderte Anime mit
`lastmod: 2026-08-05T02:2x` — also „heute Nacht geändert". Tatsächlich hat der
nächtliche Sync bzw. der Streaming-Refresh nur `updatedAt` angefasst, ohne dass
sich für einen Leser irgendetwas geändert hätte.

Wir sagen Google damit **jeden Tag „alle 11.000 Seiten sind neu"**. Illyes am
16.07.2026: „probably better off without the lastmods". Google stuft die Angabe
als unzuverlässig ein und ignoriert sie site-weit — und wir verbrennen unser
konservativ zugeteiltes Crawl-Budget auf unveränderten Seiten, statt es auf die
37 echten neuen Artikel pro Woche zu lenken.

**Umsetzung, Option A (sauber):** eigenes Feld `contentUpdatedAt`, das *nur* bei
inhaltlichen Änderungen gesetzt wird (Beschreibung, Titel, Episodenzahl,
Streaming-Anbieter) — nicht bei `streamingCheckedAt`-Stempeln oder
Bild-Spiegelung. Sitemap nutzt dieses Feld.
**Option B (Notlösung, 10 Min):** `lastmod` aus den Entity-Sitemaps entfernen,
nur bei Artikeln behalten. Besser gar keine Angabe als eine falsche.

---

### P0-5 · Vier Wochen alter Build + uncommitteter Code
**Aufwand: 1 h**

`.next/BUILD_ID` ist vom 08.07.2026. Alles, was wir jetzt bauen, geht sonst gar
nicht live. Vorher: die ~500 Zeilen uncommitteter Arbeit committen (inkl.
`proxy.ts` — die komplette Sicherheitsschicht ist derzeit nur auf der Platte)
und die 2 offenen Commits pushen. Deploy nach dem dokumentierten Clean-Build-Weg
(`rm -rf .next` ist Pflicht, sonst brechen die CSS-Chunks).

---

## P1 — Marketing & GEO-Substanz. Hier liegt der Ertrag.

### P1-1 · Preferred-Sources-Button einbauen
**Aufwand: 2 h · Wirkung: hoch, sofort**

Google hat Preferred Sources im Mai 2026 global in Top Stories **und** AI Mode /
AI Overviews ausgerollt und empfiehlt Publishern ausdrücklich, einen Button auf
die eigene Seite zu setzen. Nutzer klicken bei Preferred Sources **doppelt so
oft**; über 345.000 Quellen sind bereits ausgewählt worden.

Für uns ist das ideal: wir haben Discord, Telegram und eine wiederkehrende
Community — also Menschen, die man einmal um einen Klick bitten kann.

**Umsetzung:** Button-Snippet nach Googles Doku in `Footer.tsx` + prominent auf
`/news` und unter jedem Artikel („Mach OtakuPulse zu deiner bevorzugten Quelle
bei Google"). Danach einmal aktiv in Discord/Telegram bewerben.

---

### P1-2 · Das Scaled-Content-Risiko entschärfen — und in einen Vorteil drehen
**Aufwand: 8–16 h Konzept + Pipeline-Umbau · Wirkung: existenziell**

Der Satz aus Milan ist unbequem: Google fährt einen *restriktiven* Kurs gegen
„synthetische oder programmatische Texte ohne proprietäre Daten". Unsere
Simulcast-Artikel („Episode 5 ist heute da – schafft unser Landei den nächsten
Schritt?", 259 Stück) sind formal genau das: schematisch erzeugt, ohne eigene
Daten, austauschbar. Mueller ergänzt: wenn ein Text so klingt, als hätte ihn
jeder schreiben können, wird er nicht indexiert — und zieht die Site-Qualität
mit runter.

**Die gute Nachricht: wir haben proprietäre Daten. Wir verwenden sie nur nicht
als Inhalt.** Niemand sonst im deutschsprachigen Raum hat:

- eine gepflegte **Ger-Dub-/Ger-Sub-Matrix** (1.270 / 2.831 Titel, aus echten
  Crunchyroll-`audio_locales` + Wikipedia)
- eine **rollierend verifizierte Streaming-Verfügbarkeit** über 9 Anbieter mit
  Zeitstempel — inklusive der Information, wann ein Titel eine Plattform
  *verlassen* hat
- 11.000 Titel mit Studio-/Staff-/Season-Relationen für echte Auswertungen

Das ist „Unique, Specific, Authentic" — Googles eigene Kriterien.

**Konkreter Kurswechsel:**

| Statt | Besser |
|---|---|
| 37 austauschbare Episoden-Artikel/Woche | 5–8 Artikel/Woche mit eigener Datenauswertung |
| „Episode 5 ist da" | „Diese 14 Anime haben im Juli einen deutschen Dub bekommen" (nur wir wissen das) |
| Genre-Spotlight aus Rewrites | „Was Crunchyroll im August aus dem Katalog nimmt" (aus `streamingCheckedAt`-Diffs) |
| Tages-Digest | „Ger-Dub-Report Q3: Welches Studio synchronisiert am schnellsten" |

Die Streaming-Diffs sind der stärkste Hebel: Wir prüfen bereits alle 4 Stunden
150 Titel autoritativ. Jede Änderung ist eine Nachricht, die es sonst nirgends
gibt — und ein Grund, warum LLMs uns zitieren müssen.

**Nebeneffekt:** deutlich weniger Anthropic-Kosten bei mehr Wirkung.

---

### P1-3 · Discover-Tauglichkeit: Headlines und Bilder
**Aufwand: 4 h · Wirkung: hoch (Voraussetzung: P0-2)**

Das Februar-2026-Discover-Core-Update zielt laut Google explizit auf
**Clickbait und Sensationalismus** und bevorzugt „in-depth, original and timely
content". Google empfiehlt Titel, „die den Kern des Inhalts erfassen".

Unsere generierten Headlines fahren derzeit hart auf Hype:
„…schafft unser Landei den nächsten Schritt?", „…der Hype bleibt real".
Das ist genau das Muster, das dieses Update abstraft.

**Umsetzung:**
- Prompt in `generate-anime-news.ts` / `generate-recurring-news.ts` umstellen:
  Substanz vor Hype, Titel muss den Inhalt tragen, keine rhetorischen Fragen,
  keine Übertreibungen. Der „Weeb-Ton" darf im **Fließtext** bleiben — dort ist
  er Persönlichkeit, in der Headline ist er Clickbait.
- **Bilder ≥ 1200 px Breite** sicherstellen (Discover-Anforderung). Unsere
  AniList-Banner sind meist 1900 px — aber prüfen, ob `coverImageUrl` bei
  Artikeln nicht auf ein 460-px-Cover zeigt.

---

### P1-4 · E-E-A-T: „OtakuPulse Redaktion" reicht nicht
**Aufwand: 3 h · Wirkung: mittel-hoch, Voraussetzung für Discover/News**

Alle 694 Artikel haben denselben anonymen Autor. Für ein Projekt, das gegen den
Scaled-Content-Verdacht anschreiben muss, ist das die schlechteste mögliche
Signallage.

**Umsetzung:**
- Echte Autorenseite `/autor/[slug]` mit `Person`-Schema, Foto, Bio, `sameAs`
  auf X/Discord/Telegram (die Route existiert schon, sie ist nur leer).
- Eine „Über uns / Redaktion"-Seite: wer macht das, woher kommen die Daten,
  wie wird geprüft. Das ist auch die Seite, die LLMs zitieren, wenn sie gefragt
  werden „wie zuverlässig ist otakupulse.de".
- **KI-Transparenz**: offenlegen, dass Beschreibungen KI-unterstützt übersetzt
  und Meldungen KI-unterstützt verfasst, aber redaktionell freigegeben werden.
  Das ist kein Nachteil — es ist der Unterschied zwischen „transparenter
  Prozess" und „erwischt".

---

### P1-5 · Fan-out: Teilfragen explizit beantworten
**Aufwand: 6 h · Wirkung: mittel-hoch für AI Mode**

Google zerlegt komplexe Queries in parallele Teilsuchen. Wer die Teilfrage
wörtlich und knapp beantwortet, wird zitiert.

Typische deutschsprachige Anime-Teilfragen, die wir aus der DB **deterministisch**
beantworten können:

- „Gibt es von X einen deutschen Dub?" → haben wir
- „Wo kann ich X legal streamen?" → haben wir, tagesaktuell
- „Wie viele Folgen hat X?" → haben wir
- „In welcher Reihenfolge schaue ich X?" → aus den `relations` (PREQUEL/SEQUEL) ableitbar — **das fehlt noch und ist ein starkes eigenes Format**
- „Wann kommt Staffel 2 von X?" → aus Status + Relationen

**Umsetzung:** ein kompakter, faktischer „Kurzantwort"-Block oben auf
`/anime/[slug]` (2–3 Sätze, aus DB generiert, keine KI) plus Ausbau der
FAQ-Blöcke mit genau diesen Fragen. Kein Chunking-Voodoo — Google hat in Milan
ausdrücklich gesagt, dass erzwungenes Chunking nutzlos ist. Es geht um klare,
menschenlesbare Antworten an der richtigen Stelle.

Zusätzlich: eine neue Seitenfamilie `/reihenfolge/[slug]` („In welcher
Reihenfolge schaue ich …") wäre ein Longtail-Format mit echtem Nutzwert und
ohne Konkurrenz auf Deutsch.

---

## P2 — Technik & UX. Fundament, ohne das P1 verpufft.

### P2-1 · Startseite: 900 KB HTML
**Aufwand: 4 h · Wirkung: hoch (LCP, Crawl, Mobile-UX)**

Gemessen: Startseite **921.620 Zeichen HTML** (44 % davon RSC-Flight-Payload),
**158 Bilder**, 267 Links, TTFB 0,32 s, aber 2,1 s Gesamtladezeit auf der
Anime-Detailseite. Das ist für Mobile grenzwertig und für den Crawler teuer.

Drei konkrete Ursachen:

1. **`sizes="100vw"` auf jedem Karten-Bild.** Die Karten sind ~180 px breit, der
   Browser lädt aber die viewport-breite Variante. Auf dem Handy bedeutet das
   für jedes von 158 Thumbnails die 640w-Datei statt der 256w. Fix: realistische
   `sizes` je Kontext (z. B. `(max-width: 768px) 45vw, 180px`).
2. **Zu viele Karten im Initial-Render.** Die Reihen liefern alles auf einmal;
   sinnvoll wären 10–12 pro Reihe im HTML, Rest per Scroll nachladen.
3. **Kein `priority` / `fetchPriority="high"` auf dem Hero-Bild** → der
   LCP-Kandidat konkurriert mit 157 Lazy-Bildern.

### P2-2 · 158× `alt=""`
**Aufwand: 2 h · Wirkung: mittel (Bild-SEO + Barrierefreiheit)**

Sämtliche Cover haben leeres `alt`. Für eine Anime-Datenbank ist Google Images
ein realer Kanal, und Alt-Texte („Cover von *Frieren – Nach dem Ende der Reise*,
Studio Madhouse") sind reine Fleißarbeit mit Datenbank-Rückendeckung. Zusätzlich
ist es aktuell schlicht ein Barrierefreiheits-Mangel.

### P2-3 · Cloudflare cacht kein HTML + kein 304
**Aufwand: 2 h · Wirkung: mittel-hoch (Crawl-Kapazität)**

`cf-cache-status: DYNAMIC` — jede einzelne Anfrage geht bis zum NAS durch,
obwohl wir `s-maxage=600, stale-while-revalidate` senden. Und ein Request mit
`If-None-Match` liefert **200 statt 304**.

Googles Crawl-Budget-Doc vom 22.07.2026 nennt beides ausdrücklich: „Use HTTP
caching: Support 304" und „Improve loading speed". Das Crawl-Limit wird über
*alle* Crawler geteilt — und wenn wir P0-1 umsetzen, kommen die KI-Crawler noch
dazu. Eine Cloudflare-Cache-Rule für HTML auf den ISR-Seiten (Startseite,
Anime-, Genre-, Season-Seiten) ist hier der größte Hebel bei geringstem Aufwand.

### P2-4 · Kleinkram
**Aufwand: 30 Min gesamt**
- Homepage-Canonical ist `https://www.otakupulse.de` (ohne Slash), die URL ist
  `/`. Google hat am 13.07.2026 den selbstreferenzierenden Canonical erneut in
  die Doku aufgenommen — dann soll er auch exakt stimmen.
- `robots.ts`: `/admin` → `/legal/admin` korrigieren bzw. Eintrag streichen.

---

## P3 — Wachstum & Diversifizierung

### P3-1 · Search Console vollständig nutzen (Aufwand: 1 h)
Alles kostenlos und seit Juli/August verfügbar:
- **AI-Performance-Report** aktivieren → wir sehen erstmals, ob wir in AI
  Overviews/AI Mode überhaupt verlinkt werden (Impressions zählen, sobald ein
  Link auf uns gezeigt wird, auch hinter „Mehr anzeigen").
- **Generative-AI-Controls** prüfen — sicherstellen, dass wir dort nicht
  versehentlich auf „ausschließen" stehen. Wer opt-out ist, bekommt aus
  generativen Features **weder Traffic noch Impressions**.
- **Platform-Properties**: Instagram/TikTok/X/YouTube-Performance in der GSC
  verknüpfen.
- **Seitenindexierungs-Bericht auswerten**: wie viele der 11k Entity-Seiten sind
  „crawled – currently not indexed"? Das ist unsere Messlatte für P1-2. Achtung:
  der Bericht ist derzeit laut Google verzögert.

### P3-2 · Traffic-Diversifizierung (Aufwand: laufend)
Google rät in Milan selbst dazu, die Abhängigkeit zu senken — bei 27,6 %
Klick-Anteil ins offene Web ist das keine Floskel. Wir haben bereits Discord,
Telegram, RSS, den Social-Agent und mit **AnimeCut** sogar eine fertige
Short-Video-Pipeline. Die liegt brach, während TikTok/Shorts der Kanal ist, in
dem unsere Zielgruppe tatsächlich steckt. Das ist der Kanal mit dem besten
Verhältnis von vorhandener Technik zu ungenutztem Potenzial.

### P3-3 · Search Profile (Fernziel)
Google Search Profiles sind seit Juni 2026 offiziell und speisen Discover.
Voraussetzung: 100k Follower auf YouTube/Instagram/X oder 300k auf TikTok.
Aktuell unerreichbar — aber es ist das konkrete Ziel, auf das P3-2 einzahlt.

---

## Reihenfolge für die Umsetzung

**Woche 1 (ca. 4 h):** P0-5 (committen + deployen) → P0-2 (`max-image-preview`)
→ P0-3 (`/suche` noindex) → P0-1 (Cloudflare-Entscheidung) → P2-4 (Kleinkram).
Alles außer P0-1 geht in einem Deploy zusammen.

**Woche 2 (ca. 6 h):** P0-4 (`lastmod`) → P2-3 (Cloudflare-Cache + 304) →
P3-1 (GSC einrichten und *messen*, bevor wir inhaltlich umbauen).

**Woche 3–4 (ca. 10 h):** P1-1 (Preferred-Sources-Button) → P2-1/P2-2
(Startseiten-Performance + Alt-Texte) → P1-3 (Headlines entschärfen).

**Monat 2 (ca. 20 h):** P1-2 (Content-Strategie auf proprietäre Daten umstellen)
→ P1-4 (E-E-A-T/Autoren) → P1-5 (Fan-out + `/reihenfolge/[slug]`).

**Ausdrücklich nicht tun:** `llms.txt` anlegen, Markdown-Spiegel der Seiten
bauen, Texte für „AI-Chunking" umformatieren. Google hat allen drei Ideen im
Juni 2026 explizit widersprochen.

---

## Was ich bewusst offen lasse

P0-1 (KI-Crawler freigeben) ist eine Grundsatzentscheidung zwischen Sichtbarkeit
in LLMs und Kontrolle über die eigenen Inhalte. Ich empfehle die Freigabe der
Such-/Antwort-Bots, weil GEO sonst nicht stattfindet — aber das ist deine
Entscheidung, und sie ist reversibel.

P1-2 (weniger, dafür einzigartige Artikel) bedeutet, eine funktionierende
Pipeline bewusst zurückzufahren. Die Zahl „37 Artikel pro Woche" fühlt sich gut
an. Sie ist aber genau das Muster, das Google im Juni 2026 zum Ziel erklärt hat.
