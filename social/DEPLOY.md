# Social-Agent ausliefern (Coolify)

Der Agent läuft **nicht** auf Unraid, sondern als weiterer Container im Coolify-Service
`otakupulse` (uuid `ei9kq0mxqajfydp1vcydbnyg`) auf dem VPS. Nur von dort erreicht er
`otakupulse-db`, ohne dass die Datenbank nach außen geöffnet wird.

Diese Datei beschreibt, was in Coolify eingetragen wird. Sie ändert nichts selbst; die Änderung am
laufenden Service macht ein Mensch.

## Zwei Dinge vorab

- **`manage.sh` ist kein Deploy-Weg.** Es ist das Werkzeug für lokale Entwicklung und Tests
  (`build`, `test`, `cli`, `seed` gegen einen lokalen Container). Ausgeliefert wird über Coolify.
  `manage.sh up` startet auf dem Unraid-Host einen zweiten Poller mit demselben Telegram-Token und
  einem eigenen Dedup-Zustand: das ist genau das, was auf dem VPS nicht passieren darf.
- **Das Compose dieses Service bedient auch `www.otakupulse.de`.** Jede Änderung daran ist ein
  Eingriff in die laufende Seite (Neuanlage des Stacks kann `otakupulse-app` und `otakupulse-db`
  berühren) und gehört abgestimmt, nicht nebenbei gemacht. Zeitpunkt vorher festlegen.

## Persistentes Volume auf `/data`: nicht weglassen

> **Ohne Volume auf `/data` verliert jeder Redeploy den Dedup-Zustand.** Dort liegt
> `social.sqlite3` mit `drafts`, `posted_log` und `seen_sources`. Fehlt der Zustand, hält der
> Agent alle bereits publizierten Artikel wieder für neu und zieht **jeden Tag 6 davon nach**
> (`MAX_DRAFTS_PER_BATCH`). Für Tumblr gibt es keine Einzelfreigabe, die das auffängt, nur Tageslimit
> und Tagesmeldung. Wer es merkt, merkt es nach Tagen. Ein Container ohne Volume läuft ohne
> Fehlermeldung einwandfrei, bis zum ersten Redeploy.

Nach dem ersten echten Redeploy prüfen: `/status` im Telegram-Bot zeigt dieselbe Zahl bei
„Bekannte Quellen (seen)“ wie davor. Wenn sie auf 0 fällt, ist das Volume nicht eingehängt.

## Compose-Fragment

Als zusätzlicher Eintrag unter `services:` im Compose des Service `otakupulse`. Die Dienstnamen der
anderen Container (`otakupulse-db` usw.) bleiben unberührt.

```yaml
  social:
    # Variante A: Coolify baut aus dem Repo (nur wenn der Service eine Git-Quelle hat, siehe „Offene Fragen“)
    build:
      context: ./social/build
    # Variante B: fertiges Image aus einer Registry
    # image: <registry>/otakupulse-social:<tag>
    container_name: otakupulse-social
    restart: unless-stopped
    environment:
      TZ: Europe/Berlin
      DB_PATH: /data/social.sqlite3
      PG_HOST: otakupulse-db
      PG_PORT: "5432"
      PG_DB: otakupulse
      PG_USER: social_ro
      # Alles Weitere als Service-Umgebungsvariable in Coolify (Liste unten), Secrets nie ins Repo:
      PG_PASSWORD: ${PG_PASSWORD}
      SOCIAL_BOT_TOKEN: ${SOCIAL_BOT_TOKEN}
      SOCIAL_APPROVAL_CHAT_ID: ${SOCIAL_APPROVAL_CHAT_ID}
      ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}
      DRY_RUN: ${DRY_RUN:-1}
      DRY_RUN_CHANNELS: ${DRY_RUN_CHANNELS}
      CHANNELS_ENABLED: ${CHANNELS_ENABLED}
      TUMBLR_BLOG_IDENTIFIER: ${TUMBLR_BLOG_IDENTIFIER}
      TUMBLR_CONSUMER_KEY: ${TUMBLR_CONSUMER_KEY}
      TUMBLR_CONSUMER_SECRET: ${TUMBLR_CONSUMER_SECRET}
      TUMBLR_OAUTH_TOKEN: ${TUMBLR_OAUTH_TOKEN}
      TUMBLR_OAUTH_TOKEN_SECRET: ${TUMBLR_OAUTH_TOKEN_SECRET}
      # ... übrige Variablen aus der Liste unten nach demselben Muster
    volumes:
      - social-data:/data
    # Keine ports: der Agent pollt Telegram ausgehend und lauscht auf nichts.

# Auf oberster Ebene des Compose, neben services:
volumes:
  social-data:
```

Gibt es im Compose schon einen `volumes:`-Block auf oberster Ebene, `social-data:` dort **ergänzen**,
keinen zweiten `volumes:`-Key anlegen (ein doppelter Key ist in YAML ein Fehler oder überschreibt
den ersten).

Hinweise zum Fragment:

- Der Agent hat **keinen** eingehenden Port und keinen Healthcheck. Er hängt per Long-Polling am
  Telegram-Bot. Ob er lebt, sieht man im Log (siehe unten) und an `/status`.
- `DRY_RUN: ${DRY_RUN:-1}` fällt auf Trockenmodus zurück, wenn die Variable fehlt. Das ist Absicht.
- Das Netz steht nicht im Fragment: Dienste im selben Compose teilen das Default-Netz des Service
  und erreichen `otakupulse-db` über den Dienstnamen. Welcher Netzname das auf dem VPS ist, bitte
  prüfen (offene Frage), bevor man ein `networks:`-Feld ergänzt.
- Die Zeile mit `${…}` ist die übliche Compose-Schreibweise. Ob Coolify die Werte aus seinen
  Service-Variablen genau so einsetzt oder dafür eine eigene Form braucht, ist nicht geprüft.

## Service-Umgebungsvariablen

Nur Namen. Werte stehen in Coolify, nie in dieser Datei und nie im Repo. Die Vorlage mit
Erklärungen ist [`secrets.env.example`](secrets.env.example).

Steuerpult und Formulierung:
`SOCIAL_BOT_TOKEN`, `SOCIAL_APPROVAL_CHAT_ID`, `ANTHROPIC_API_KEY`, `SOCIAL_MODEL`

Sicherheitsnetz:
`DRY_RUN`, `DRY_RUN_CHANNELS`

Postgres (nur lesend, Rolle `social_ro`):
`PG_HOST`, `PG_PORT`, `PG_DB`, `PG_USER`, `PG_PASSWORD`

Kanäle:
`CHANNELS_ENABLED`: Komma-Liste der aktiven Kanäle, bekannte Namen `tumblr`, `bluesky`,
`mastodon`. **Leer heißt: der Agent läuft fehlerfrei und tut nichts**, `ingest` erzeugt 0 Entwürfe
und loggt nur `Keine aktiven Kanäle`. Ein unbekannter Name (Tippfehler) wird **ohne Warnung**
übergangen; `/status` zeigt unter „Kanäle“, was wirklich aktiv ist. Werte je Phase:

| Phase | `CHANNELS_ENABLED` | `DRY_RUN` | `DRY_RUN_CHANNELS` |
|---|---|---|---|
| Deploy, bis der Seed gelaufen ist (Schritt 4) | leer | `1` | egal |
| Trockenlauf (Schritt 6 bis 9) | `tumblr,bluesky,mastodon` | `1` | leer oder wie unten |
| Tumblr-Livegang, Test-Blog (ab Schritt 10) | `tumblr,bluesky,mastodon` | `0` | `bluesky,mastodon` |

`DRY_RUN_CHANNELS` wirkt nur auf Kanäle, die in `CHANNELS_ENABLED` stehen. Fehlen `bluesky` und
`mastodon` dort, greift `DRY_RUN_CHANNELS` ins Leere, und es ist nur Tumblr aktiv.

Bluesky:
`BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`, `BLUESKY_PDS`

Mastodon:
`MASTODON_BASE_URL`, `MASTODON_ACCESS_TOKEN`

Tumblr:
`TUMBLR_BLOG_IDENTIFIER`, `TUMBLR_CONSUMER_KEY`, `TUMBLR_CONSUMER_SECRET`,
`TUMBLR_OAUTH_TOKEN`, `TUMBLR_OAUTH_TOKEN_SECRET`, `TUMBLR_MAX_POSTS_PER_DAY`

Feintuning:
`SITE_BASE_URL`, `BATCH_HOUR`, `BATCH_MINUTE`, `MAX_DRAFTS_PER_BATCH`, `PERISHABLE_HOURS`

Zustand und Zeit:
`DB_PATH`, `TZ`. Beide stehen schon im Compose-Fragment (`/data/social.sqlite3` und
`Europe/Berlin`) und müssen **nicht** zusätzlich als Service-Variable gepflegt werden. Wer sie
doch als Service-Variable anlegt, muss `DB_PATH` auf einen Pfad **unter `/data`** zeigen lassen:
das ist die Variable, die auf das persistente Volume zeigt. Ein anderer Pfad schreibt in die
Container-Schicht und verliert den Zustand beim Redeploy, ohne Fehlermeldung.

Optionale Rückfälle:
`ALERT_CHAT_ID` (wird nur genutzt, wenn `SOCIAL_APPROVAL_CHAT_ID` leer ist),
`MASTODON_CHAR_LIMIT` (Rückfall, wenn die Instanz kein Zeichenlimit meldet; Code-Default 500).
Beide stehen in `secrets.env.example` und müssen in Coolify nur gesetzt werden, wenn man sie braucht.

Beim Eintragen auf Platzhalter achten: `secrets.env.example` enthält Beispielwerte wie
`HIER_SOCIAL_RO_PASSWORT`. Die gehören nicht in Coolify.

## Erstdeploy

Die Reihenfolge der Schritte steht unter „Inbetriebnahme“. Der Deploy selbst:

1. Abstimmen, wann am Compose gearbeitet wird (siehe „Zwei Dinge vorab“).
2. In Coolify im Service `otakupulse` das Fragment ergänzen, die Umgebungsvariablen anlegen
   (mit `DRY_RUN=1`, `CHANNELS_ENABLED` zunächst **leer**, `TUMBLR_BLOG_IDENTIFIER` auf einen
   **Test-Tumblr**) und das Volume `social-data` auf `/data` setzen.
3. Deployen. Prüfen, dass `otakupulse-app` und `otakupulse-db` danach unverändert laufen und
   `www.otakupulse.de` antwortet.
4. Im Freigabe-Chat einmal `/start` senden, falls `SOCIAL_APPROVAL_CHAT_ID` leer ist.
5. **Datenbank prüfen**, aus dem Container als `social_ro`:
   ```bash
   docker exec otakupulse-social python -c "
   import asyncio
   from app import pg
   async def m():
       await pg.init()
       print(await pg.fetch('SELECT count(*) AS n FROM articles'))
       await pg.close()
   asyncio.run(m())"
   ```
   Erwartet: eine Zeile mit der Artikelzahl, kein Verbindungsfehler. Ein Fehler hier heißt meist
   falsches `PG_PASSWORD` oder der Container hängt nicht im Netz von `otakupulse-db`.

## Logs lesen

Der Agent schreibt nach stdout. Zwei Wege:

- In Coolify: Logs des Containers `social` im Service `otakupulse`.
- Auf dem VPS: `docker logs -f otakupulse-social` (den Containernamen mit
  `docker ps --filter name=social` gegenprüfen, falls Coolify ihn verändert hat).

Worauf achten:

- **Startzeile:** `Startup fertig — <Modus>, Kanäle: [...]`. Hier steht der Ist-Zustand.
- **Warnungen davor** (`⚠️ DRY_RUN_CHANNELS enthält unbekannten Kanal …` oder
  `ACHTUNG: DRY_RUN=0 und DRY_RUN_CHANNELS ist leer — ALLE aktivierten Kanäle …`) nie
  überlesen. Die erste heißt: Tippfehler, der Kanal ist **nicht** trocken. Die zweite: alles geht live.
- Der Log nennt keine Telegram-URLs (`httpx` ist stumm gestellt), damit der Bot-Token nicht im
  Log landet.

Wartungsbefehle im laufenden Container (Ersatz für `manage.sh seed` / `manage.sh cli`):

```bash
docker exec otakupulse-social python -m app.cli status
docker exec otakupulse-social python -m app.cli seed
docker exec otakupulse-social python -m app.cli compose 3   # Vorschau, speichert nichts
```

## Inbetriebnahme

Reihenfolge einhalten. Die Punkte stammen aus den Reviews der Tasks 1 bis 9.

1. **Tumblr-App umbenennen.** Unter <https://www.tumblr.com/oauth/apps> von `Otaku` auf
   `OtakuPulse`. Der Name erscheint öffentlich als „via <Name>“ an jedem Post.
2. **Consumer Secret neu erzeugen.** Der alte stand in einem Screenshot und gilt als verbrannt.
3. **Token holen** auf einem Rechner mit Browser (nicht auf dem VPS):
   `python3 social/tools/tumblr_auth.py`. Das Ergebnis (zwei Zeilen) in `secrets.env` bzw. direkt in
   die Coolify-Variablen. Details im Tumblr-Abschnitt der [`README.md`](README.md).
4. **Deploy mit `DRY_RUN=1`**, Volume auf `/data` gesetzt, `TUMBLR_BLOG_IDENTIFIER` auf einen
   **Test-Tumblr**, und `CHANNELS_ENABLED` **leer**. Nicht auf `otakupulse-de.tumblr.com`.
   - Der Test-Blog muss unter **demselben Tumblr-Account** liegen, mit dem Schritt 3 die Token
     geholt hat (ein Nebenblog dieses Accounts). Sonst passt das Token nicht zum Blog.
   - Das Theme muss auf dem Test-Blog eingesetzt sein ([`tumblr-theme/README.md`](tumblr-theme/README.md)),
     sonst ist Schritt 11 nicht prüfbar. Jetzt erledigen.
   - **Zeitbezug:** Der Batch (Ingest und Versand) läuft täglich um `BATCH_HOUR`/`BATCH_MINUTE`
     (Default 18:00, Zeitzone `TZ`) und zusätzlich auf `/batch` im Bot. Ohne Seed zieht jeder Lauf **6 Altartikel**
     in die Queue (`MAX_DRAFTS_PER_BATCH`), schleichend und ohne Alarm. Deshalb Schritte 4 bis 6
     vor diese Uhrzeit legen, oder `CHANNELS_ENABLED` bis nach dem Seed leer lassen. `/pause`
     reicht dafür **nicht**: es hält nur das Posten an, Entwürfe entstehen weiter.
5. **Migration prüfen.** Nach dem Deploy einmal die Spalten von `drafts` ansehen:
   ```bash
   docker exec otakupulse-social python -c "
   import sqlite3
   c = sqlite3.connect('/data/social.sqlite3')
   for r in c.execute('PRAGMA table_info(drafts)'): print(r)"
   ```
   `tags` und `category` müssen dabei sein. Die Migration (`ALTER TABLE` in `app/db.py`) ist nur per
   Test abgesichert und lief noch nie an einer echten Datenbank. (Im Image gibt es kein
   `sqlite3`-Programm, daher der Umweg über Python.) Bei einem frischen Volume legt der Agent die
   Spalten gleich mit an; der Test sagt dort wenig. Aussagekräftig ist die Prüfung nur an einer
   Datenbank, die schon vor den Spalten existierte.
6. **Seeden.** `docker exec otakupulse-social python -m app.cli seed` markiert alle bereits
   publizierten Artikel als gesehen. **Ohne diesen Schritt zieht jeder Lauf 6 Altartikel nach**
   (siehe Schritt 4). Danach `status`: „Bekannte Quellen“ entspricht der Zahl der publizierten
   Artikel. **Erst jetzt** `CHANNELS_ENABLED=tumblr,bluesky,mastodon` setzen (weiter
   `DRY_RUN=1`) und neu starten; der Zustand bleibt im Volume.
7. **Einen vollen Tag trocken laufen lassen.** Einen Lauf stößt man mit `/batch` im Bot an
   (oder `docker exec otakupulse-social python -m app.cli ingest 6`); sonst läuft er zur
   `BATCH_HOUR`. Die Tag-Zeilen von mindestens 30 Artikeln quer über `news` und `simulcast` von
   Hand durchsehen. Die Tags stehen als JSON-Liste in `drafts.tags`:
   ```bash
   docker exec otakupulse-social python -c "
   import sqlite3
   c = sqlite3.connect('/data/social.sqlite3')
   for r in c.execute(\"SELECT category, title, tags FROM drafts WHERE channel='tumblr' ORDER BY id DESC LIMIT 40\"): print(r)"
   ```
   Jeder peinliche oder explizite Tag ist ein Grund, `TAG_BLOCKLIST` zu erweitern und erneut zu
   prüfen. Die Liste steht als Konstante in `build/app/tagging.py`, eine Änderung heißt also:
   Code ändern, Tests, neues Image, Redeploy.
   Stolperfalle: nach dem Seeden sind nur Artikel **neu**, die nach Schritt 6 erscheinen, und
   ein Lauf nimmt höchstens 6. Ein Tag liefert womöglich keine 30 Stück. Dann länger laufen
   lassen, statt mit weniger Stichprobe weiterzumachen.
8. **Vor dem Scharfschalten `/status` im Telegram-Bot lesen.** Dort muss genau die erwartete
   Aufteilung stehen, zum Beispiel `Modus: LIVE: tumblr · TROCKEN: bluesky, mastodon`, und unter
   „Kanäle“ alle drei Namen. Ein Tippfehler in `DRY_RUN_CHANNELS` trocknet nichts und erzeugt nur
   eine Log-Warnung; ein Tippfehler in `CHANNELS_ENABLED` schaltet den Kanal ohne jede Warnung ab.
9. **Die 14 offenen `pending`-Entwürfe aus Juli 2026 verwerfen, bevor jemals ein Kanal aus
   `DRY_RUN_CHANNELS` entfernt wird.** Das Risiko ist kleiner, als es klingt: ein neuer Batch
   wählt seine Entwürfe über `batch_day` (`pending_for_batch`), die alten tauchen darin nicht auf
   und sind nur über ihre alten Telegram-Nachrichten erreichbar. Verwerfen bleibt trotzdem
   sauberer. Die 14 stammen aus der lokalen Entwicklungsdatenbank; auf einem frischen Volume im
   VPS-Container gibt es sie nicht. Prüfen lässt sich das nach Schritt 7 nicht mehr über
   `pending: 0` in `/status`, denn dann liegen längst neue trockene Entwürfe dort. Stattdessen
   Entwürfe mit altem Datum suchen:
   ```bash
   docker exec otakupulse-social python -c "
   import sqlite3
   c = sqlite3.connect('/data/social.sqlite3')
   for r in c.execute(\"SELECT id, batch_day, channel, state FROM drafts WHERE state='pending' AND batch_day < date('now','-7 day')\"): print(r)"
   ```
   Keine Zeile heißt: nichts Altes da. Wurde der Zustand hinübergenommen und es gibt Zeilen,
   die Entwürfe über ❌ in den alten Telegram-Nachrichten verwerfen.
10. **`DRY_RUN=0` mit `DRY_RUN_CHANNELS=bluesky,mastodon`** und
    `CHANNELS_ENABLED=tumblr,bluesky,mastodon`, weiterhin gegen den Test-Tumblr.
    **Der erste echte Post ist zugleich der Auth-Test.** Ein 401 wäre der Hinweis, dass Tumblr
    doch einen `oauth_body_hash` erwartet. Das ist die einzige Annahme im Projekt, die sich nicht
    vorab verifizieren ließ.
11. **Den ersten echten Post im Browser prüfen** (auf dem Test-Blog, Theme aus Schritt 4). Sitzt das Cover links? Wenn das erste Bild nicht
    als erstes Kind in `.op-body` ankommt, den Selektor in `tumblr-theme/theme.html` nachziehen
    (siehe [`tumblr-theme/README.md`](tumblr-theme/README.md)).
12. **Erst dann** `TUMBLR_BLOG_IDENTIFIER` auf den Markenblog `otakupulse-de.tumblr.com` umstellen.

## Offene Fragen

Nicht geraten, sondern vor dem Deploy zu klären:

- **Baut Coolify das Image selbst oder braucht es eine Registry?** Das hängt daran, wie der
  Service `otakupulse` angelegt ist. Hat er eine Git-Quelle, die `social/build/` enthält, geht
  `build:`. Ist er ein Compose ohne Repo, braucht es ein vorgebautes Image (Variante B im Fragment)
  und eine Stelle, an die es gepusht wird.
- **Wie heißt das Netz des Service tatsächlich?** Gesagt wurde, es heiße wie der Service. Mit
  `docker network ls` auf dem VPS bestätigen, bevor ein `networks:`-Eintrag ergänzt wird. Ohne
  Eintrag sollte der neue Dienst im Default-Netz des Compose landen.
- **Wie setzt Coolify Service-Variablen in das Compose ein?** Siehe Hinweis beim Fragment.
- **Wird das Volume `social-data` gesichert?** Das bestehende Backup (`backup-db.sh`) erfasst
  Postgres, vermutlich nicht dieses Volume. Der Zustand ist wiederherstellbar (`seed` baut
  `seen_sources` neu), aber `posted_log` ginge verloren.
- **Ist die lokale Entwicklungsdatenbank (`social/data/`) auf dem Unraid-Host zu übernehmen?**
  Voreinstellung: nein, das VPS-Volume startet leer und wird geseedet.
