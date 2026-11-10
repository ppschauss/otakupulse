# Streaming-Verfügbarkeit dauerhaft aktuell halten — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Streaming-Angaben decken den Katalog ab, laufende Staffeln erscheinen innerhalb eines Tages, und die verbleibende Lücke ist eine abarbeitbare Liste statt eines unsichtbaren Zustands.

**Architecture:** Die Abfragerichtung dreht sich: statt 11.061 Titelsuchen pro Runde wird pro Anbieter dessen vollständiger DE-Anime-Katalog geblättert (`popularTitles` mit `packages`-Filter, Staffeln und Sprachen inklusive, ~100 Requests). Jedes Angebot trägt künftig `confidence` (`confirmed`/`unconfirmed`/`rejected`) und `source`; die Darstellung, die Listen, die News und die strukturierten Daten behandeln unbestätigte Angaben unterschiedlich. Ein `streamingVerifiedAt` am Anime trennt „nachgesehen, es gibt wirklich nichts" von „nie gematcht". Die Titelsuche bleibt als Rückfall für Titel, die im Katalog nicht auftauchen.

**Tech Stack:** Next.js 15 / Payload 3 (TypeScript, vitest), Python 3.11 mit `curl_cffi` (TLS-Impersonation) für die Scraper, PostgreSQL 16, Cron auf dem VPS.

**Spec:** `docs/superpowers/specs/2026-11-09-streaming-aktualitaet-design.md`

## Global Constraints

- **Rate-Limit JustWatch, nicht verhandelbar:** `MAX_WORKERS = 1`, `REQUEST_PAUSE = 1.2`, Backoff `(30, 60, 120)` bei HTTP 403/429. Nie zwei Instanzen parallel — die Instanz-Sperre (`other_instance_running()`) gilt für jeden neuen Modus und jedes neue Skript.
- **Anbieter ohne Deep-Link werden nicht übernommen.** Lieber „nicht gelistet" als ein Link auf eine Startseite.
- **`first_seen_at IS NULL` bedeutet „seit Beginn bekannt".** Jeder Erst-/Entdeckungslauf schreibt NULL, nie `now()` — sonst ist der Katalog 30 Tage lang „Neu auf <Anbieter>" (Anti-Ziel). `ECHT_NEU` in `generate-recurring-news.ts` setzt genau darauf auf.
- **Unbestätigte Angebote tragen `monetization = 'flatrate'`**, niemals `ads` oder `free`.
- **Schema-Änderungen** gehen nie automatisch in Produktion. Einmalig: `docker exec --env-file frontend/secrets.env -e NODE_ENV=development otakupulse-enrich sh -lc 'cd /app && npx tsx src/scripts/db-push.ts'`, danach `npm run generate:types`.
- **Produktion ist der one.com-VPS** (`ssh administrator@100.64.244.17`, Docker nur mit `sudo`, Containernamen via `/opt/otakupulse-cron/bin/docker`). Auf Unraid wird der Dienst **nicht** gestartet (`CLAUDE.md`). Unit-Tests laufen lokal.
- **Tests:** TypeScript `cd frontend && npm test` (vitest). Python `cd frontend && python3 -m pytest src/scripts/tests/ -v`; `curl_cffi` ist lokal **nicht** installiert, die Testdateien stubben es vor dem Import (siehe Task 6, Schritt 1).
- **Sprache:** Kommentare, Docstrings und alle nutzersichtbaren Texte auf Deutsch.
- **Abnahmeziel:** von den 110 Titeln der laufenden Season höchstens 10 ohne Angabe, keiner davon ohne `streamingVerifiedAt`. Regressionsfälle `kikansha-no-mahou-wa-tokubetsu-desu-2nd-season` (Crunchyroll) und `gensou-suikoden` (ADN) grün.

## Review Focus

Fünf Eingaben, die die Spec voraussetzt, ohne sie zu benennen. Jede bekommt ihren Test in der Aufgabe, die den Code besitzt.

1. **JustWatch antwortet mitten im Katalog-Abgleich mit 403/429.** Ein abgebrochener Durchlauf darf **nicht** als „Titel nirgends gefunden" gelten und `streamingVerifiedAt` nicht setzen, sonst verifiziert ein Netzwerkfehler den halben Katalog als nicht verfügbar. → Test in Task 10.
2. **Ein Titel verliert einen Anbieter wirklich** (Lizenz endet). Das autoritative Löschen muss trotz Handarbeits- und Veto-Schutz weiter funktionieren, sonst friert der erste Prüfvorgang den Bestand ein. → Test in Task 12.
3. **Derselbe Anbieter kommt doppelt** (Direktanbieter + Amazon Channel, z. B. `Crunchyroll` und `Crunchyroll Amazon Channel`). Es darf genau eine Zeile pro `(provider, monetization)` entstehen, mit dem Direktanbieter-Link. → Test in Task 9.
4. **Gleicher Titel, anderes Werk.** „One Piece" 1999 (Anime) gegen die Netflix-Realserie 2023; „Suikoden" 2026 gegen „Die Rebellen vom Liang Shan Po" 1973 (`originalTitle: 'Suikoden'`). Der Jahres-Tie-Break muss im Katalog-Match genauso greifen wie heute in `best_match`. → Test in Task 9.
5. **Hentai-Titel.** Alle Listen- und News-Abfragen filtern heute `a.is_hentai IS NOT TRUE`. Neue Schreibwege dürfen diese Titel nicht über die Offers in öffentliche Flächen tragen. → Test in Task 10.

---

## File Structure

**Neu:**
- `frontend/src/scripts/justwatch-catalog.py` — Katalog-Abgleich pro Anbieter: Abruf, Paginierung, Zuordnung, Schreiben. Eigenes Skript, weil es die umgekehrte Abfragerichtung ist; teilt Rate-Limit, Instanz-Sperre und `psql()` per Import mit `justwatch-streaming.py`.
- `frontend/src/scripts/tests/__init__.py`, `frontend/src/scripts/tests/conftest.py` — Stub für `curl_cffi`, damit die Scraper ohne Netzwerk importierbar sind.
- `frontend/src/scripts/tests/test_matcher.py` — Titel-Normalisierung und `best_match` (Task 6).
- `frontend/src/scripts/tests/test_catalog.py` — Katalog-Parsing und Zuordnung (Tasks 8–10).
- `frontend/src/lib/streamingConfidence.ts` — Vertrauensstufen: Typen, Prädikate, Labels. Eigene Datei, weil `streaming.ts` (430 Zeilen) sonst zur Sammelstelle wird und Listen, SEO, News und Box alle dieselben Prädikate brauchen.

**Geändert:**
- `frontend/src/collections/Anime.ts:112-148` — `confidence`, `source` am Angebot; `streamingVerifiedAt` am Anime.
- `frontend/src/lib/streaming.ts` — `StreamingOffer` trägt die neuen Felder; `streamingSummary` bekommt `hasUnconfirmed`.
- `frontend/src/lib/streamingText.ts:85-108` — Behauptung nur mit Nachweis.
- `frontend/src/components/StreamingBox.tsx` — Kennzeichnung unbestätigter Anbieter.
- `frontend/src/lib/seo.ts:119-175` — keine `WatchAction` für unbestätigte Angebote.
- `frontend/src/lib/sitemap.ts` — unbestätigte Angebote machen keinen Titel sitemap-würdig.
- `frontend/src/lib/platformLists.ts:79-100` — Gratis-Filter schließt unbestätigte aus.
- `frontend/src/scripts/generate-recurring-news.ts:482-600` — Kennzeichnung im Artikeltext.
- `frontend/src/scripts/justwatch-streaming.py` — Matcher-Korrekturen, Vererbung, Veto-Schutz, Kadenz.
- `frontend/src/scripts/crunchyroll-dub.py` — zusätzlich Verfügbarkeit, nicht nur Sprachen.
- `/opt/otakupulse-cron/*` und `/etc/cron.d/otakupulse` auf dem VPS — Kadenz (Task 15).

---

### Task 1: Schema und Typen für Vertrauensstufen

**Files:**
- Create: `frontend/src/lib/streamingConfidence.ts`
- Modify: `frontend/src/collections/Anime.ts:112-148`, `frontend/src/lib/streaming.ts`
- Test: `frontend/src/lib/streamingConfidence.test.ts`, `frontend/src/lib/streaming.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `type Confidence = 'confirmed' | 'unconfirmed' | 'rejected'`; `type OfferSource = 'justwatch' | 'crunchyroll' | 'adn' | 'manual'`; `isConfirmed(o: { confidence?: Confidence | null }): boolean` (NULL gilt als `confirmed` — der Bestand hat das Feld nicht); `isUnconfirmed(o): boolean`; `UNCONFIRMED_LABEL = 'Staffel nicht bestätigt'`. `StreamingOffer` in `lib/streaming.ts` trägt zusätzlich `confidence: Confidence | null` und `source: OfferSource | null`.

- [ ] **Step 1: Write the failing test** in `frontend/src/lib/streamingConfidence.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { isConfirmed, isUnconfirmed, UNCONFIRMED_LABEL } from './streamingConfidence'

describe('isConfirmed', () => {
  it('behandelt fehlende confidence als belegt (Altbestand ohne Feld)', () => {
    expect(isConfirmed({})).toBe(true)
    expect(isConfirmed({ confidence: null })).toBe(true)
    expect(isConfirmed({ confidence: 'confirmed' })).toBe(true)
  })
  it('erkennt unbestätigt und verworfen als nicht belegt', () => {
    expect(isConfirmed({ confidence: 'unconfirmed' })).toBe(false)
    expect(isConfirmed({ confidence: 'rejected' })).toBe(false)
  })
})

describe('isUnconfirmed', () => {
  it('ist nur für unconfirmed wahr', () => {
    expect(isUnconfirmed({ confidence: 'unconfirmed' })).toBe(true)
    expect(isUnconfirmed({ confidence: 'rejected' })).toBe(false)
    expect(isUnconfirmed({})).toBe(false)
  })
})

describe('UNCONFIRMED_LABEL', () => {
  it('ist der Text, den Box und News verwenden', () => {
    expect(UNCONFIRMED_LABEL).toBe('Staffel nicht bestätigt')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/streamingConfidence.test.ts`
Expected: FAIL — `Cannot find module './streamingConfidence'`

- [ ] **Step 3: Implement `frontend/src/lib/streamingConfidence.ts`**

Die Typen und Prädikate aus dem Interfaces-Block. `isConfirmed` behandelt `null`/`undefined` bewusst als belegt, damit die 3.197 Bestandszeilen ohne das Feld ihre Darstellung behalten.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/streamingConfidence.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for the Payload-Durchreichung** in `frontend/src/lib/streaming.test.ts` (an `describe('streamingOffersOf', …)` anhängen)

```ts
it('reicht confidence und source durch', () => {
  const anime = {
    streamingOffers: [
      { provider: 'crunchyroll', url: 'https://crunchyroll.com/x', monetization: 'flatrate', confidence: 'unconfirmed', source: 'justwatch' },
    ],
  }
  const [v] = streamingOffersOf(anime)
  expect(v.offer.confidence).toBe('unconfirmed')
  expect(v.offer.source).toBe('justwatch')
})
it('setzt confidence und source auf null, wenn das Angebot sie nicht trägt', () => {
  const anime = { streamingOffers: [{ provider: 'netflix', url: 'https://netflix.com/x', monetization: 'flatrate' }] }
  const [v] = streamingOffersOf(anime)
  expect(v.offer.confidence).toBeNull()
  expect(v.offer.source).toBeNull()
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/streaming.test.ts`
Expected: FAIL — `confidence` ist `undefined`, nicht `'unconfirmed'`

- [ ] **Step 7: Extend `StreamingOffer` and `streamingOffersOf` in `frontend/src/lib/streaming.ts`**

Zwei Felder zum Typ, zwei Zeilen in das Offer-Literal in `streamingOffersOf` (Muster: `availableTo: o.availableTo ?? null`). Unbekannte Werte auf `null` normalisieren, nicht durchreichen.

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS, alle Dateien

- [ ] **Step 9: Add the Payload fields in `frontend/src/collections/Anime.ts`**

Im `streamingOffers`-Array (nach dem `provider`/`monetization`-Row) eine weitere `type: 'row'` mit:
- `{ name: 'confidence', type: 'select', options: ['confirmed','unconfirmed','rejected'], index: true, admin: { description: 'belegt / Serien-Angebot geerbt / von Hand verworfen' } }`
- `{ name: 'source', type: 'select', options: ['justwatch','crunchyroll','adn','manual'], index: true }`

Am Anime selbst, direkt neben `streamingCheckedAt` (Zeile 99):
- `{ name: 'streamingVerifiedAt', type: 'date', index: true, admin: { description: 'Zuletzt über ALLE Anbieter-Kataloge nachgesehen — Nachweis für „in DE nicht im Stream".' } }`

- [ ] **Step 10: Typecheck and regenerate types**

Run: `cd frontend && npm run typecheck && npm run generate:types`
Expected: beide ohne Fehler

- [ ] **Step 11: Commit**

```bash
git add frontend/src/lib/streamingConfidence.ts frontend/src/lib/streamingConfidence.test.ts \
        frontend/src/lib/streaming.ts frontend/src/lib/streaming.test.ts \
        frontend/src/collections/Anime.ts frontend/src/payload-types.ts
git commit -m "Streaming: Vertrauensstufen (confidence/source) und streamingVerifiedAt im Schema"
```

- [ ] **Step 12: Schema auf dem VPS pushen**

Run: `ssh administrator@100.64.244.17 'sudo /opt/otakupulse-cron/bin/docker exec --env-file /srv/sites/otakupulse/app-src/frontend/secrets.env -e NODE_ENV=development otakupulse-enrich sh -lc "cd /app && npx tsx src/scripts/db-push.ts"'`
Expected: `✓ Schema-Push abgeschlossen.`

Gegenprobe: `SELECT confidence, source FROM anime_streaming_offers LIMIT 1;` und `SELECT streaming_verified_at FROM anime LIMIT 1;` laufen ohne Fehler.

---

### Task 2: Darstellung unterscheidet belegt und unbestätigt

**Files:**
- Modify: `frontend/src/lib/streaming.ts` (`streamingSummary`), `frontend/src/components/StreamingBox.tsx`, `frontend/src/lib/seo.ts:119-175`, `frontend/src/lib/sitemap.ts`
- Test: `frontend/src/lib/streaming.test.ts`, `frontend/src/lib/seo.test.ts`

**Interfaces:**
- Consumes: `isConfirmed`, `isUnconfirmed`, `UNCONFIRMED_LABEL` aus Task 1.
- Produces: `StreamingSummary` trägt zusätzlich `hasUnconfirmed: boolean`. `watchActionsLd(views)` filtert unbestätigte Angebote selbst heraus — Aufrufer müssen nichts wissen.

- [ ] **Step 1: Write the failing test** in `frontend/src/lib/streaming.test.ts`

```ts
describe('streamingSummary mit Vertrauensstufen', () => {
  const unconfirmed = { provider: 'crunchyroll', url: 'https://crunchyroll.com/x', monetization: 'flatrate', confidence: 'unconfirmed' }
  it('meldet hasUnconfirmed, zählt den Anbieter aber mit', () => {
    const s = streamingSummary({ streamingOffers: [unconfirmed] })
    expect(s.hasUnconfirmed).toBe(true)
    expect(s.hasStream).toBe(true)
    expect(s.providerNames).toEqual(['Crunchyroll'])
  })
  it('leitet aus einem unbestätigten Angebot keine Sprachen ab', () => {
    const s = streamingSummary({ streamingOffers: [{ ...unconfirmed, audio: 'de', subs: 'de' }] })
    expect(s.hasDeDub).toBe(false)
    expect(s.hasDeSub).toBe(false)
  })
  it('meldet kein hasFree für ein unbestätigtes Angebot', () => {
    const s = streamingSummary({ streamingOffers: [{ ...unconfirmed, monetization: 'free' }] })
    expect(s.hasFree).toBe(false)
  })
  it('ist bei rein belegten Angeboten unverändert', () => {
    const s = streamingSummary({ streamingOffers: [{ provider: 'netflix', url: 'https://netflix.com/x', monetization: 'flatrate', audio: 'de' }] })
    expect(s.hasUnconfirmed).toBe(false)
    expect(s.hasDeDub).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/streaming.test.ts`
Expected: FAIL — `hasUnconfirmed` ist `undefined`

- [ ] **Step 3: Extend `streamingSummary` in `frontend/src/lib/streaming.ts`**

`hasUnconfirmed` aus den Views; `hasDeDub`, `hasDeSub` und `hasFree` nur noch über `views.filter(v => isConfirmed(v.offer))` berechnen. `hasStream` und `providerNames` bleiben über alle Views — unbestätigte zählen mit (Entscheidung 4).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/streaming.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test** in `frontend/src/lib/seo.test.ts`

```ts
it('gibt für unbestätigte Angebote keine WatchAction aus', () => {
  const views = [
    { provider: providerBySlug('crunchyroll')!, offer: { provider: 'crunchyroll', url: 'https://crunchyroll.com/a', monetization: 'flatrate', audio: [], subs: [], confidence: 'unconfirmed' } },
    { provider: providerBySlug('netflix')!, offer: { provider: 'netflix', url: 'https://netflix.com/b', monetization: 'flatrate', audio: [], subs: [], confidence: 'confirmed' } },
  ] as any
  const ld = watchActionsLd(views)
  expect(ld).toHaveLength(1)
  expect(ld[0].target.urlTemplate).toBe('https://netflix.com/b')
})
it('lässt potentialAction weg, wenn alle Angebote unbestätigt sind', () => {
  const views = [
    { provider: providerBySlug('crunchyroll')!, offer: { provider: 'crunchyroll', url: 'https://crunchyroll.com/a', monetization: 'flatrate', audio: [], subs: [], confidence: 'unconfirmed' } },
  ] as any
  expect(watchActionsLd(views)).toHaveLength(0)
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/seo.test.ts`
Expected: FAIL — zwei WatchActions statt einer

- [ ] **Step 7: Filter unconfirmed offers in `watchActionsLd` (`frontend/src/lib/seo.ts:119`)**

Ein `.filter(({ offer }) => isConfirmed(offer))` vor dem `map`. In `animeLd` (Zeile 173) bleibt `potentialAction: offers.length ? … : undefined` — da `watchActionsLd` nun leer liefern kann, muss die Bedingung auf das **Ergebnis** prüfen, nicht auf die Eingabe.

- [ ] **Step 8: Unbestätigte Angebote aus der Sitemap-Auswahl nehmen**

In `frontend/src/lib/sitemap.ts` die Stelle, die `streamingOffers` für die Auswahl heranzieht, auf belegte Angebote einschränken.

- [ ] **Step 9: Kennzeichnung in `frontend/src/components/StreamingBox.tsx`**

Pro Anbieter-Karte, deren Angebote alle unbestätigt sind: ein Badge mit `UNCONFIRMED_LABEL` im Muster des bestehenden „Neu"-Badges (`rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-300`). Im Einleitungssatz bei `s.hasUnconfirmed` ergänzen: „Bei einzelnen Anbietern ist die konkrete Staffel nicht bestätigt." Sprach- und Episodenangaben für diese Karten unterdrücken.

- [ ] **Step 10: Write the failing test for the Prime-Hinweis** in `frontend/src/lib/streaming.test.ts`

```ts
describe('isAmazonChannelUrl', () => {
  it('erkennt Amazon-Channel-Deep-Links', () => {
    expect(isAmazonChannelUrl('https://watch.amazon.de/detail?gti=amzn1.dv.gti.abc')).toBe(true)
  })
  it('erkennt Direktanbieter-Links nicht als Channel', () => {
    expect(isAmazonChannelUrl('https://animationdigitalnetwork.com/de/video/1433-suikoden')).toBe(false)
    expect(isAmazonChannelUrl('https://www.crunchyroll.com/de/series/GABC')).toBe(false)
    expect(isAmazonChannelUrl(null)).toBe(false)
  })
})
```

- [ ] **Step 11: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/streaming.test.ts`
Expected: FAIL — `isAmazonChannelUrl` ist nicht exportiert

- [ ] **Step 12: Implement `isAmazonChannelUrl(url: string | null | undefined): boolean` in `frontend/src/lib/streaming.ts`**

Prüft den Host auf `watch.amazon.` — das ist der Deep-Link-Host, den JustWatch für Amazon-Channels liefert (in unserem Bestand tragen alle 457 Aniverse-Angebote ihn). Entscheidung 25: der Titel bleibt unter seiner Marke, bekommt aber den Hinweis.

- [ ] **Step 13: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/streaming.test.ts`
Expected: PASS

- [ ] **Step 14: Show the hint in `frontend/src/components/StreamingBox.tsx`**

Trägt das primäre Angebot eines Anbieters einen Amazon-Channel-Link, kommt unter den Anbieternamen die Zeile „über Amazon Prime buchbar" (`text-[11px] text-zinc-500`). Sie behauptet **nicht**, der Titel sei im Prime-Abo enthalten — genau deshalb „buchbar" und nicht „verfügbar".

- [ ] **Step 15: Run the full suite and typecheck**

Run: `cd frontend && npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 16: Commit**

```bash
git add frontend/src/lib/streaming.ts frontend/src/lib/streaming.test.ts frontend/src/lib/seo.ts \
        frontend/src/lib/seo.test.ts frontend/src/lib/sitemap.ts frontend/src/components/StreamingBox.tsx
git commit -m "Streaming: unbestaetigte Angebote kennzeichnen, Prime-Hinweis an Amazon-Channels"
```

---

### Task 3: Öffentlicher Text behauptet nichts ohne Nachweis

**Files:**
- Modify: `frontend/src/lib/streamingText.ts:85-108`, `frontend/src/components/StreamingBox.tsx`
- Test: `frontend/src/lib/streamingText.test.ts`

**Interfaces:**
- Consumes: `streamingSummary` aus Task 2; `anime.streamingVerifiedAt` aus Task 1.
- Produces: keine neuen Signaturen. `streamingMetaDescription` und `streamingMetaTitle` behalten ihre.

- [ ] **Step 1: Write the failing test** in `frontend/src/lib/streamingText.test.ts`

```ts
describe('Nichtverfügbarkeit nur mit Nachweis', () => {
  const base = { title: 'Testanime', format: 'TV', seasonYear: 2014, episodes: 22, streamingOffers: [] }
  it('behauptet Nichtverfügbarkeit, wenn verifiziert', () => {
    const d = streamingMetaDescription({ ...base, streamingVerifiedAt: '2026-11-09T00:00:00Z' })
    expect(d).toContain('bei keinem Anbieter in Deutschland')
  })
  it('behauptet sie NICHT, wenn nie verifiziert', () => {
    const d = streamingMetaDescription({ ...base, streamingVerifiedAt: null })
    expect(d).not.toContain('bei keinem Anbieter')
    expect(d).not.toContain('Gratis-Stream')
  })
  it('nennt auch ohne Nachweis Genre und Fakten', () => {
    const d = streamingMetaDescription({ ...base, streamingVerifiedAt: null })
    expect(d).toContain('Testanime')
    expect(d).toContain('22 Folgen')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/streamingText.test.ts`
Expected: FAIL — die Behauptung steht in beiden Fällen drin

- [ ] **Step 3: Split the `!s.hasStream` branch in `frontend/src/lib/streamingText.ts`**

Der bestehende Satz bleibt für `anime.streamingVerifiedAt != null`. Ohne Nachweis die neutrale Variante ohne jede Aussage zur Verfügbarkeit: „<Titel>: <kind>. Handlung, Charaktere und Episoden im Überblick." `streamingMetaTitle` behält bei `!hasStream` seinen Text — er behauptet nichts.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/streamingText.test.ts`
Expected: PASS

- [ ] **Step 5: Same split in `frontend/src/components/StreamingBox.tsx`**

Der `else`-Zweig („Aktuell ist … bei keinem Anbieter … gelistet") gilt nur mit `streamingVerifiedAt`; er nennt zusätzlich das Prüfdatum. Ohne Nachweis: „Für <Titel> liegen uns noch keine geprüften Streaming-Angebote vor." — keine Aussage über Nichtverfügbarkeit.

- [ ] **Step 6: Run the full suite**

Run: `cd frontend && npm test && npm run typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/streamingText.ts frontend/src/lib/streamingText.test.ts frontend/src/components/StreamingBox.tsx
git commit -m "Streaming: Nichtverfuegbarkeit nur mit Nachweis behaupten"
```

---

### Task 4: Plattform-Listen — unbestätigte zählen mit, aber nicht als gratis

**Files:**
- Modify: `frontend/src/lib/platformLists.ts:79-100`
- Test: `frontend/src/lib/platformLists.test.ts`

**Interfaces:**
- Consumes: Spalte `o.confidence` aus Task 1.
- Produces: `filterCondition` liefert für `kostenlos`, `deutscher-dub` und `deutscher-sub` zusätzlich die Confidence-Einschränkung; Signatur unverändert.

- [ ] **Step 1: Write the failing test** in `frontend/src/lib/platformLists.test.ts`

```ts
it('schliesst unbestaetigte Angebote aus dem Gratis-Filter aus', () => {
  const sql = filterCondition(staticFilter('kostenlos')!).sql
  expect(sql).toContain("('ads','free')")
  expect(sql).toContain("o.confidence IS DISTINCT FROM 'unconfirmed'")
})
it('schliesst unbestaetigte Angebote aus den Sprach-Filtern aus', () => {
  for (const key of ['deutscher-dub', 'deutscher-sub']) {
    expect(filterCondition(staticFilter(key)!).sql).toContain("o.confidence IS DISTINCT FROM 'unconfirmed'")
  }
})
it('laesst unbestaetigte Angebote in den uebrigen Filtern zu', () => {
  expect(filterCondition(staticFilter('filme')!).sql).not.toContain('confidence')
  expect(filterCondition(staticFilter('neu')!).sql).not.toContain('confidence')
})
it('schliesst verworfene Angebote ueberall aus', () => {
  expect(filterCondition(staticFilter('filme')!).sql).toContain("o.confidence IS DISTINCT FROM 'rejected'")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/platformLists.test.ts`
Expected: FAIL — kein `confidence` im SQL

- [ ] **Step 3: Extend `filterCondition` in `frontend/src/lib/platformLists.ts`**

`'rejected'` wird in **allen** Zweigen ausgeschlossen (eine Konstante, die jedem Fragment angehängt wird). `'unconfirmed'` zusätzlich nur bei `kostenlos`, `deutscher-dub`, `deutscher-sub` — „kostenlos" und eine Sprachfassung sind Behauptungen, die ein geerbtes Angebot nicht tragen kann. Der Genre-Zweig nutzt `$2`; die Nummerierung der Platzhalter darf sich nicht verschieben.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/platformLists.ts frontend/src/lib/platformLists.test.ts
git commit -m "Plattform-Listen: unbestaetigte Angebote nicht als gratis oder synchronisiert fuehren"
```

---

### Task 5: Donnerstags-News kennzeichnet unbestätigte Titel

**Files:**
- Modify: `frontend/src/scripts/generate-recurring-news.ts:482-600`
- Test: `frontend/src/lib/streamingConfidence.test.ts` (die reine Funktion lebt im Modul, nicht im Skript)

**Interfaces:**
- Consumes: `UNCONFIRMED_LABEL` aus Task 1.
- Produces: `offerNote(confidence: Confidence | null): string` in `lib/streamingConfidence.ts` — `''` für belegt, ` (Staffel nicht bestätigt)` für unbestätigt. `OfferRow` in `generate-recurring-news.ts` trägt zusätzlich `confidence`.

- [ ] **Step 1: Write the failing test** in `frontend/src/lib/streamingConfidence.test.ts`

```ts
describe('offerNote', () => {
  it('ist leer für belegte Angebote', () => {
    expect(offerNote(null)).toBe('')
    expect(offerNote('confirmed')).toBe('')
  })
  it('kennzeichnet unbestätigte Angebote für den Artikeltext', () => {
    expect(offerNote('unconfirmed')).toBe(' (Staffel nicht bestätigt)')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/streamingConfidence.test.ts`
Expected: FAIL — `offerNote` ist nicht exportiert

- [ ] **Step 3: Implement `offerNote` in `frontend/src/lib/streamingConfidence.ts`**

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/streamingConfidence.test.ts`
Expected: PASS

- [ ] **Step 5: Use it in `frontend/src/scripts/generate-recurring-news.ts`**

`offerRows` (Zeile 495) selektiert `o.confidence` mit; die SQL-Bedingung schließt `'rejected'` aus. Dort, wo eine Zeile als Listeneintrag formuliert wird, `offerNote(row.confidence)` an den Titel hängen. Verworfene Angebote dürfen nie in einen Artikel.

- [ ] **Step 6: Trockenlauf gegen die Produktionsdaten**

Run: `ssh administrator@100.64.244.17 'sudo /opt/otakupulse-cron/bin/docker exec --env-file /srv/sites/otakupulse/app-src/frontend/secrets.env otakupulse-enrich sh -lc "cd /app && npx tsx src/scripts/generate-recurring-news.ts --platform-new --dry"'`
Expected: Lauf ohne Fehler; in der Ausgabe tragen unbestätigte Titel den Zusatz

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/streamingConfidence.ts frontend/src/lib/streamingConfidence.test.ts \
        frontend/src/scripts/generate-recurring-news.ts
git commit -m "Plattform-News: unbestaetigte Titel im Artikeltext kennzeichnen"
```

---

### Task 6: Matcher-Korrekturen — CJK, nativer Titel, Substring-Schwelle

**Files:**
- Create: `frontend/src/scripts/tests/__init__.py`, `frontend/src/scripts/tests/conftest.py`, `frontend/src/scripts/tests/test_matcher.py`
- Modify: `frontend/src/scripts/justwatch-streaming.py:175-200` (`norm`, `norm_variants`), `:300-325` (Substring-Regel), `:435-450` (`search`-Anfragen)

**Interfaces:**
- Consumes: nichts.
- Produces: `norm_cjk(s) -> str` neben `norm` (behält CJK-Zeichen, entfernt nur Satzzeichen und Leerraum); `norm_variants` liefert zusätzlich die CJK-Form; `search()` stellt eine dritte Anfrage mit dem nativen Titel, wenn de **und** en fehlen.

- [ ] **Step 1: Write the test harness** in `frontend/src/scripts/tests/conftest.py`

```python
"""curl_cffi ist lokal nicht installiert; die Scraper brechen beim Import ohne
es ab. Für die Tests der reinen Funktionen wird ein Stub eingehängt."""
import importlib.util, sys, types
from pathlib import Path

if "curl_cffi" not in sys.modules:
    stub = types.ModuleType("curl_cffi")
    stub.requests = types.SimpleNamespace(Session=lambda **kw: None)
    sys.modules["curl_cffi"] = stub

SCRIPTS = Path(__file__).resolve().parent.parent

def load(name: str):
    """Lädt ein Scraper-Skript als Modul (Bindestrich im Dateinamen)."""
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), SCRIPTS / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
```

- [ ] **Step 2: Write the failing test** in `frontend/src/scripts/tests/test_matcher.py`

```python
from conftest import load
jw = load("justwatch-streaming")

def test_norm_cjk_behaelt_japanische_schrift():
    assert jw.norm_cjk("幻想水滸伝") == "幻想水滸伝"
    assert jw.norm_cjk("ドラゴンボール超 ビルス") == "ドラゴンボール超ビルス"

def test_norm_variants_enthaelt_die_cjk_form():
    assert "幻想水滸伝" in jw.norm_variants("幻想水滸伝")

def test_gensou_suikoden_matcht_ueber_den_nativen_titel():
    """Regressionsfall: JustWatch führt 'Suikoden' / orig '幻想水滸伝' (2026)."""
    data = {"edges": [{"node": {
        "objectType": "SHOW",
        "content": {"title": "Suikoden", "originalTitle": "幻想水滸伝", "originalReleaseYear": 2026},
        "offers": [], "seasons": [],
    }}]}
    hit = jw.best_match(data, ["", "", "Gensou Suikoden", "幻想水滸伝"], "SHOW", 2026)
    assert hit is not None
    assert hit[1] == ""

def test_rebellen_vom_liang_shan_po_matcht_nicht():
    """Review Focus 4: gleicher originalTitle 'Suikoden', Jahr 1973 statt 2026."""
    data = {"edges": [{"node": {
        "objectType": "SHOW",
        "content": {"title": "Die Rebellen vom Liang Shan Po", "originalTitle": "Suikoden", "originalReleaseYear": 1973},
        "offers": [], "seasons": [],
    }}]}
    assert jw.best_match(data, ["", "", "Gensou Suikoden", "幻想水滸伝"], "SHOW", 2026) is None

def test_hyouge_mono_matcht_nicht_auf_mono():
    """Die alte, lockere Heuristik hatte das getan — darf nicht zurückkommen."""
    data = {"edges": [{"node": {
        "objectType": "SHOW",
        "content": {"title": "Mono", "originalTitle": "Mono", "originalReleaseYear": 2025},
        "offers": [], "seasons": [],
    }}]}
    assert jw.best_match(data, ["", "Hyouge Mono", "Hyouge Mono", ""], "SHOW", 2011) is None

def test_suchanfragen_nutzen_den_nativen_titel_nur_als_rueckfall():
    assert jw.search_queries({"titles": ["", "", "Gensou Suikoden", "幻想水滸伝"]}) == ["Gensou Suikoden", "幻想水滸伝"]
    assert jw.search_queries({"titles": ["Frieren", "Frieren EN", "Sousou no Frieren", "葬送のフリーレン"]}) == ["Frieren", "Sousou no Frieren"]
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && python3 -m pytest src/scripts/tests/test_matcher.py -v`
Expected: FAIL — `norm_cjk` und `search_queries` existieren nicht

- [ ] **Step 4: Implement `norm_cjk(s) -> str` and extend `norm_variants` in `frontend/src/scripts/justwatch-streaming.py`**

`norm_cjk` entfernt Leerraum und Satzzeichen, lässt Buchstaben und Ziffern jeder Schrift stehen (`unicodedata.category`-Prüfung statt `[^a-z0-9]`). `norm_variants` hängt die Form an, wenn sie sich von `norm` unterscheidet und nicht leer ist. `norm` selbst bleibt unverändert — die lateinischen Vergleiche hängen daran.

- [ ] **Step 5: Extract `search_queries(a) -> list[str]` from `search()`**

Reine Funktion mit der heutigen Logik (`[de or en, romaji]`, dedupliziert) **plus**: ist weder `de` noch `en` gesetzt, kommt der native Titel als dritte Anfrage dazu. `search()` ruft sie auf. Maximal drei Anfragen pro Titel — das Rate-Limit bleibt unberührt, weil `api_post` die Pause hält.

- [ ] **Step 6: Lower the substring guard**

`len(short) / len(long_) >= 0.6` auf `>= 0.55` setzen. Das deckt `suikoden` ⊂ `gensousuikoden` (0,571) und lässt `journeysend` ⊂ `frierenbeyondjourneysend` (0,458) weiter draußen. Den Grund als Kommentar mit beiden Zahlen festhalten.

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd frontend && python3 -m pytest src/scripts/tests/ -v`
Expected: PASS

- [ ] **Step 8: Gegenprobe gegen echte Daten — keine neuen Falschtreffer**

Run (auf dem VPS, über ein Wrapper-Skript, damit die Instanz-Sperre nicht auf die Elternshell anspringt):
`justwatch-streaming.py --slugs gensou-suikoden,shigatsu-wa-kimi-no-uso,toradora,one-piece,naruto,frieren-beyond-journeys-end --dry-run`
Expected: `gensou-suikoden` matcht jetzt mit ADN; kein Titel bekommt einen Anbieter, den er vorher nicht hatte, außer den erwarteten.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/scripts/justwatch-streaming.py frontend/src/scripts/tests/
git commit -m "JustWatch-Matcher: CJK-Titel vergleichbar machen, nativen Titel als Rueckfall-Suche, Substring-Schwelle 0.55"
```

---

### Task 7: Anbieter-Register erweitern

**Files:**
- Modify: `frontend/src/lib/streaming.ts` (Register), `frontend/src/scripts/justwatch-streaming.py:78-112` (`CLEARNAME_TO_SLUG`)
- Test: `frontend/src/lib/streaming.test.ts`, `frontend/src/scripts/tests/test_matcher.py`

**Interfaces:**
- Consumes: nichts.
- Produces: Slugs `hbo-max`, `akibapass`, `plaion-pictures`, `prosieben-maxx`, `pluto-tv` im Register, **ohne** `region: 'DE'` (keine öffentliche `/plattform/<slug>`-Seite, Entscheidung 22).

- [ ] **Step 1: Write the failing test** in `frontend/src/lib/streaming.test.ts`

```ts
describe('neue Anbieter aus dem Katalog-Befund', () => {
  for (const slug of ['hbo-max', 'akibapass', 'plaion-pictures', 'prosieben-maxx', 'pluto-tv']) {
    it(`kennt ${slug}`, () => {
      expect(providerBySlug(slug)).toBeDefined()
    })
  }
  it('fuehrt sie nicht als DE-Plattformseite', () => {
    for (const slug of ['hbo-max', 'akibapass', 'plaion-pictures', 'prosieben-maxx', 'pluto-tv']) {
      expect(DE_PROVIDER_SLUGS).not.toContain(slug)
    }
  })
  it('matcht die JustWatch-Namen', () => {
    expect(providerByName('HBO Max')?.slug).toBe('hbo-max')
    expect(providerByName('HBO Max Amazon Channel')?.slug).toBe('hbo-max')
    expect(providerByName('Akibapass')?.slug).toBe('akibapass')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/streaming.test.ts`
Expected: FAIL — `providerBySlug('hbo-max')` ist `undefined`

- [ ] **Step 3: Add the providers to the register in `frontend/src/lib/streaming.ts`**

Im Muster der vorhandenen Einträge, mit `name`, Aliasen und `homepage`. Reihenfolge in `PROVIDER_SLUGS` bestimmt die Sortierung der Box — die neuen gehören hinter die etablierten.

- [ ] **Step 4: Write the failing Python test** in `frontend/src/scripts/tests/test_matcher.py`

```python
def test_mapping_kennt_die_neuen_anbieter():
    m = jw.CLEARNAME_TO_SLUG
    assert m["hbo max"] == "hbo-max"
    assert m["hbo max amazon channel"] == "hbo-max"
    assert m["akibapass"] == "akibapass"
    assert m["plaion pictures"] == "plaion-pictures"
    assert m["prosieben maxx"] == "prosieben-maxx"
    assert m["pluto tv"] == "pluto-tv"

def test_mapping_deckt_die_gemessenen_clearnames_ab():
    """Am 2026-11-09 in echten Angeboten gesehen."""
    for cn in ["crunchyroll", "crunchyroll amazon channel", "aniverse amazon channel",
               "animation digital network", "anime digital network amazon channel",
               "amazon prime video", "amazon prime video with ads", "netflix",
               "netflix standard with ads", "rtl+", "rtl+ max amazon channel"]:
        assert cn in jw.CLEARNAME_TO_SLUG, cn
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd frontend && python3 -m pytest src/scripts/tests/test_matcher.py -v`
Expected: FAIL — `KeyError: 'hbo max'`

- [ ] **Step 6: Extend `CLEARNAME_TO_SLUG` in `frontend/src/scripts/justwatch-streaming.py`**

Die sechs Namen aus dem Test. Am gemessenen `monetizationType` entscheiden, ob ein Anbieter als Store geführt wird; Plaion Pictures und Akibapass vorher mit einem Trockenlauf prüfen.

- [ ] **Step 7: Run both suites**

Run: `cd frontend && npm test && python3 -m pytest src/scripts/tests/ -v`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/streaming.ts frontend/src/lib/streaming.test.ts \
        frontend/src/scripts/justwatch-streaming.py frontend/src/scripts/tests/test_matcher.py
git commit -m "Anbieter-Register: HBO Max, Akibapass, Plaion, ProSieben MAXX, Pluto TV abbilden"
```

---

### Task 8: Katalog-Abgleich — Abruf und Paginierung

**Files:**
- Create: `frontend/src/scripts/justwatch-catalog.py`, `frontend/src/scripts/tests/test_catalog.py`

**Interfaces:**
- Consumes: `api_post`, `CLEARNAME_TO_SLUG`, `psql`, `other_instance_running`, `IMPERSONATE` aus `justwatch-streaming.py` (per `importlib`, wie in `conftest.py`).
- Produces: `PACKAGES: dict[str, str]` (JustWatch-`shortName` → unser Slug); `BROWSE_Q: str`; `fetch_catalog(session, short: str, object_type: str) -> tuple[list[dict], bool]` — Liste aller Knoten und ein `complete`-Flag, das `False` wird, sobald eine Seite nicht mit HTTP 200 kam; `parse_node(node) -> dict` mit `title`, `original_title`, `year`, `object_type`, `offers`, `seasons`.

- [ ] **Step 1: Write the failing test** in `frontend/src/scripts/tests/test_catalog.py`

```python
from conftest import load
cat = load("justwatch-catalog")

def test_packages_deckt_die_gemessenen_shortnames_ab():
    """shortNames am 2026-11-09 aus echten Angeboten ermittelt."""
    assert cat.PACKAGES["cru"] == "crunchyroll"
    assert cat.PACKAGES["cra"] == "crunchyroll"
    assert cat.PACKAGES["ava"] == "aniverse"
    assert cat.PACKAGES["adn"] == "adn"
    assert cat.PACKAGES["ada"] == "adn"
    assert cat.PACKAGES["amp"] == "amazon-prime-video"
    assert cat.PACKAGES["pva"] == "amazon-prime-video"
    assert cat.PACKAGES["nfx"] == "netflix"

def test_parse_node_liest_staffeln_mit_ihren_angeboten():
    node = {
        "objectType": "SHOW",
        "content": {"title": "Attack on Titan", "originalTitle": "Shingeki no Kyojin", "originalReleaseYear": 2013},
        "offers": [{"monetizationType": "FLATRATE", "standardWebURL": "https://crunchyroll.com/aot",
                    "package": {"clearName": "Crunchyroll"}, "audioLanguages": ["de"], "subtitleLanguages": ["de"]}],
        "seasons": [
            {"content": {"title": "Staffel 1", "seasonNumber": 1, "originalReleaseYear": 2013},
             "offers": [{"monetizationType": "FLATRATE", "standardWebURL": "https://crunchyroll.com/aot-s1",
                         "package": {"clearName": "Crunchyroll"}, "audioLanguages": ["de", "ja"], "subtitleLanguages": []}]},
            {"content": {"title": "Staffel 2", "seasonNumber": 2, "originalReleaseYear": 2017}, "offers": []},
        ],
    }
    p = cat.parse_node(node)
    assert p["original_title"] == "Shingeki no Kyojin"
    assert p["year"] == 2013
    assert len(p["seasons"]) == 2
    assert p["seasons"][0]["number"] == 1
    assert p["seasons"][0]["offers"][0]["provider"] == "crunchyroll"
    assert p["seasons"][1]["offers"] == []

def test_parse_node_verwirft_angebote_ohne_deeplink():
    node = {"objectType": "SHOW", "content": {"title": "X", "originalTitle": "X", "originalReleaseYear": 2020},
            "offers": [{"monetizationType": "FLATRATE", "standardWebURL": None, "package": {"clearName": "Crunchyroll"}}],
            "seasons": []}
    assert cat.parse_node(node)["offers"] == []

def test_parse_node_verwirft_ungemappte_anbieter():
    node = {"objectType": "SHOW", "content": {"title": "X", "originalTitle": "X", "originalReleaseYear": 2020},
            "offers": [{"monetizationType": "BUY", "standardWebURL": "https://thalia.de/x", "package": {"clearName": "Thalia"}}],
            "seasons": []}
    assert cat.parse_node(node)["offers"] == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && python3 -m pytest src/scripts/tests/test_catalog.py -v`
Expected: FAIL — Datei existiert nicht

- [ ] **Step 3: Implement `PACKAGES`, `BROWSE_Q` and `parse_node` in `frontend/src/scripts/justwatch-catalog.py`**

`BROWSE_Q` ist `popularTitles(country,first:40,after,filter)` mit `totalCount`, `pageInfo{endCursor hasNextPage}`, `content{title originalTitle originalReleaseYear}`, `offers{…package{clearName}}` und `... on Show { seasons { content{title seasonNumber originalReleaseYear} offers{…} } }`. Filter: `{packages:[short], objectTypes:[typ], genres:["ani"], monetizationTypes:["FLATRATE","ADS","FREE"]}`. `parse_node` wirft Angebote ohne `standardWebURL` und ohne Mapping weg (Global Constraints).

- [ ] **Step 4: Implement `fetch_catalog`**

Blättert über `pageInfo.endCursor`, bricht bei `hasNextPage == False` ab, gibt `(nodes, complete)` zurück. `complete=False`, sobald eine Antwort nicht HTTP 200 war oder `errors` trug — das ist die Grundlage für Review Focus 1. Nutzt `api_post` aus `justwatch-streaming.py`, damit Pause und Backoff gelten.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && python3 -m pytest src/scripts/tests/ -v`
Expected: PASS

- [ ] **Step 6: Trockenlauf gegen die echte API**

Run auf dem VPS: `justwatch-catalog.py --count-only`
Expected: Zählt pro Paket SHOW und MOVIE. Aniverse (`ava`) muss 257 + 87 melden, Crunchyroll (`cru`) 1349 + 163 — die am 2026-11-09 gemessenen Werte, ±Katalogbewegung.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/scripts/justwatch-catalog.py frontend/src/scripts/tests/test_catalog.py
git commit -m "Katalog-Abgleich: Abruf und Paginierung pro Anbieter"
```

---

### Task 9: Katalog-Abgleich — Zuordnung auf unsere Titel

**Files:**
- Modify: `frontend/src/scripts/justwatch-catalog.py`, `frontend/src/scripts/tests/test_catalog.py`

**Interfaces:**
- Consumes: `parse_node` aus Task 8; `norm`, `norm_cjk`, `norm_variants` aus Task 6.
- Produces: `match_node(parsed: dict, anime: list[dict]) -> dict | None` — ordnet einen Katalogknoten genau einem unserer Titel zu oder keinem; `dedupe_offers(offers: list[dict]) -> list[dict]` — eine Zeile pro `(provider, monetization)`, Direktanbieter-Link vor Amazon-Channel-Link.

- [ ] **Step 1: Write the failing test** in `frontend/src/scripts/tests/test_catalog.py`

```python
ANIME = [
    {"id": 1, "slug": "gensou-suikoden", "titles": ["", "", "Gensou Suikoden", "幻想水滸伝"], "year": 2026, "want": "SHOW"},
    {"id": 2, "slug": "one-piece", "titles": ["", "One Piece", "ONE PIECE", "ワンピース"], "year": 1999, "want": "SHOW"},
    {"id": 3, "slug": "shingeki-no-kyojin", "titles": ["", "Attack on Titan", "Shingeki no Kyojin", "進撃の巨人"], "year": 2013, "want": "SHOW"},
]

def _node(title, orig, year, otype="SHOW"):
    return {"title": title, "original_title": orig, "year": year, "object_type": otype, "offers": [], "seasons": []}

def test_matcht_ueber_den_romaji_originaltitel():
    m = cat.match_node(_node("Suikoden", "幻想水滸伝", 2026), ANIME)
    assert m["slug"] == "gensou-suikoden"

def test_matcht_attack_on_titan_ueber_den_romaji_originaltitel():
    m = cat.match_node(_node("Attack on Titan", "Shingeki no Kyojin", 2013), ANIME)
    assert m["slug"] == "shingeki-no-kyojin"

def test_realserie_matcht_nicht_auf_den_anime():
    """Review Focus 4: Netflix-Realserie 'One Piece' 2023 gegen den Anime 1999."""
    assert cat.match_node(_node("One Piece", "One Piece", 2023), ANIME) is None

def test_film_matcht_keine_serie():
    assert cat.match_node(_node("Attack on Titan", "Shingeki no Kyojin", 2013, "MOVIE"), ANIME) is None

def test_dedupe_bevorzugt_den_direktanbieter_link():
    """Review Focus 3: Crunchyroll und Crunchyroll Amazon Channel sind ein Anbieter."""
    offers = [
        {"provider": "crunchyroll", "monetization": "flatrate", "url": "https://watch.amazon.de/x", "is_channel": True, "audio": {"de"}, "subs": set()},
        {"provider": "crunchyroll", "monetization": "flatrate", "url": "https://crunchyroll.com/x", "is_channel": False, "audio": {"ja"}, "subs": {"de"}},
    ]
    out = cat.dedupe_offers(offers)
    assert len(out) == 1
    assert out[0]["url"] == "https://crunchyroll.com/x"
    assert out[0]["audio"] == {"de", "ja"}
    assert out[0]["subs"] == {"de"}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && python3 -m pytest src/scripts/tests/test_catalog.py -v`
Expected: FAIL — `match_node` existiert nicht

- [ ] **Step 3: Implement `match_node`**

Vergleicht `original_title` und `title` des Knotens gegen alle vier Titelformen unseres Anime über `norm_variants` (also auch die CJK-Form aus Task 6). `object_type` muss zu `want` passen. Jahresabstand > 1 fordert einen exakten Titeltreffer; ab 5 Jahren Abstand kein Match. Mehrere Kandidaten mit gleichem Score → kein Match (lieber nichts als der falsche Titel).

- [ ] **Step 4: Implement `dedupe_offers`**

Eine Zeile pro `(provider, monetization)`; der erste Nicht-Channel-Link gewinnt, ein Channel-Link nur als Rückfall; `audio` und `subs` werden vereinigt. Dieselbe Regel wie `aggregate_offers` in `justwatch-streaming.py` — Verhalten muss übereinstimmen.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && python3 -m pytest src/scripts/tests/ -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/scripts/justwatch-catalog.py frontend/src/scripts/tests/test_catalog.py
git commit -m "Katalog-Abgleich: Zuordnung ueber Romaji-Originaltitel und Jahr"
```

---

### Task 10: Katalog-Abgleich — Schreiben, Vertrauensstufe, Nachweis

**Files:**
- Modify: `frontend/src/scripts/justwatch-catalog.py`, `frontend/src/scripts/tests/test_catalog.py`

**Interfaces:**
- Consumes: `fetch_catalog`, `match_node`, `dedupe_offers` aus Tasks 8–9; Spalten `confidence`, `source`, `streaming_verified_at` aus Task 1.
- Produces: `confidence_for(season_offers, series_offers, provider, status, year, current_year) -> str | None` — `'confirmed'`, `'unconfirmed'` oder `None` (nicht übernehmen); `build_catalog_sql(anime, offers, now_iso, discovery: bool) -> list[str]`; `verified_sql(ids, now_iso, complete: bool) -> list[str]`.

- [ ] **Step 1: Write the failing test** in `frontend/src/scripts/tests/test_catalog.py`

```python
def test_staffel_mit_eigenem_angebot_ist_belegt():
    assert cat.confidence_for(["crunchyroll"], ["crunchyroll"], "crunchyroll", "FINISHED", 2023, 2026) == "confirmed"

def test_leere_staffel_bei_laufendem_titel_ist_unbestaetigt():
    """Regressionsfall Returner S2: Serie bei Crunchyroll, Staffel leer, Titel laeuft."""
    assert cat.confidence_for([], ["crunchyroll"], "crunchyroll", "RELEASING", 2026, 2026) == "unconfirmed"

def test_leere_staffel_bei_aktuellem_jahrgang_ist_unbestaetigt():
    assert cat.confidence_for([], ["crunchyroll"], "crunchyroll", "FINISHED", 2026, 2026) == "unconfirmed"

def test_leere_staffel_bei_altem_titel_wird_nicht_uebernommen():
    """Entscheidung 24, engste Lesart: alte Staffeln bleiben leer."""
    assert cat.confidence_for([], ["crunchyroll"], "crunchyroll", "FINISHED", 2014, 2026) is None

def test_verified_at_wird_nur_nach_vollstaendigem_durchlauf_gesetzt():
    """Review Focus 1: ein Abbruch darf den Katalog nicht als geprueft stempeln."""
    assert cat.verified_sql([1, 2, 3], "2026-11-09T00:00:00Z", complete=False) == []
    assert len(cat.verified_sql([1, 2, 3], "2026-11-09T00:00:00Z", complete=True)) == 1

def test_entdeckungslauf_schreibt_kein_first_seen_at():
    """Sonst ist der Katalog 30 Tage lang 'Neu auf <Anbieter>' (Anti-Ziel)."""
    a = {"id": 7, "offers": {}}
    offers = [{"provider": "crunchyroll", "monetization": "flatrate", "url": "https://crunchyroll.com/x",
               "audio": "de", "subs": "", "seasons": 1, "episodes": 12, "available_to": None,
               "confidence": "confirmed"}]
    sql = " ".join(cat.build_catalog_sql(a, offers, "2026-11-09T00:00:00Z", discovery=True))
    assert "NULL" in sql
    sql2 = " ".join(cat.build_catalog_sql(a, offers, "2026-11-09T00:00:00Z", discovery=False))
    assert "2026-11-09T00:00:00Z" in sql2

def test_verworfene_angebote_bleiben_erhalten():
    """Review Focus 2 / Entscheidung 21: das Veto ueberlebt den Lauf."""
    sql = " ".join(cat.build_catalog_sql({"id": 7, "offers": {}}, [], "2026-11-09T00:00:00Z", discovery=False))
    assert "source" in sql and "manual" in sql

def test_hentai_titel_bekommen_offers_aber_keinen_sonderweg():
    """Review Focus 5: der Schutz sitzt in den Listen-Abfragen (a.is_hentai IS NOT TRUE),
    nicht im Schreibweg — der Schreibweg darf ihn also nicht umgehen wollen und
    auch nicht heimlich aufheben."""
    a = {"id": 9, "offers": {}, "is_hentai": True}
    offers = [{"provider": "crunchyroll", "monetization": "flatrate", "url": "https://crunchyroll.com/x",
               "audio": "", "subs": "", "seasons": None, "episodes": None, "available_to": None,
               "confidence": "confirmed"}]
    sql = " ".join(cat.build_catalog_sql(a, offers, "2026-11-09T00:00:00Z", discovery=False))
    assert "is_hentai" not in sql
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && python3 -m pytest src/scripts/tests/test_catalog.py -v`
Expected: FAIL — `confidence_for` existiert nicht

- [ ] **Step 3: Implement `confidence_for`**

Trägt die Staffel den Anbieter selbst → `confirmed`. Trägt nur die Serie ihn → `unconfirmed`, aber **nur** wenn `status == 'RELEASING'` oder `year == current_year` (Entscheidung 24, engste Lesart); sonst `None`.

- [ ] **Step 4: Implement `build_catalog_sql` and `verified_sql`**

`build_catalog_sql` folgt `build_sql` in `justwatch-streaming.py`: `DELETE` + `INSERT` pro Titel, `first_seen_at` pro `(provider, monetization)` erhalten, bei `discovery=True` `NULL`. Das `DELETE` nimmt Zeilen mit `source = 'manual'` **aus** (`WHERE _parent_id = … AND source IS DISTINCT FROM 'manual'`), und ein Angebot, für das eine `rejected`-Zeile desselben `(provider, monetization)` existiert, wird nicht eingefügt. `anime_streaming_providers` wird nur aus Streaming-Angeboten abgeleitet, Hentai-Titel werden wie bisher nicht ausgenommen — der Schutz sitzt in den Listen-Abfragen (Review Focus 5), und ein Test hält das fest.

`verified_sql` gibt bei `complete=False` eine leere Liste zurück, sonst ein `UPDATE anime SET streaming_verified_at = … WHERE id IN (…)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && python3 -m pytest src/scripts/tests/ -v`
Expected: PASS

- [ ] **Step 6: Trockenlauf, dann Entdeckungslauf auf dem VPS**

Run: `justwatch-catalog.py --dry-run` → Bericht, wie viele Titel pro Anbieter neu dazukämen und wie viele Phantom-Einträge wegfielen.
Run: `justwatch-catalog.py --discovery` → der erste echte Lauf, `first_seen_at` bleibt NULL.
Expected: Aniverse, ADN, Prime und Crunchyroll wachsen; `gensou-suikoden` trägt danach ADN.

- [ ] **Step 7: Gegenprobe gegen die Ausgangswerte**

```sql
SELECT count(*) FROM anime a WHERE NOT EXISTS (SELECT 1 FROM anime_streaming_offers o WHERE o._parent_id=a.id);
SELECT count(*) FROM anime WHERE season_year=2026 AND season='FALL'
  AND NOT EXISTS (SELECT 1 FROM anime_streaming_offers o WHERE o._parent_id=anime.id);
```
Expected: der erste Wert deutlich unter 7.864, der zweite höchstens 10 (Abnahmeziel).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/scripts/justwatch-catalog.py frontend/src/scripts/tests/test_catalog.py
git commit -m "Katalog-Abgleich: Schreiben mit Vertrauensstufe, Nachweis und Entdeckungslauf"
```

---

### Task 11: Vererbung und Veto in der Titelsuche

**Files:**
- Modify: `frontend/src/scripts/justwatch-streaming.py` (`aggregate_offers`, `build_sql`)
- Test: `frontend/src/scripts/tests/test_matcher.py`

**Interfaces:**
- Consumes: `confidence_for` aus Task 10 (per Import aus `justwatch-catalog.py`) — eine Regel, eine Implementierung.
- Produces: `aggregate_offers` setzt `confidence` pro Angebot; `build_sql` schreibt `confidence` und `source='justwatch'` und respektiert `manual`/`rejected`.

- [ ] **Step 1: Write the failing test** in `frontend/src/scripts/tests/test_matcher.py`

```python
def test_leere_staffel_erbt_bei_laufendem_titel_die_serien_anbieter():
    """Regressionsfall Returner S2."""
    node = {"objectType": "SHOW",
            "content": {"title": "A Returner's Magic Should Be Special", "originalTitle": "帰還者の魔法は特別です", "originalReleaseYear": 2023},
            "offers": [{"monetizationType": "FLATRATE", "standardWebURL": "https://crunchyroll.com/returner",
                        "package": {"clearName": "Crunchyroll"}, "audioLanguages": ["ja"], "subtitleLanguages": ["de"]}],
            "seasons": [{"content": {"title": "Staffel 2", "seasonNumber": 2, "originalReleaseYear": 2026}, "offers": []}]}
    offers = jw.aggregate_offers(node, node["seasons"][0], status="RELEASING", year=2026, current_year=2026)
    assert [o["provider"] for o in offers] == ["crunchyroll"]
    assert offers[0]["confidence"] == "unconfirmed"
    assert offers[0]["monetization"] == "flatrate"
    assert offers[0]["audio"] == "" and offers[0]["subs"] == ""

def test_leere_staffel_erbt_bei_altem_titel_nicht():
    node = {"objectType": "SHOW",
            "content": {"title": "X", "originalTitle": "X", "originalReleaseYear": 2010},
            "offers": [{"monetizationType": "FLATRATE", "standardWebURL": "https://crunchyroll.com/x",
                        "package": {"clearName": "Crunchyroll"}, "audioLanguages": [], "subtitleLanguages": []}],
            "seasons": [{"content": {"title": "Staffel 2", "seasonNumber": 2, "originalReleaseYear": 2012}, "offers": []}]}
    assert jw.aggregate_offers(node, node["seasons"][0], status="FINISHED", year=2012, current_year=2026) == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && python3 -m pytest src/scripts/tests/test_matcher.py -v`
Expected: FAIL — `aggregate_offers` nimmt die neuen Argumente nicht

- [ ] **Step 3: Extend `aggregate_offers`**

Zusätzliche Parameter `status`, `year`, `current_year` mit Standardwerten, damit bestehende Aufrufe weiterlaufen. Liefert die Staffel keine Angebote, wird pro Serien-Anbieter `confidence_for` befragt; bei `unconfirmed` entsteht eine Zeile mit `monetization='flatrate'`, dem **Serien**-Deep-Link, **leeren** `audio`/`subs` und ohne `seasons`/`episodes` (Entscheidung 7). Bei `None` entsteht keine Zeile.

- [ ] **Step 4: Extend `build_sql`**

`confidence` und `source='justwatch'` in den `INSERT`. Das `DELETE` nimmt `source='manual'` aus; ein Angebot mit passender `rejected`-Zeile wird nicht eingefügt. `anime_streaming_providers` und `anime_available_languages` werden nur aus **belegten** Streaming-Angeboten abgeleitet — `streamingProviders` ist der Filter-Index, und ein geerbter Eintrag darf dort stehen (Entscheidung 4), eine geerbte Sprache nicht (Entscheidung 7).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && python3 -m pytest src/scripts/tests/ -v`
Expected: PASS

- [ ] **Step 6: Gegenprobe am Regressionsfall**

Run: `justwatch-streaming.py --slugs kikansha-no-mahou-wa-tokubetsu-desu-2nd-season --dry-run`
Expected: Crunchyroll, als `unconfirmed`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/scripts/justwatch-streaming.py frontend/src/scripts/tests/test_matcher.py
git commit -m "JustWatch: leere Staffel erbt Serien-Anbieter als unbestaetigt, Handarbeit und Veto bleiben"
```

---

### Task 12: Autoritatives Löschen überlebt den Handarbeits-Schutz

**Files:**
- Modify: `frontend/src/scripts/justwatch-streaming.py` (`build_sql`), `frontend/src/scripts/justwatch-catalog.py` (`build_catalog_sql`)
- Test: `frontend/src/scripts/tests/test_matcher.py`

**Interfaces:**
- Consumes: `build_sql`, `build_catalog_sql`.
- Produces: keine neuen Signaturen.

- [ ] **Step 1: Write the failing test** in `frontend/src/scripts/tests/test_matcher.py`

```python
def test_echtes_lizenzende_loescht_das_angebot():
    """Review Focus 2: der Schutz darf den Bestand nicht einfrieren."""
    a = {"id": 7, "have": {"crunchyroll"}, "offers": {("crunchyroll", "flatrate"): "2026-01-01T00:00:00Z"}}
    stmts, changed = jw.build_sql(a, [], "2026-11-09T00:00:00Z")
    sql = " ".join(stmts)
    assert "DELETE FROM anime_streaming_offers" in sql
    assert "INSERT INTO anime_streaming_offers" not in sql
    assert changed is True

def test_manuelle_zeile_wird_nicht_geloescht():
    a = {"id": 7, "have": set(), "offers": {}}
    sql = " ".join(jw.build_sql(a, [], "2026-11-09T00:00:00Z")[0])
    assert "source IS DISTINCT FROM 'manual'" in sql
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && python3 -m pytest src/scripts/tests/test_matcher.py -v`
Expected: FAIL — das `DELETE` kennt die Einschränkung nicht

- [ ] **Step 3: Scope the `DELETE` in both scripts**

`DELETE FROM anime_streaming_offers WHERE _parent_id = … AND source IS DISTINCT FROM 'manual'`. Ein Titel, dessen Anbieter bei JustWatch verschwunden ist, verliert seine automatisch geschriebenen Zeilen weiterhin vollständig.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && python3 -m pytest src/scripts/tests/ -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/scripts/justwatch-streaming.py frontend/src/scripts/justwatch-catalog.py \
        frontend/src/scripts/tests/test_matcher.py
git commit -m "Streaming-Sync: Handarbeit schuetzen, echtes Lizenzende weiter loeschen"
```

---

### Task 13: Prüflisten im Payload-Admin

**Files:**
- Modify: `frontend/src/collections/Anime.ts`

**Interfaces:**
- Consumes: `confidence`, `source`, `streamingVerifiedAt` aus Task 1.
- Produces: keine Code-Schnittstelle. Zwei im Admin erreichbare Listen.

- [ ] **Step 1: Add `streamingVerifiedAt` to `admin.defaultColumns`**

In der Anime-Collection, damit die Spalte in der Listenansicht sichtbar ist. Keine eigene Komponente — die Filterung läuft über die `where`-Query der Admin-URL, und `confidence` ist in Task 1 bereits `index: true`.

- [ ] **Step 2: Document both lists and the veto in `README.md`**

Im Abschnitt „Streaming & Sprachen" festhalten:
- Prüfliste „unbestätigt": Admin-URL mit `where[streamingOffers.confidence][equals]=unconfirmed`, `sort=-seasonYear`.
- Prüfliste „kein Nachweis": `where[streamingVerifiedAt][exists]=false`, `sort=-seasonYear`.
- **So wird von Hand entschieden:** im Angebot `confidence` auf `confirmed` und `source` auf `manual` setzen, wenn es stimmt — damit ist die Zeile vor dem Sync geschützt (Task 12). Stimmt es nicht, `confidence` auf `rejected` und `source` auf `manual` setzen; diese Veto-Zeile verhindert, dass der Sync den Falschtreffer wieder einfügt. Eine Zeile einfach zu löschen genügt **nicht** — sie steht nach spätestens vier Stunden wieder da.

- [ ] **Step 3: Verify in the Admin**

Run: beide URLs im LAN-Admin öffnen (`/legal/admin`)
Expected: beide Listen liefern Treffer, Sortierung neueste zuerst

- [ ] **Step 4: Typecheck and commit**

```bash
cd frontend && npm run typecheck
git add frontend/src/collections/Anime.ts README.md
git commit -m "Admin: Pruefliste fuer unbestaetigte Angebote und Titel ohne Nachweis"
```

---

### Task 14: Crunchyroll als Direktquelle

**Files:**
- Modify: `frontend/src/scripts/crunchyroll-dub.py`
- Test: `frontend/src/scripts/tests/test_crunchyroll.py` (neu)

**Interfaces:**
- Consumes: `get_token`, `api_get`, `SERIES_API`, `SEARCH_API`, `resolve` aus `crunchyroll-dub.py`.
- Produces: `availability_from_series(series_json, season_json) -> list[dict]` — Angebote mit `provider='crunchyroll'`, `source='crunchyroll'`, `confidence='confirmed'`, Deep-Link auf `/series/<id>`; `--availability`-Modus, der **nur** `RELEASING` plus laufenden und vorherigen Jahrgang abdeckt (Entscheidung 10).

- [ ] **Step 1: Write the failing test** in `frontend/src/scripts/tests/test_crunchyroll.py`

```python
from conftest import load
cr = load("crunchyroll-dub")

def test_verfuegbarkeit_aus_der_serien_antwort():
    series = {"data": [{"id": "GABC123", "slug_title": "returners-magic",
                        "series_metadata": {"audio_locales": ["ja-JP"], "subtitle_locales": ["de-DE"], "season_count": 2}}]}
    offers = cr.availability_from_series(series, None)
    assert len(offers) == 1
    o = offers[0]
    assert o["provider"] == "crunchyroll"
    assert o["source"] == "crunchyroll"
    assert o["confidence"] == "confirmed"
    assert o["monetization"] == "flatrate"
    assert o["url"].endswith("/series/GABC123")
    assert o["subs"] == "de"

def test_leere_antwort_erzeugt_kein_angebot():
    assert cr.availability_from_series({"data": []}, None) == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && python3 -m pytest src/scripts/tests/test_crunchyroll.py -v`
Expected: FAIL — `availability_from_series` existiert nicht

- [ ] **Step 3: Implement `availability_from_series`**

Baut aus der vorhandenen Serien-Antwort ein Angebot im Format von `build_catalog_sql`. Sprachen über das bestehende `locales_to_langs`-Muster; Deep-Link `https://www.crunchyroll.com/de/series/<id>`.

- [ ] **Step 4: Add the `--availability` mode**

Lädt nur Titel mit `status='RELEASING'` oder `season_year >= current_year - 1`, nutzt `resolve` wie der Dub-Lauf, schreibt über `build_catalog_sql` aus `justwatch-catalog.py`. `MAX_WORKERS` bleibt beim heutigen Wert des Skripts; kein Gesamtkatalog-Lauf.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && python3 -m pytest src/scripts/tests/ -v`
Expected: PASS

- [ ] **Step 6: Trockenlauf auf dem VPS**

Run: `crunchyroll-dub.py --availability --dry-run`
Expected: Lauf ohne Fehler; der Regressionsfall Returner S2 wird als `confirmed` gemeldet statt als `unconfirmed`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/scripts/crunchyroll-dub.py frontend/src/scripts/tests/test_crunchyroll.py
git commit -m "Crunchyroll: Verfuegbarkeit direkt beim Anbieter belegen (laufende Titel)"
```

- [ ] **Step 8: ADN-Zugang zum deutschen Katalog verifizieren (Zeitbudget: eine Stunde)**

Die Spec hält fest (Entscheidung 10), dass `gw.api.animationdigitalnetwork.com/show/catalog?limit=50`
HTTP 200 liefert, mit `X-Target-Distribution: de` und `: fr` aber byte-identisch den
**französischen** Katalog (`languages: {vostf, vf}`, Deep-Links ohne `/de/`). Zu prüfen:
ein anderer Host (`de.` statt `gw.`), ein Query-Parameter (`?language=de`, `?distribution=de`),
oder welche Header die deutsche Weboberfläche `animationdigitalnetwork.com/de/` selbst sendet.
Prüfkriterium: die Antwort muss `vostde`/`vde` oder `/de/`-Deep-Links enthalten.

- [ ] **Step 9: Ergebnis festhalten**

Gefunden → eigene Aufgabe nach dem Muster von Task 14 anlegen, ADN wird `confirmed`-Quelle.
Nicht gefunden → in `docs/superpowers/specs/2026-11-09-streaming-aktualitaet-design.md` unter
Entscheidung 10 vermerken, was geprüft wurde und was es ergab. ADN bleibt dann bei JustWatch;
der Regressionsfall `gensou-suikoden` wird über Task 6 und Task 10 abgedeckt und ist damit
nicht blockiert. **Kein Abbruch des Plans in diesem Fall.**

```bash
git add docs/superpowers/specs/2026-11-09-streaming-aktualitaet-design.md
git commit -m "Design: ADN-Zugang zum deutschen Katalog geprueft, Ergebnis festgehalten"
```

---

### Task 15: Kadenz und Alarm

**Files:**
- Modify: `frontend/src/scripts/justwatch-streaming.py` (`load_anime`), `/opt/otakupulse-cron/refresh-streaming.sh` und `/etc/cron.d/otakupulse` auf dem VPS, `README.md`
- Create: `/opt/otakupulse-cron/catalog-sweep.sh` auf dem VPS
- Test: `frontend/src/scripts/tests/test_matcher.py`

**Interfaces:**
- Consumes: alles Vorige.
- Produces: `--stale-weighted N` in `justwatch-streaming.py` — wie `--stale`, aber nach Jahrgang gewichtet; `stale_order_sql(current_year) -> str` als reine Funktion.

- [ ] **Step 1: Write the failing test** in `frontend/src/scripts/tests/test_matcher.py`

```python
def test_gewichtete_rotation_bevorzugt_neue_jahrgaenge():
    sql = jw.stale_order_sql(2026)
    assert "season_year" in sql
    assert "streaming_checked_at" in sql
    assert "DESC" in sql.upper()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && python3 -m pytest src/scripts/tests/test_matcher.py -v`
Expected: FAIL — `stale_order_sql` existiert nicht

- [ ] **Step 3: Implement `stale_order_sql` and the `--stale-weighted` mode**

Sortierung: erst Titel mit `status='RELEASING'`, dann nach Jahrgang absteigend, innerhalb eines Jahrgangs nach `streaming_checked_at` aufsteigend (NULLS FIRST). So kommt „neu vor alt" (Entscheidung 1) zum Tragen, ohne dass alte Jahrgänge nie wieder drankommen — das sichert der Katalog-Sweep ab, der ohnehin alles abdeckt.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && python3 -m pytest src/scripts/tests/ -v`
Expected: PASS

- [ ] **Step 5: Add the Telegram alarm**

Nach einem Lauf: hat ein Titel der laufenden Season weder ein Angebot noch `streaming_verified_at`, geht eine Meldung an `ALERT_CHAT_ID` — dasselbe Muster wie in `watchdog.sh:33-35` (Token und Chat-ID aus `secrets.env`, `curl` gegen `api.telegram.org`). Schweigt, wenn die Zahl 0 ist.

- [ ] **Step 6: Set up the cron entries on the VPS**

`catalog-sweep.sh` nach dem Muster von `refresh-streaming.sh` (Log, Log-Rotation, `cd`, `python3 -u`), ruft `justwatch-catalog.py` auf. In `/etc/cron.d/otakupulse`:
- `20 5 * * 1` — Katalog-Sweep, wöchentlich montags (setzt `streaming_verified_at`)
- `40 5 * * *` — `crunchyroll-dub.py --availability`, täglich
- `45 */4 * * *` — bestehender Lauf, auf `--stale-weighted 150` umgestellt

Danach: `sudo systemctl reload cron` oder äquivalent, und einen Lauf abwarten.

- [ ] **Step 7: Abnahme prüfen**

```sql
SELECT count(*) FROM anime WHERE season_year=2026 AND season='FALL'
  AND NOT EXISTS (SELECT 1 FROM anime_streaming_offers o WHERE o._parent_id=anime.id);
SELECT count(*) FROM anime WHERE season_year=2026 AND season='FALL' AND streaming_verified_at IS NULL;
```
Expected: erster Wert ≤ 10, zweiter 0. Beide Regressionsfälle zeigen ihren Anbieter.

- [ ] **Step 8: README auf den neuen Stand bringen**

Cron-Tabelle, Abschnitt „Streaming & Sprachen" (Vertrauensstufen, Katalog-Abgleich, Nachweis) und die Skript-Tabelle um `justwatch-catalog.py` ergänzen.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/scripts/justwatch-streaming.py frontend/src/scripts/tests/test_matcher.py README.md
git commit -m "Streaming: Rotation nach Jahrgang gewichten, Katalog-Sweep woechentlich, Alarm bei Luecken"
```
