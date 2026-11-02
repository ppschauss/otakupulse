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
> Agent alle ~1160 publizierten Artikel wieder für neu, erzeugt über tausend Entwürfe und postet
> sie, sobald ein Kanal live ist, erneut. Ein Container ohne Volume läuft ohne Fehlermeldung
> einwandfrei, bis zum ersten Redeploy.

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
`CHANNELS_ENABLED`

Bluesky:
`BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`, `BLUESKY_PDS`

Mastodon:
`MASTODON_BASE_URL`, `MASTODON_ACCESS_TOKEN`

Tumblr:
`TUMBLR_BLOG_IDENTIFIER`, `TUMBLR_CONSUMER_KEY`, `TUMBLR_CONSUMER_SECRET`,
`TUMBLR_OAUTH_TOKEN`, `TUMBLR_OAUTH_TOKEN_SECRET`, `TUMBLR_MAX_POSTS_PER_DAY`

Feintuning:
`SITE_BASE_URL`, `BATCH_HOUR`, `BATCH_MINUTE`, `MAX_DRAFTS_PER_BATCH`, `PERISHABLE_HOURS`

Im Fragment fest gesetzt bzw. nicht in `secrets.env.example`, aber vom Code gelesen:
`TZ`, `DB_PATH` (beide im Fragment oben), `ALERT_CHAT_ID` (optional, Ausweich-Chat für
Meldungen), `MASTODON_CHAR_LIMIT` (optional, nur Fallback, wenn die Instanz kein Limit meldet).

Beim Eintragen auf Platzhalter achten: `secrets.env.example` enthält Beispielwerte wie
`HIER_SOCIAL_RO_PASSWORT`. Die gehören nicht in Coolify.

## Erstdeploy

Die Reihenfolge der Schritte steht unter „Inbetriebnahme“. Der Deploy selbst:

1. Abstimmen, wann am Compose gearbeitet wird (siehe „Zwei Dinge vorab“).
2. In Coolify im Service `otakupulse` das Fragment ergänzen, die Umgebungsvariablen anlegen
   (mit `DRY_RUN=1`, `TUMBLR_BLOG_IDENTIFIER` auf einen **Test-Tumblr**) und das Volume
   `social-data` auf `/data` setzen.
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
   **Test-Tumblr**. Nicht auf `otakupulse-de.tumblr.com`.
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
6. **Seeden.** `docker exec otakupulse-social python -m app.cli seed`. **Ohne diesen Schritt erzeugt
   der erste Lauf über tausend Entwürfe.** Danach `status`: „Bekannte Quellen“ entspricht der Zahl
   publizierter Artikel (derzeit rund 1160).
7. **Einen vollen Tag trocken laufen lassen.** Die Tag-Zeilen von mindestens 30 Artikeln quer über
   `news` und `simulcast` von Hand durchsehen. Die Tags stehen als JSON-Liste in `drafts.tags`:
   ```bash
   docker exec otakupulse-social python -c "
   import sqlite3
   c = sqlite3.connect('/data/social.sqlite3')
   for r in c.execute(\"SELECT category, title, tags FROM drafts WHERE channel='tumblr' ORDER BY id DESC LIMIT 40\"): print(r)"
   ```
   Jeder peinliche oder explizite Tag ist ein Grund, `TAG_BLOCKLIST` zu erweitern und erneut zu
   prüfen. Die Liste steht als Konstante in `build/app/tagging.py`, eine Änderung heißt also:
   Code ändern, Tests, neues Image, Redeploy.
   Stolperfalle: nach dem Seeden sind nur Artikel **neu**, die nach Schritt 6 erscheinen. Ein Tag
   liefert womöglich keine 30 Stück. Dann länger laufen lassen, statt mit weniger Stichprobe
   weiterzumachen.
8. **Vor dem Scharfschalten `/status` im Telegram-Bot lesen.** Dort muss genau die erwartete
   Aufteilung stehen, zum Beispiel `Modus: LIVE: tumblr · TROCKEN: bluesky, mastodon`. Ein
   Tippfehler in `DRY_RUN_CHANNELS` trocknet nichts und erzeugt nur eine Log-Warnung.
9. **Die 14 offenen `pending`-Entwürfe aus Juli 2026 verwerfen, bevor jemals ein Kanal aus
   `DRY_RUN_CHANNELS` entfernt wird.** Sonst könnten vier Monate alte Entwürfe echt rausgehen.
   Die 14 stammen aus der lokalen Entwicklungsdatenbank. Auf einem frischen Volume im VPS-Container
   gibt es sie nicht: dann reicht der Blick auf `/status` (`pending: 0`). Wurde der Zustand
   hinübergenommen, die Entwürfe über ❌ im Telegram-Batch verwerfen und `/status` gegenprüfen.
10. **`DRY_RUN=0` mit `DRY_RUN_CHANNELS=bluesky,mastodon`**, weiterhin gegen den Test-Tumblr.
    **Der erste echte Post ist zugleich der Auth-Test.** Ein 401 wäre der Hinweis, dass Tumblr
    doch einen `oauth_body_hash` erwartet. Das ist die einzige Annahme im Projekt, die sich nicht
    vorab verifizieren ließ.
11. **Den ersten echten Post im Browser prüfen.** Sitzt das Cover links? Wenn das erste Bild nicht
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
