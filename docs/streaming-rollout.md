# Rollout: Streaming-Verfügbarkeit (Branch `streaming-aktualitaet`)

Diese Anleitung ist für jemanden geschrieben, der den Branch ausrollt, ohne die
Entwicklungssitzung zu kennen. **Die Reihenfolge ist Teil der Anforderung** — der
Schema-Push muss vor dem ersten Skriptlauf liegen, und der Entdeckungslauf ist einmalig
und hinterher nicht mehr korrigierbar.

> **Die Reihenfolge in einem Satz:** Quellstand holen → Schema-Push → verifizieren →
> App deployen → Entdeckungslauf → Crunchyroll-Lauf → Wrapper → Cron.

Stand der VPS-Angaben: **am VPS gemessen am 2026-11-09**. Alles andere folgt aus dem
Repo-Code und ist dort nachlesbar.

Was der Branch mitbringt: Katalog-Blättern je Anbieter statt Titelsuche
(`justwatch-catalog.py`), Zuversicht-Stufen am Angebot (`confidence`, wobei **NULL
`confirmed` bedeutet** — 3.197 Altzeilen tragen NULL), ein Herkunftsfeld (`source`),
Crunchyroll als Direktquelle (`crunchyroll-dub.py --availability`) und den Lücken-Alarm.

---

## 1. Quellstand holen — vor dem Push, ohne die App anzufassen

Der Push braucht den **neuen** Code, die App darf ihn aber noch nicht ausliefern. Beides
geht, weil der enrich-Container die Quelle mountet statt sie einzubacken:
`/srv/sites/otakupulse/app-src/frontend → /app` (am VPS gemessen am 2026-11-09). Er führt
`tsx` direkt darauf aus, braucht also keinen Build. Die App hängt dagegen am gebauten
`.next` und wechselt erst, wenn `deploy-vps.sh` sie neu startet (dessen Schritt 5/6).

```sh
cd /srv/sites/otakupulse/app-src
git fetch --depth 1 origin main
git reset --hard "$(git rev-parse FETCH_HEAD)"
```

Das sind genau die Zeilen aus `deploy-vps.sh` (Schritt 1/6); der spätere Deploy holt
denselben Stand noch einmal und ist damit ein No-op. Unversioniertes (`secrets.env`,
`node_modules`, `.next*`) überlebt `reset --hard`.

> **Warum nicht einfach `deploy-vps.sh` zuerst:** dann startet die App mit dem neuen Code,
> bevor die Spalten existieren. Umgekehrt scheitert der Push mit dem alten Code —
> `db-push.ts` importiert `../payload.config` und damit die Collections aus dem Mount;
> kennt die Konfiguration `confidence`, `source` und `streamingVerifiedAt` nicht, meldet
> der Push brav „Schema-Push abgeschlossen" und legt **nichts** an. Dieser Schritt löst
> beides: neuer Code für den Push, alter Build für die Besucher.
>
> **Schmales Fenster, das man kennen sollte:** zwischen diesem Schritt und dem Push laufen
> die enrich-Cronjobs bereits auf dem neuen Code (`telegram-notify` alle 30 Minuten, die
> News-Läufe zu ihren festen Zeiten, siehe `/etc/cron.d/otakupulse`). Darum Schritt 1 und
> 2 unmittelbar hintereinander ausführen und nicht zur Minute 00 oder 30 beginnen.

## 2. Schema-Push

Die neuen Felder fehlen in der Produktionsdatenbank. Payload läuft hier **ohne
Migrationen** (Dev-Push-Modus), der Push geht über `db-push.ts` und **nur** mit
`NODE_ENV=development` — ohne das pusht der Postgres-Adapter nicht:

```sh
docker exec --env-file frontend/secrets.env -e NODE_ENV=development \
  otakupulse-enrich sh -lc 'cd /app && npx tsx src/scripts/db-push.ts'
```

Neu angelegt werden (additiv, ohne Rückfrage):

| Wo | Feld | Quelle |
|---|---|---|
| `anime_streaming_offers` | `confidence` (`confirmed`/`unconfirmed`/`rejected`) | `collections/Anime.ts` |
| `anime_streaming_offers` | `source` (`justwatch`/`crunchyroll`/`adn`/`manual`) | `collections/Anime.ts` |
| `anime` | `streaming_verified_at` (Datum, indexiert) | `collections/Anime.ts` |

Dazu kommen **drei neue Werte der Anbieter-Enum**. Sie stammen aus
`PROVIDER_OPTIONS` = allen Einträgen in `lib/streaming.ts`; gegen `main` verglichen sind
genau diese drei neu: **`hbo-max`**, **`akibapass`**, **`pluto-tv`**. Die Enum steht hinter
`streamingProviders` (Tabelle `anime_streaming_providers`), und dort schreiben die Skripte
mit explizitem Cast `::enum_anime_streaming_providers`.

**Warum vor jedem Skriptlauf:** die Skripte schreiben die neuen Spalten unbedingt — jedes
`INSERT` in `anime_streaming_offers` nennt `confidence` und `source`, jeder Nachweis-Stempel
schreibt `anime.streaming_verified_at`. Ein Schreibversuch mit einem Enum-Wert, den die
Datenbank nicht kennt, scheitert ebenfalls (siehe Schritt 3).

## 3. Verifikation nach dem Push, VOR dem ersten Skriptlauf

Erst prüfen, dann schreiben lassen. Spalten:

```sh
docker exec -i otakupulse-db sh -c 'psql -t -A -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT table_name, column_name FROM information_schema.columns
 WHERE (table_name = 'anime_streaming_offers' AND column_name IN ('confidence','source'))
    OR (table_name = 'anime' AND column_name = 'streaming_verified_at');
SQL
```

Erwartet: **drei** Zeilen. Dann die Enum-Werte — die Typnamen lässt man sich zeigen,
statt sie zu raten:

```sh
docker exec -i otakupulse-db sh -c 'psql -t -A -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
  FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
 WHERE t.typname LIKE 'enum_anime_streaming%'
 GROUP BY t.typname ORDER BY 1;
SQL
```

Erwartet: `enum_anime_streaming_providers` enthält `hbo-max`, `akibapass` und `pluto-tv`;
die Enums hinter `confidence` (drei Werte) und `source` (vier Werte) existieren.
**Warum diese Prüfung:** ein `INSERT` mit einem unbekannten Enum-Wert schlägt fehl und
reißt die ganze Transaktion des Laufs mit (`psql -v ON_ERROR_STOP=1`). Der Sweep schreibt
in Häppchen von 500 Titeln — man verliert also nicht alles, aber jeden Häppchen-Block mit
einem neuen Anbieter.

## 4. App deployen

Jetzt darf die App den neuen Code ausliefern — die Spalten sind da und geprüft.

```sh
ssh administrator@100.64.244.17 '/srv/sites/otakupulse/app-src/deploy-vps.sh'
```

Schritt 1/6 holt denselben Quellstand wie Schritt 1 dieser Anleitung und ist damit ein
No-op. Danach: Build im Wegwerf-Container, `.next` tauschen, App neu starten, auf HTTP 200
warten (bei Misserfolg rollt das Skript selbst auf den alten Build zurück) und den
Cloudflare-Cache leeren. Letzteres ist Pflicht: die Cache-Regeln legen `/anime` für acht
Stunden an den Edge, ohne Purge sieht man die Wirkung nicht.

## 5. `justwatch-catalog.py --discovery` — GENAU EINMAL, vor dem ersten `--sweep`

```sh
cd /srv/sites/otakupulse/app-src/frontend   # Pfad des VPS, siehe Schritt 7
python3 -u src/scripts/justwatch-catalog.py --discovery
```

`--discovery` schreibt dieselben Zeilen wie `--sweep`, mit zwei Unterschieden:

1. **Jedes neue Paar `(provider, monetization)` bekommt `first_seen_at = NULL`** („seit
   Beginn bekannt") statt des Zeitstempels des Laufs.
2. Es gibt **keinen** Schwall `content_updated_at` über die geänderten Titel (sonst
   Sitemap-/IndexNow-Lärm über den halben Katalog).

**Warum genau einmal** (so im Code begründet, `build_catalog_sql` in
`justwatch-catalog.py`): im Entdeckungslauf ist „echter Neuzugang" von „wir haben nie
nachgesehen" prinzipiell nicht unterscheidbar. Läuft stattdessen zuerst `--sweep`, bekommt
jedes erstmals gefundene Paar `first_seen_at = now()` — und das News-Format „Neu auf
<Anbieter>" (`generate-recurring-news.ts --platform-new`, donnerstags) hielte den halben
Katalog 30 Tage lang für einen Neuzugang. Dessen Kaltstart-Sperre `ECHT_NEU` greift dort
nicht, weil sie auf `first_seen_at IS NULL` prüft. Die naheliegende Eingrenzung „nur Titel
ohne Bestand" wäre ebenfalls falsch: 113 Titel haben nur Kauf-/Leih-Angebote, gelten damit
als „mit Bestand", und ihre erstmals gefundenen Abo-Angebote wären 30 Tage „neu".
Ein ZWEITER `--discovery`-Lauf ist genauso schädlich, nur anders: er stempelt dann echte
Neuzugänge als „seit Beginn bekannt", und sie erscheinen nie in „Neu auf <Anbieter>".
Wörtlich im Code: „`--discovery` läuft genau einmal; hinterher ist das nicht mehr zu
korrigieren."

Exit-Codes des Skripts: `0` = vollständiger Durchlauf (dann wird gestempelt), `1` =
unvollständig (**kein** Nachweis gestempelt), `2` = gar nicht gelaufen, weil die
Instanz-Sperre griff (Terminkollision, kein Fehler). Ein `--discovery`, das mit 1 endet,
**wiederholt man** — das ist der eine Fall, in dem ein zweiter Lauf richtig ist, weil der
erste den Katalog nicht vollständig gesehen hat.

## 6. Crunchyroll-Direktbeleg — erster Lauf von Hand

Ohne diesen Schritt kommt der erste Beleg erst mit dem Cron um 05:40. Von Hand sieht man
sofort, ob die Quelle trägt — und die Fälle, die den Branch ausgelöst haben, sind genau
Fortsetzungsstaffeln laufender Titel.

```sh
cd /srv/sites/otakupulse/app-src/frontend
python3 -u src/scripts/crunchyroll-dub.py --availability
```

Schreibt `confidence='confirmed'`, `source='crunchyroll'` — aber nur bei direktem Beleg
(eigener Serien-Link am Titel oder exakter Slug-Treffer), nie aus einem unscharfen Treffer.
Umfang: laufende Titel sowie laufender und vorheriger Jahrgang.

> **Reihenfolge gegenüber dem Sweep:** dieser Lauf muss **nach** einem Katalog-Sweep
> liegen, nie davor. Der Sweep löscht autoritativ und ignoriert `source`, überschreibt den
> Beleg also mit einer geerbten, unbestätigten Zeile; dieser Lauf stellt ihn wieder her.
> Deshalb im Cron: Sweep montags 05:20, dieser Lauf täglich 05:40 (siehe Schritt 9).

## 7. Wrapper nach `/opt/otakupulse-cron/` kopieren und anpassen

Der Cron ruft die Wrapper **nicht** aus dem Repo, sondern aus `/opt/otakupulse-cron/`
(`root:root`, Modus `0750`). Dort liegen heute `backup-db.sh`, `otakupulse-sync.sh`,
`refresh-streaming.sh` und `watchdog.sh`.

Die ausgerollte Kopie unterscheidet sich von der Repo-Fassung in **genau zwei Zeilen**
(per `diff` verifiziert, 2026-11-09):

```diff
-export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
-F=/mnt/cache/appdata/otakupulse/frontend
+export PATH=/opt/otakupulse-cron/bin:/opt/otakupulse-cron/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
+F=/srv/sites/otakupulse/app-src/frontend
```

Der vorangestellte venv-Pfad ist **nicht kosmetisch**: dort liegt `curl_cffi`. Ohne ihn
findet kein Skript das Modul, und alle drei Läufe brechen beim Import ab.

Die drei neuen Wrapper also nach `/opt/otakupulse-cron/` kopieren, dort anpassen,
`root:root` und `0750` setzen:

| Wrapper | anzupassende Zeilen (Repo-Stand) | wogegen prüfen |
|---|---|---|
| `catalog-sweep.sh` | 26 (`export PATH=`), 27 (`F=`), **39 (Alarm-Aufruf)** | `ls /opt/otakupulse-cron/venv/bin/python3`, `ls $F/src/scripts/justwatch-catalog.py` |
| `crunchyroll-availability.sh` | 15 (`export PATH=`), 16 (`F=`) | `ls $F/src/scripts/crunchyroll-dub.py` |
| `streaming-alarm.sh` | 12 (`export PATH=`), 13 (`F=`) | `test -r $F/secrets.env` (Zeile 14 leitet `SECRETS` daraus ab) |

> ### Stille Falle: der Alarm-Aufruf mit absolutem Pfad
>
> `catalog-sweep.sh` (Zeile 39) und `refresh-streaming.sh` (Zeile 24) rufen den Alarm so
> auf:
>
> ```sh
> bash /mnt/cache/appdata/otakupulse/streaming-alarm.sh >> "$LOG" 2>&1
> ```
>
> Das ist eine **dritte** anzupassende Zeile je Wrapper (`/opt/otakupulse-cron/streaming-alarm.sh`),
> und ihr Ausfall ist **lautlos**: der Pfad existiert auf dem VPS nicht, `bash` scheitert,
> der aufrufende Wrapper läuft mit seinem **eigenen** Exit-Code weiter (`exit $RC` ist der
> Exit-Code des Python-Laufs, nicht der des Alarms) — und der Lücken-Alarm würde nie
> feuern, ohne dass es jemand merkt.
>
> **Prüfung nach dem Ausrollen** (einmal von Hand, nicht nur Cron abwarten):
>
> ```sh
> bash /opt/otakupulse-cron/streaming-alarm.sh; echo "exit=$?"
> tail -n 20 /tmp/otaku-streaming-refresh.log
> ```
>
> **Entscheidend ist der Exit-Code, nicht das Log** — denn ohne Lücke endet das Skript,
> bevor es irgendetwas schreibt (`[ -n "$MSG" ] || exit 0`). Ein leeres Log ist also der
> Normalfall und kein Fehler:
>
> | `exit=` | Bedeutung | zu tun |
> |---|---|---|
> | `127` | `bash` fand das Skript nicht — **die Falle hat zugeschlagen**, Pfad noch falsch | Zeile 3 des Wrappers korrigieren |
> | `0` ohne Logzeile | gelaufen, keine Lücke gefunden | nichts, das ist der Normalfall |
> | `0` mit `Lücken-Alarm gesendet` | gelaufen, Lücke gemeldet | Telegram prüfen |
> | `1` | Konfiguration kaputt oder Versand gescheitert — die Meldung sagt, was | Log lesen, Ursache beheben |
>
> Die `1`-Meldungen im Klartext: `… secrets.env fehlt oder ist nicht lesbar`,
> `… TELEGRAM_BOT_TOKEN fehlt in secrets.env`, `… ALERT_CHAT_ID fehlt in secrets.env`,
> `Lücken-Abfrage fehlgeschlagen`, `Versand FEHLGESCHLAGEN`.
>
> Höchstens eine Meldung pro Tag (Stempeldatei `/tmp/otaku-streaming-alarm.day`) — wer
> den Versand zweimal am selben Tag sehen will, löscht sie vorher.

## 8. `refresh-streaming.sh` neu ausrollen (sonst bleibt die Rotation unwirksam)

Die ausgerollte Kopie ist **älter als das Repo**: sie ruft `justwatch-streaming.py --stale`,
das Repo `--stale-weighted` (laufende Titel und neue Jahrgänge zuerst, dann nach Alter).
Die gewichtete Rotation — ein Kernstück dieses Branches — wirkt erst, wenn auch diese Datei
neu ausgerollt ist, in denselben zwei (bzw. drei, siehe Kasten) Zeilen angepasst. Vorher
sieht alles grün aus, während die Gewichtung nichts tut.

## 9. Cron-Einträge

Es gibt **kein** `crontab -l` für root oder den Benutzer; die Einträge stehen ausschließlich
in **`/etc/cron.d/otakupulse`**, z. B.:

```
45 */4 * * * root /opt/otakupulse-cron/refresh-streaming.sh
```

Die Taktung der drei Streaming-Jobs steht in der Cron-Tabelle im
[README](../README.md#cronjobs) (täglicher Crunchyroll-Lauf 05:40, wöchentlicher
Katalog-Sweep Mo 05:20, Alarm am Ende von Sweep und Titelsuche) und wird hier nicht
verdoppelt. Für neue Zeilen gilt:

- Pfade zeigen auf `/opt/otakupulse-cron/<name>.sh`, nicht ins Repo.
- **Reihenfolge ist eine Anforderung:** der Katalog-Sweep muss **vor** dem
  Crunchyroll-Lauf liegen. Der Sweep löscht autoritativ und ignoriert `source`; der
  Crunchyroll-Lauf danach stellt den Beleg wieder her. Begründung ausführlich im Kopf von
  `catalog-sweep.sh`.
- `/etc/cron.d/otakupulse` trägt oben ein **`#CUTOVER# `-Präfix-Verfahren** zum
  Aktivieren/Deaktivieren einzelner Zeilen. Wer eine neue Zeile zunächst deaktiviert
  anlegt, folgt demselben Muster.

## 10. Nach dem Rollout: hat es gewirkt?

```sh
cd /srv/sites/otakupulse/app-src/frontend && npx tsx src/scripts/streaming-coverage.ts
```

Weist Angebote und Titel je Vertrauensstufe aus, dazu `streamingVerifiedAt` und die Lücke
der laufenden Season. Abnahmeziel: von den 110 Titeln der Season FALL 2026 höchstens 10
ohne Angabe, **keiner** ohne Stempel.

Zwei Prüflisten im Payload-Admin (Filter-URLs im [README](../README.md#prüflisten-im-payload-admin)):
die unbestätigten Angebote (Arbeitsliste) und die Titel ohne Nachweis (Beobachtungsliste).

**Was ein Ausfall bedeutet:** fällt der tägliche Crunchyroll-Lauf länger als sieben Tage
aus, dann löscht der nächste erfolgreiche Lauf über den Frische-Verfall (`expiry_sql`) alle
belegten Crunchyroll-Zeilen, deren `last_seen_at` inzwischen älter als sieben Tage ist —
die betroffenen Titel fallen danach auf die als „nicht bestätigt" gekennzeichnete
JustWatch-Angabe zurück.
Ein unvollständiger Lauf (403/429, Token-Fehler, keine einzige Auflösung) räumt **nichts**
ab; das Log sagt dann „Durchlauf unvollständig … KEIN Frische-Verfall".
