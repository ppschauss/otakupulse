# Streaming-Verfügbarkeit dauerhaft aktuell halten

Entwurfsdokument, 2026-11-09. Grundlage für die Umsetzungsplanung.

## Intent

Auf der Anime-Seite steht der Block „Wo kann man … streamen?". Er ist einer der
Gründe, warum Besucher kommen, und er ist für knapp drei Viertel des Katalogs
leer. Nicht falsch — leer. Ein Besucher, der einen Titel gerade auf Crunchyroll
schaut, schlägt ihn bei uns nach und findet keinen Anbieter. Das beschädigt das
Vertrauen in die ganze Seite, nicht nur in dieses Feld.

Die Ursache ist nicht die Aktualität des Bestands und nicht der Cron. Beides
läuft. Die Ursache ist, dass wir eine einzige Quelle (JustWatch DE) über eine
Titel-Fuzzy-Suche befragen und jeder Fehlschlag **lautlos** zu „kein Anbieter"
wird, während der Titel trotzdem einen „geprüft"-Stempel bekommt und damit für
die nächsten zwölf Tage als erledigt gilt.

Dieses Dokument beschreibt, wie die Abdeckung systematisch steigt, wie die
Latenz bei laufenden Simulcasts fällt und — ebenso wichtig — wie die
verbleibende Lücke **sichtbar und abarbeitbar** wird, statt unsichtbar zu
bleiben.

## Befund

Alles unten wurde am 2026-11-09 auf dem VPS gemessen, nicht geschätzt.

### Was funktioniert

| Messung | Ergebnis |
|---|---|
| Cron `45 */4 * * *` → `refresh-streaming.sh` | 12 Läufe sichtbar, **0 Fehler**, je 150 Titel in ~4 min |
| `streaming_checked_at` gesetzt | **11.061 von 11.061** Titeln |
| ältester Prüfstempel | 2026-10-28 → Katalog rotiert in **~12 Tagen** durch |
| gespeicherte Angebote älter als 21 Tage | **0–2,6 %** je Anbieter |

Was im Bestand steht, wird also zuverlässig bestätigt. Die Infrastruktur ist
nicht das Problem und wird nicht angefasst.

### Was fehlt

| Messung | Ergebnis |
|---|---|
| Titel **ohne jedes** Angebot | **7.864 von 11.061 (71 %)** |
| Legacy-Fallback auf AniList-Flags | **0 Titel** — greift nirgends mehr |
| Jahrgang 2026 ohne Angebot | 189 von 443 |
| Jahrgang 2025 ohne Angebot | 255 von 475 |
| laufende Season FALL 2026 ohne Angebot | **52 von 110 (47 %)** |
| Titel ohne deutschen **und** englischen Titel | **4.593 (41,5 %)**, davon 4.277 ohne Angebot |

Die Lücke ist **nicht** altersabhängig: 189 (2026), 255 (2025), 219 (2024),
259 (2023), 280 (2022), 278 (2021) … sie ist systematisch über alle Jahrgänge.

Der Legacy-Pfad in `streamingOffersOf()` (`lib/streaming.ts`) ist tot: er fällt
auf `anime_streaming_providers` zurück, und diese Tabelle wird vom
JustWatch-Lauf autoritativ geschrieben. Es gibt keinen Titel mehr mit Flag ohne
Angebot. Die Seite zeigt bei fehlenden Daten also **nichts**.

### Fehlerklasse A — laufende Fortsetzungsstaffeln

Reproduziert an `kikansha-no-mahou-wa-tokubetsu-desu-2nd-season` (id 11005,
geprüft 2026-11-07, 0 Angebote):

```
JustWatch DE, "A Returner's Magic Should Be Special" (2023):
  Serien-Ebene:            ['Crunchyroll']
  S1 'Staffel 1' (2023):   ['Crunchyroll']
  S2 'Staffel 2' (2026):   []            ← leer
```

Unser Matcher arbeitet dabei **fehlerfrei**: `best_match` findet die Serie,
liefert `remainder='season2'`, `pick_season` wählt korrekt Staffel 2. An diesem
Staffel-Objekt hängt bei JustWatch kein Angebot. `aggregate_offers(node, season)`
gibt eine leere Liste zurück, und weil das Skript bewusst keine Serien-Angebote
auf eine Fortsetzung überträgt, wird nichts geschrieben.

JustWatch pflegt Angebote an der Serie und an abgeschlossenen Staffeln, nicht am
neu angelegten Staffel-Objekt. Das trifft praktisch **jeden laufenden Simulcast
mit Vorgängerstaffel** — also genau die Titel, bei denen ein Besucher nachschaut.

### Fehlerklasse B — Titel-Match

Reproduziert an `gensou-suikoden` (id 2295, Jahrgang 2026, geprüft 2026-11-06,
0 Angebote):

```
JustWatch DE:  'Suikoden' / orig '幻想水滸伝' (2026)
               Angebot: Anime Digital Network Amazon Channel / FLATRATE
unsere Titel:  romaji='Gensou Suikoden', native='幻想水滸伝', de/en = leer
>> best_match: KEIN Match
```

Drei Dinge greifen ineinander:

1. **Fehlender de/en-Titel.** `search()` baut die Suchanfragen aus
   `[de or en, romaji]`. Sind de und en leer, geht nur **eine** Anfrage raus.
   Betrifft 4.593 Titel.
2. **`norm()` vernichtet CJK.** `re.sub(r"[^a-z0-9]", "", …)` macht aus
   `幻想水滸伝` einen leeren String, der in `norm_variants` herausgefiltert wird.
   Der Vergleich gegen JustWatchs `originalTitle` kann damit **nie** greifen,
   obwohl beide Seiten denselben japanischen Titel führen.
3. **Substring-Schwelle zu scharf.** `suikoden` steckt in `gensousuikoden`, aber
   die Regel verlangt `len(short)/len(long) >= 0.6`; hier sind es **0,571**.
   Der Score landet bei ~0,76 gegen eine Schwelle von 0,90.

### Dritter Punkt — Amazon-Channels

Der gemeldete Titel läuft über den **ADN-Amazon-Channel**, nicht über Aniverse.
In der Prime-Oberfläche ist er auffindbar, weil Amazon-Channels dort mitlaufen;
unser Register bildet ihn auf den Slug `adn` ab. Für den Besucher sieht es nach
Prime aus, für uns ist es ADN. `aggregate_offers` bevorzugt bereits den
Direktanbieter-Link vor dem Channel-Link — die Frage ist nicht der Link, sondern
dass die Prime-Auffindbarkeit nirgends abgebildet ist.

### Vierter Punkt — keine Messbarkeit

„Geprüft und wirklich nichts gefunden" und „nie gematcht" sind im Datenmodell
**identisch**: beide setzen nur `streaming_checked_at`. Es gibt keine Kennzahl,
keinen Alarm und keine Liste. Deshalb ist die Lücke erst aufgefallen, als ein
Mensch einen Titel von Hand nachgeschlagen hat.

### Der Hebel: JustWatch ist katalogweise abfragbar

`popularTitles` akzeptiert einen `packages`-Filter mit JustWatch-`shortName` und
blättert über `pageInfo.endCursor` / `after`, 40 Treffer pro Seite. Verifiziert:

```
packages:["ava"], objectTypes:[SHOW], genres:["ani"], monetizationTypes:[FLATRATE,ADS,FREE]
→ totalCount=257, hasNextPage=true, 40/Seite  →  257 Serien in 7 Requests
```

Der Abruf liefert pro Treffer `content.title`, **`content.originalTitle` in
Romaji** („Shingeki no Kyojin", „Kimetsu no Yaiba", „HUNTER×HUNTER"),
`originalReleaseYear`, alle Angebote mit `clearName`, `monetizationType` und
`standardWebURL`. `originalTitle` ist genau das Feld, das wir in `title_romaji`
führen — eine erheblich tragfähigere Match-Grundlage als die heutige
Rückwärtssuche über übersetzte Titel.

**Und der Abruf liefert die Staffeln mit.** Verifiziert mit demselben Filter und
einem `... on Show { seasons { content offers } }`-Block: pro Serie kommen alle
Staffeln samt **eigenen Angeboten, `audioLanguages` und `subtitleLanguages`** in
derselben Antwort. Beispiel „Attack on Titan": S1 trägt Prime/Aniverse/ADN/
Crunchyroll mit `audio=[de,en,es,ja,pl,pt]`, S2–S4 tragen Crunchyroll und RTL+.
Staffel-Genauigkeit und Sprachdaten kosten damit **keine zusätzlichen Requests**,
nur größere Antworten.

**Caveat Langläufer.** JustWatchs Staffelnummern sind nicht auf AniList
abbildbar. „One Piece" hat dort 23 Staffeln, davon S3–S17 mit
`originalReleaseYear: 0`; AniList schneidet denselben Stoff nach Arcs. Ein
Mapping über `seasonNumber` allein ist für Langläufer unbrauchbar — dort muss
über Jahr und Staffeltitel gegangen werden, und wo das nicht eindeutig ist,
bleibt es bei „kein Match" (so wie `pick_season` es heute schon hält).

Kostenvergleich: eine vollständige Katalogrunde kostet heute **11.061
Suchanfragen** über 12 Tage. Der Abgleich über alle relevanten Anbieter kostet
**~100 Requests**.

Ermittelte `shortName`s (aus den Angeboten eines Titels, nicht aus
`packages(country:DE)` — diese Liste ist mit 161 Einträgen unvollständig und
enthält die Amazon-Channels nicht):

| Anbieter | shortName | Anbieter | shortName |
|---|---|---|---|
| Crunchyroll | `cru` | Crunchyroll Amazon Channel | `cra` |
| Amazon Prime Video | `amp` | Prime Video with Ads | `pva` |
| Aniverse Amazon Channel | `ava` | Animation Digital Network | `adn` |
| ADN Amazon Channel | `ada` | Netflix | `nfx` |
| Disney Plus | `dnp` | RTL+ | `rps` |
| Joyn | `jyn` | MagentaTV | `etv` |
| WOW | `sko` | Toggo | `tog` |

### Abdeckung gegen JustWatch gemessen

Anime-Genre (`ani`), DE, FLATRATE/ADS/FREE. JustWatch bündelt Staffeln unter
einer Serie, AniList legt sie als eigene Titel an — wo wir höher liegen, ist das
dieses Staffel-Splitting, kein Überschuss.

| Anbieter | wir | JustWatch (SHOW + MOVIE) |
|---|---|---|
| Crunchyroll | 2.095 | 1.349 + 163 |
| Aniverse | 457 | 257 + 87 |
| ADN | 298 | 206 + 22 |
| **Amazon Prime Video** | **243** | **361 + 247** |
| Netflix | 487 | 507 + 331 |
| Disney+ | 76 | 274 + 575 |

Bei Prime fehlt real ein großer Teil. Bei Netflix und Disney+ enthält das
Genre `ani` viel West-Animation (Simpsons, Toy Story, Minecraft-Film), die Zahl
ist dort nach oben verzerrt — Titel wie „Bleach: TYBW" auf Disney+ fehlen
trotzdem.

### Nicht gemappte Anbieter

In Angeboten gesehen, in `CLEARNAME_TO_SLUG` nicht hinterlegt und damit still
verworfen: **HBO Max** und **HBO Max Amazon Channel** (seit kurzem in DE),
**Akibapass**, **Plaion Pictures**, **ProSieben MAXX**, **Pluto TV**.
Kauf-/Leih-Stores (Apple TV Store, maxdome, Videobuster, Freenet meinVOD,
Hugendubel, JPC, Thalia, Medimops, buy ZOXS) bleiben bewusst draußen.

## Ziele

- Der Streaming-Block ist bei aktuellen Titeln belegt. Messgröße: Titel der
  laufenden Season ohne jede Angabe sinkt von 52/110 deutlich ab.
- Ein Titel, der neu auf einen Anbieter kommt, erscheint **innerhalb eines
  Tages**, nicht nach bis zu zwölf.
- Laufende Fortsetzungsstaffeln zeigen ihren Anbieter — belegt, wo wir den
  Anbieter direkt fragen können, sonst als unbestätigt gekennzeichnet.
- Die verbleibende Lücke ist eine **abarbeitbare Liste**, nach Jahrgang
  absteigend, nicht ein unsichtbarer Zustand.
- Handarbeit bleibt erhalten: eine von Hand geprüfte Angabe wird vom Sync nicht
  wieder umgeworfen.
- Abdeckung ist eine Zahl, die man über Zeit beobachten kann.

## Nicht-Ziele

- Keine Ablösung von JustWatch. Es bleibt die Breitenquelle für alle Anbieter
  ohne eigene API.
- Kein Umbau von `refresh-streaming.sh`, Cron, Watchdog oder Backup. Die laufen.
- Keine Wiederbelebung des Legacy-Fallbacks auf AniList-Flags. AniList führt
  internationale Links (3.155 Crunchyroll-Einträge gegen 2.095 echte DE-Treffer)
  und ist für den deutschen Markt keine Quelle.
- Keine Abdeckung von Kauf-/Leih-Stores über den heutigen Stand hinaus.
- Kein separates Verwaltungsprogramm. Die Prüflisten entstehen im
  Payload-Admin; die Felder werden so geschnitten, dass ein eigenes Werkzeug sie
  später über die API lesen kann.

## Anti-Ziele

Tritt eines davon ein, ist das Projekt gescheitert, auch wenn es technisch läuft:

- **Eine unbestätigte Angabe sieht aus wie eine bestätigte.** Der Hinweis muss
  auf der Seite erkennbar sein, sonst haben wir Reichweite gegen Glaubwürdigkeit
  getauscht.
- **Handarbeit wird überschrieben.** Wer denselben Titel zweimal prüfen muss,
  prüft keinen dritten.
- **JustWatch sperrt die IP.** Am 2026-09-10 reichten dafür 4 Worker; 2 Worker
  bei ~3 req/s nach 4 Minuten. Die Grenze liegt bei 1 Worker und 1,2 s Pause,
  und sie ist nicht verhandelbar.
- **Falsche Anbieter durch einen gelockerten Matcher.** Die alte, lockere
  Heuristik hatte „Hyouge Mono" auf „Mono" gematcht. Ein zu niedriger
  Schwellwert erzeugt mehr Schaden als die Lücke, die er schließt.
- **Der Katalog ist 30 Tage lang „Neu auf <Anbieter>".** `first_seen_at` darf
  beim Auffüllen der Lücke nicht flächig auf heute gesetzt werden, sonst
  produziert die Donnerstags-News Müll.

## Rahmenbedingungen

Der Dienst läuft auf dem one.com-VPS unter Coolify, nicht auf Unraid
(siehe `CLAUDE.md`). Zugang `ssh administrator@100.64.244.17`, Docker nur mit
`sudo`. Containernamen tragen die Coolify-UUID; `/opt/otakupulse-cron/bin/docker`
ist ein Wrapper, der die Unraid-Namen übersetzt. Code liegt unter
`/srv/sites/otakupulse/app-src/`.

| Datei | Rolle heute |
|---|---|
| `frontend/src/scripts/justwatch-streaming.py` | 623 Zeilen; Suche, Matcher, `aggregate_offers`, `build_sql`, Instanz-Sperre |
| `frontend/src/scripts/crunchyroll-dub.py` | **funktionierender Crunchyroll-Content-API-Client**: anonymer Web-Token, `SERIES_API`, `SEARCH_API`, Staffel-Auflösung. Holt heute nur Sprachen. |
| `frontend/src/scripts/wikipedia-dub.py` | Dub-Sprachen aus Wikipedia |
| `frontend/src/lib/streaming.ts` | Anbieter-Register, `streamingOffersOf`, `groupOffersByProvider`, Legacy-Pfad |
| `frontend/src/lib/streamingText.ts` | Texte des Streaming-Blocks |
| `frontend/src/lib/platformLists.ts` | `/plattform/[slug]/[filter]`, `MIN_LIST_SIZE = 10` |
| `frontend/src/components/StreamingBox.tsx` | Darstellung auf `/anime/[slug]` |
| `frontend/src/scripts/generate-recurring-news.ts` | `--platform-new`, `--platform-leaving` |
| `/opt/otakupulse-cron/refresh-streaming.sh` | Cron, `--stale 150`, alle 4 h |
| `/opt/otakupulse-cron/otakupulse-sync.sh` | täglich 04:15, darin `justwatch-streaming.py --recent 3` |

Tabellen: `anime_streaming_offers` (`_parent_id`, `provider`, `monetization`,
`url`, `audio`, `subs`, `seasons`, `episodes`, `available_to`, `first_seen_at`,
`last_seen_at`), `anime_streaming_providers` (`parent_id`, `value`),
`anime_available_languages` (nur additiv befüllt).

Wichtig zur Schreiblogik: `build_sql` macht `DELETE` + `INSERT` pro Titel und
setzt `last_seen_at = now()` für **jedes** geschriebene Angebot. `last_seen_at`
ist damit kein Beleg für „heute beim Anbieter gesehen", sondern für „heute
geschrieben". `first_seen_at` bleibt pro `(provider, monetization)` erhalten.

`--recent N` filtert auf `created_at`, also auf **neu importierte** Titel, nicht
auf Titel, die neu auf eine Plattform kommen. Deshalb hilft der Tageslauf bei
Katalogbewegungen nicht.

Die Instanz-Sperre nutzt `pgrep -f "src/scripts/justwatch-streaming.py"` und
schließt nur eigene PID und direktes Elternteil aus. Ein Aufruf über eine Shell,
deren Kommandozeile den Skriptpfad enthält, löst einen Fehlalarm aus. Für Cron
(Aufruf aus `refresh-streaming.sh`) ist das unkritisch, für Handläufe eine Falle.

## Entscheidungen

Vom Auftraggeber entschieden:

1. **Ganzer Katalog ist das Ziel, Priorität neu vor alt.**
2. **Unbestätigte Angaben werden angezeigt**, mit Hinweis „nicht bestätigt" —
   ausdrücklich auch, weil sie dann als Prüfliste taugen: lieber nur die
   unbestätigten von Hand prüfen als alle.
3. **Prüfung im Payload-Admin**, ein eigenes Verwaltungsprogramm ist Zukunft.
4. **Unbestätigte Einträge zählen in den Plattform-Listen und in „Neu auf
   <Anbieter>" voll mit.**

Als Entscheidung des Autors dieses Dokuments, nicht abgestimmt:

5. **Drei Qualitätsstufen** statt der heutigen zwei. Neues Feld am Angebot
   (Vorschlag: `confidence` mit `confirmed` / `unconfirmed` / `rejected`), plus
   ein Herkunftsfeld (`source`: `justwatch` / `crunchyroll` / `adn` / `manual`).
   `belegt` = staffel-genau beim Anbieter bestätigt oder Angebot direkt am
   JustWatch-**Staffel**-Objekt. `unbestätigt` = von der Serien-Ebene geerbt.
   `keine Daten` = kein Angebot, kein Match.
   Weil der Katalog-Abgleich die Staffeln mitliefert (siehe Befund), ist der
   Regelfall dort **`confirmed`**, nicht `unconfirmed` — `unconfirmed` entsteht
   nur, wo JustWatch das Staffel-Objekt leer führt, die Serie den Anbieter aber
   trägt. Das ist genau Fehlerklasse A.
6. **Unbestätigte Angebote tragen den Serien-Deep-Link** von JustWatch. Das ist
   ein echter Link zum Titel beim Anbieter, keine Startseite — die Regel
   „Anbieter ohne Deep-Link werden nicht übernommen" bleibt gewahrt.
7. **Unbestätigte Angebote tragen keine Sprach- und Episodenangaben** und
   speisen `anime_available_languages` nicht. Was wir nicht belegen, behaupten
   wir nicht im Detail.
8. **Handarbeit gewinnt gegen den Sync.** `source='manual'` wird von
   `build_sql` nicht gelöscht und nicht überschrieben. Das ist eine echte
   Änderung: der Lauf ist heute kompromisslos autoritativ.
9. **Die Donnerstags-News kennzeichnet unbestätigte Titel im Text.** Die Liste
   zählt sie mit (Entscheidung 4), aber ein Artikel behauptet nichts Unbelegtes.
10. **Crunchyroll bekommt eine Direktquelle, ADN nur unter Vorbehalt.** Für
    Crunchyroll wird der vorhandene Client aus `crunchyroll-dub.py` zur
    Verfügbarkeits-Quelle erweitert — er löst Staffeln schon heute auf und
    beantwortet damit genau die Frage, an der JustWatch bei Fehlerklasse A
    scheitert. Liefert `confirmed`. Umfang: **nur `RELEASING` plus laufender und
    vorheriger Jahrgang**, nicht der Gesamtkatalog. Der Token ist ein anonymer
    Web-Client-Token in einer Grauzone; 11.000 Suchanfragen pro Runde darüber
    würden auch den bestehenden Dub-Sync in eine Sperre ziehen. Breite kommt aus
    dem Katalog-Abgleich (11), nicht von hier.
    **NACHTRAG 2026-11-09, spaeter am Tag: ADN IST VERIFIZIERT.** Der Befund unten
    war unvollstaendig — geprueft wurde nur der Header `X-Target-Distribution`, und das
    ist genau die eine Variante, die NICHT wirkt. Vom VPS aus gemessen liefert
    `GET https://gw.api.animationdigitalnetwork.com/show/catalog?limit=5&lang=de`
    den **deutschen** Katalog: `languages: {vostde: 5}` und Deep-Links mit `/de/`-Praefix
    (`https://animationdigitalnetwork.com/de/video/1433-suikoden`). Ebenso wirken
    `?country=de` und ein `Referer: https://animationdigitalnetwork.com/de`.
    NICHT wirken: `X-Target-Distribution: de` und `Accept-Language: de-DE` (beide
    liefern `vostf`/`vf`), ein `/de/`-Pfadpraefix (HTTP 403) und die Hosts
    `de.gw.api.…` und `gw.api.….de` (beide ohne Verbindung). `?language=de` und
    `?distribution=de` geben HTTP 400.
    Damit ist eine ADN-Direktquelle nach dem Muster von Task 14 moeglich. Der Plan sah
    dafuer eine eigene Aufgabe vor; sie wurde in diesem Durchlauf NICHT gebaut (siehe
    Ledger-Ruling R39).

    **Ursprünglicher, unvollstaendiger Befund.** Gemessen am 2026-11-09:
    `GET https://gw.api.animationdigitalnetwork.com/show/catalog?limit=50`
    antwortet HTTP 200 mit `{shows:[…], total:…}`, `limit=200` bereits HTTP 400.
    Der erste Eintrag ist wörtlich unser Regressionsfall (`title='Suikoden'`,
    `originalTitle='Gensô Suikoden'`, `reference='suikoden_tv'`).
    **Aber:** die Antwort ist mit `X-Target-Distribution: de` und mit `: fr`
    byte-identisch (152.423 Bytes) und führt `languages: {vostf: 43, vf: 14}` —
    also den **französischen** Katalog. Die Deep-Links kommen ohne `/de/`-Präfix,
    während unsere Bestands-Links es tragen. Ein deutscher Zugang wurde **nicht**
    gefunden. Aufgabe für den Builder: deutschen Endpunkt oder Parameter
    verifizieren; gelingt das nicht, **bleibt ADN bei JustWatch** — der
    Regressionsfall `gensou-suikoden` wird dann über (11) und (15) gelöst, denn
    ADN liefert ihn im Katalog-Abgleich unter `ada`/`adn`.
11. **Katalog-Abgleich pro Anbieter wird die Abdeckungs-Quelle.** Pro Anbieter
    den vollen DE-Anime-Katalog blättern, gegen unsere Titel abgleichen, Treffer
    nachtragen und Phantom-Einträge melden. Match über `originalTitle` (Romaji)
    + `originalReleaseYear` gegen `title_romaji`/`season_year` — nicht über die
    heutige Rückwärtssuche. Die Titelsuche bleibt für Titel, die im
    Katalog-Abgleich nicht auftauchen.
12. **Kadenz:** laufende Season täglich, danach Rotation nach Jahrgang
    gewichtet (neu vor alt) statt stur nach ältestem Stempel. Das Gesamtvolumen
    bleibt im heutigen Rahmen, weil der Katalog-Abgleich den Großteil der
    Abdeckung für ~100 Requests erledigt.
13. **`verified_at` getrennt von `checked_at`.** „Wir haben nachgesehen und es
    gibt wirklich nichts" muss von „wir haben keinen Match gefunden" zu
    unterscheiden sein, sonst bleibt die Lücke unmessbar.
14. **Nicht gemappte Anbieter nachtragen:** HBO Max (+ Amazon Channel),
    Akibapass, Plaion Pictures, ProSieben MAXX, Pluto TV. Mit Slug im Register
    `lib/streaming.ts`, damit sie nicht länger still verworfen werden.
15. **Matcher-Korrekturen** (Fehlerklasse B), jede einzeln gegen den Bestand
    nachgewiesen, bevor sie bleibt:
    - `norm()` darf CJK nicht vernichten; der native Titel muss gegen
      `originalTitle` matchbar werden.
    - Der native Titel wird eine zusätzliche Suchanfrage, wenn de und en fehlen.
    - Die Substring-Längenschwelle von 0,6 ist an Fällen wie
      `suikoden` ⊂ `gensousuikoden` (0,571) zu scharf — Korrektur nur mit
      Gegenprobe auf Falschtreffer.
16. **Alarm:** wenn ein Titel der laufenden Season nach dem Lauf weder
    `confirmed` noch `unconfirmed` noch `verified_at` hat, gehört er in eine
    Meldung, nicht in die Stille.

Aus dem Builder-Gegencheck nachgetragen, ebenfalls Entscheidungen des Autors:

17. **Unbestätigte Angebote erben die Monetarisierung — aber nur `flatrate`.**
    `monetization = NULL` wäre eine stille Falle: `lib/platformLists.ts` filtert
    in `filterCondition`, `platformListCounts` und `platformListPage` hart auf
    `o.monetization IN ('flatrate','ads','free')` (Zeilen 119, 128, 139, 166),
    ebenso `generate-recurring-news.ts`. Mit NULL fielen unbestätigte Einträge
    aus genau den Flächen heraus, in denen sie laut Entscheidung 4 mitzählen
    sollen — bei gleichzeitig sichtbarem Eintrag auf der Anime-Seite.
    Gegenprobe: `isStreamingOffer()` in `lib/streaming.ts` behandelt NULL als
    Stream, die SQL-Ebene nicht. Deshalb geerbtes `flatrate`.
    **Unbestätigte Einträge erscheinen nie in den `ads`/`free`-Listen**
    (`platformLists.ts:86`, `:172`). „Kostenlos" ist eine Behauptung, die ein
    geerbter Eintrag nicht tragen kann.
18. **`verified_at` wird vom vollständigen Durchlauf gesetzt.** Wurde ein Titel
    in einem kompletten Sweep über **alle** gemappten Anbieter nirgends
    gefunden, ist das der Nachweis „in DE nicht im Stream" — das ist die
    eigentliche Stärke des Katalog-Abgleichs. Der nächste Sweep (wöchentlich,
    ~100 Requests) schreibt den Stempel neu, damit ergibt sich der Verfall von
    selbst; ein separates Ablaufdatum braucht es nicht. Die Prüfliste für
    Handarbeit sind damit **nicht** die 7.864 Titel ohne Angebot, sondern die
    `unconfirmed`-Einträge plus die Titel ohne `verified_at`.
19. **Der öffentliche Text unterlässt die Behauptung ohne `verified_at`.**
    `lib/streamingText.ts` liefert heute bei `!s.hasStream` die Meta-Description
    „… aktuell bei keinem Anbieter in Deutschland im Abo- oder Gratis-Stream" —
    für alle 7.864 Titel, also genau die Unwahrheit, die dieses Dokument im
    Intent beklagt. Mit `verified_at` wird die Aussage wahr und darf bleiben;
    ohne `verified_at` muss sie entfallen (neutrale Variante ohne Aussage zur
    Verfügbarkeit). Betrifft `streamingText.ts` (Description und
    `streamingMetaTitle`), `components/StreamingBox.tsx` und die Tests
    `lib/streamingText.test.ts`, `lib/seo.test.ts`.
20. **Unbestätigte Angebote gehen nicht in die maschinenlesbaren Flächen.**
    Kein `WatchAction`/`potentialAction` (`lib/seo.ts:119` `watchActionsLd`,
    `:173`), und ein Titel wird durch ein unbestätigtes Angebot nicht
    sitemap-würdig (`lib/sitemap.ts`). Eine falsche „Ansehen"-Box bei Google ist
    derselbe Glaubwürdigkeitsschaden wie Anti-Ziel 1, nur außerhalb der Seite.
    Auf der Seite selbst bleibt der Eintrag sichtbar — das ist der Punkt von
    Entscheidung 2.
21. **Eine von Hand verworfene Angabe braucht einen Veto-Eintrag.**
    Entscheidung 8 schützt nur manuelle Positiv-Einträge. `build_sql` macht
    `DELETE` + `INSERT` pro Titel; löscht ein Redakteur einen Falschtreffer,
    steht er nach spätestens vier Stunden wieder da — und Falschtreffer sind
    genau der häufigste Prüffall. Deshalb eine Veto-Zeile pro
    `(provider, monetization)` mit `confidence='rejected'`, `source='manual'`,
    die der Sync respektiert und nicht löscht.
    **Schutzgranularität: pro Zeile, nicht pro Titel.** Ein eingefrorener Titel
    würde künftige echte Neuzugänge verpassen.
22. **Neue Anbieter aus (14) bekommen nur eine Abbildung, keine öffentliche
    Seite.** HBO Max, Akibapass, Plaion Pictures, ProSieben MAXX und Pluto TV
    werden gemappt, damit sie nicht länger still verworfen werden — ohne
    `region: 'DE'`, also ohne `/plattform/<slug>`-Seite, ohne `blurb`/`about`/
    Logo. Welche davon faktisch Store- oder Free-TV-Einträge sind
    (`store: true`), entscheidet der Builder am gemessenen `monetizationType`.
    Öffentliche Plattform-Seiten dafür sind ein eigenes, späteres Vorhaben.
23. **Abnahmeziel beziffert:** von den 110 Titeln der laufenden Season haben
    danach **höchstens 10** keine Angabe, und **keiner** davon steht ohne
    `verified_at` da. Beide Regressionsfälle müssen grün sein. Wird das ohne die
    Crunchyroll-Direktquelle (10) erreicht, darf sie in eine zweite Stufe.

## Was dem Builder überlassen bleibt

- Schnitt der neuen Felder: zusätzliche Spalten an `anime_streaming_offers`
  gegen eine eigene Tabelle. Payload-Migration gehört dazu.
- Ob der Katalog-Abgleich ein eigenes Skript wird oder ein Modus von
  `justwatch-streaming.py`. Die Instanz-Sperre muss in beiden Fällen greifen —
  zwei parallele Läufe gegen JustWatch sind das Anti-Ziel.
- Form der Prüflisten im Payload-Admin: gespeicherte Filter, eigene Spalte,
  eigene View.
- Genaues Kadenz-Schema (Gewichte, Batch-Größen), solange 1 Worker und 1,2 s
  Pause eingehalten werden.
- Wie der Abdeckungswert festgehalten wird, damit er über Zeit vergleichbar ist.
- Wie der Prime-Hinweis am Anbieter (Entscheidung 25) auf der Anime-Seite
  formuliert und platziert wird.
- Reihenfolge der Umsetzung. Empfehlung: Messbarkeit (13, 16) zuerst, weil ohne
  sie keine Wirkung nachweisbar ist; dann Matcher (15) und Register (14), weil
  billig und sofort wirksam; dann Katalog-Abgleich (11); dann Direktquellen
  (10); dann Qualitätsstufen und UI (5–9); Kadenz (12) zuletzt.

## Prüfbare Ausgangswerte

Für die Abnahme festgehalten, Stand 2026-11-09:

| Kennzahl | Wert |
|---|---|
| Titel gesamt | 11.061 |
| ohne jedes Angebot | 7.864 (71,1 %) |
| laufende Season FALL 2026 ohne Angebot | 52 von 110 |
| Jahrgang 2026 ohne Angebot | 189 von 443 |
| Titel ohne de- und en-Titel | 4.593 |
| Crunchyroll / Aniverse / ADN / Prime (Titel) | 2.095 / 457 / 298 / 243 |
| ältester Prüfstempel | 2026-10-28 |
| Rotationsdauer Gesamtkatalog | ~12 Tage |

Zwei Einzelfälle als Regressionsproben:

- `kikansha-no-mahou-wa-tokubetsu-desu-2nd-season` — muss Crunchyroll zeigen.
- `gensou-suikoden` — muss ADN zeigen.

## Nach dem Gegencheck vom Auftraggeber entschieden

24. **Vererbung: engste Lesart.** Trägt die Serie einen Anbieter, das
    Staffel-Objekt bei JustWatch aber nicht, wird der Anbieter **nur auf den
    einen Titel vererbt, den der Matcher gewählt hat**, und nur solange dieser
    läuft (`status='RELEASING'`) oder zum laufenden Jahrgang gehört. Als
    `unconfirmed`.
    Begründung: bei einem laufenden Simulcast liegt die neue Staffel praktisch
    immer beim Anbieter der Vorgängerstaffel — das Risiko ist nahe null, und der
    gemeldete Fall `kikansha-no-mahou-wa-tokubetsu-desu-2nd-season` ist damit
    gelöst. Die weite Lesart (alle Staffeln, Specials und Filme einer Serie)
    hätte bis zu zwei Größenordnungen mehr Einträge erzeugt — bei 1.349
    JustWatch-Serien gegen 2.095 Crunchyroll-Titel und 7.864 leeren Titeln — und
    damit alte Staffeln mit dem Logo eines Anbieters versehen, bei dem sie nicht
    liegen. Weil unbestätigte Einträge laut Entscheidung 4 voll in die
    Plattform-Listen zählen und `MIN_LIST_SIZE = 10` dadurch neue indexierbare
    Seiten freischaltet, wäre das die wahrscheinlichste Stelle für das
    Anti-Ziel „falsche Anbieter" gewesen.
    **Alte Fortsetzungen bleiben also leer, bis sie belegt sind.** Das ist
    gewollt.
25. **Amazon-Channel-Titel werden nicht als Prime geführt.** Ein Titel auf dem
    ADN-, Aniverse- oder Crunchyroll-Amazon-Channel bleibt unter seiner Marke und
    erscheint **nicht** in `/plattform/amazon-prime-video`. Stattdessen trägt der
    Anbieter auf der Anime-Seite den Hinweis, dass er über Prime buchbar ist.
    Begründung: ein Channel-Abo ist **nicht** im Prime-Abo enthalten. Die
    Register-Variante hätte die größte gemessene Lücke (Prime 243 gegen 361+247)
    sofort geschlossen, dafür aber Verfügbarkeit im Prime-Abo behauptet, die es
    nicht gibt — und hunderte Titel samt Sitemap und Listenzahlen verschoben.
    Die Prime-Lücke wird über den Katalog-Abgleich (11) geschlossen, nicht über
    das Register.
    Der gemeldete Fall `gensou-suikoden` bleibt damit ein ADN-Titel; dass er in
    der Prime-Oberfläche auffindbar ist, erklärt künftig der Hinweis.

Damit sind keine Fragen offen.
