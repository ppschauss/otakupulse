# OtakuPulse Autoposter (n8n)

Self-hosted n8n postet neue News-Artikel automatisch in soziale Kanäle.
Quelle ist der News-RSS-Feed (`/feed.xml` = veröffentlichte `articles` mit Cover + Teaser).

## Architektur

```
otakupulse-app  ──(intern)──►  n8n  ──(ausgehend)──►  Discord / Mastodon / Bluesky / Reddit / Facebook
   /feed.xml      http://otakupulse-app:3000/feed.xml
```

- **Container:** `otakupulse-n8n` (Image `docker.n8n.io/n8nio/n8n`), nur im LAN erreichbar
  unter `http://<host>:5678`. Kein eingehender Webhook nötig — n8n **pollt** den Feed.
- **Dedup:** Der RSS-Feed-Trigger merkt sich gesehene Items selbst → jeder Artikel wird
  genau einmal gepostet. Kein DB-Feld nötig (anders als beim Telegram-Poster).
- **Daten:** Container-Volume `/mnt/cache/appdata/otakupulse/n8n` (im DB-Backup nicht enthalten —
  Workflows liegen versioniert hier im Repo, Credentials im Volume + `N8N_ENCRYPTION_KEY`).
- **Bilder:** Sobald der Prod-Build mit der erweiterten `lib/feed.ts` live ist, enthält der Feed
  `coverImageUrl` als `<enclosure>`/`<media:content>`. Discord/Mastodon/Facebook **unfurlen**
  den Link ohnehin zur Karte mit OG-Bild — separates Bild-Anhängen ist nur bei Bluesky nötig.

## Erststart

1. `http://<host>:5678` öffnen → Owner-Account anlegen (lokal, bleibt im LAN).
2. Der Workflow **„OtakuPulse Autoposter" ist bereits importiert** (via `n8n import:workflow`).
   Falls er fehlt: Menü → *Import from File* → `otakupulse-autoposter.json`.
3. In den Plattform-Nodes die `HIER_…`-Platzhalter ersetzen (s. u.). Nicht genutzte
   Kanäle einfach löschen oder deaktivieren (Node → *Disable*).
4. **Save** + Workflow oben rechts **aktivieren**.

> Enthält **alle fünf Kanäle**: Discord, Mastodon, Bluesky (Login → Post mit Link-Karte),
> Reddit (nativer Node), Facebook. Discord/Mastodon laufen sofort, sobald Token gesetzt.

## Tokens je Plattform

### Discord (trivial)
Server → *Einstellungen → Integrationen → Webhooks → Neuer Webhook* → URL kopieren →
in Node **→ Discord** statt `HIER_DISCORD_WEBHOOK_URL_EINTRAGEN` einsetzen.

### Mastodon (leicht)
Auf deiner Instanz: *Einstellungen → Entwicklung → Neue Anwendung*, Scope `write:statuses`,
Token kopieren. Im Node **→ Mastodon**: `DEINE-INSTANZ.social` auf deine Instanz ändern und
`HIER_MASTODON_ACCESS_TOKEN_EINTRAGEN` ersetzen.

### Bluesky (im Workflow: „Bluesky: Login" → „→ Bluesky")
Per **App-Passwort** (bsky.app → Einstellungen → App-Passwords → neues anlegen).
Im Node **Bluesky: Login** im JSON-Body `DEIN-HANDLE.bsky.social` und `HIER_BLUESKY_APP_PASSWORT`
ersetzen. Der Login liefert `accessJwt` + `did`; der Folge-Node **→ Bluesky** baut daraus einen
Post mit **externer Link-Karte** (`app.bsky.embed.external`, Titel + Teaser).
Optional: Vorschaubild via `com.atproto.repo.uploadBlob` hochladen und als `external.thumb` setzen.

### Reddit (nativer Node „→ Reddit" — erst eigenes Sub anlegen!)
**Wichtig:** In fremden Subs wird Self-Promo gebannt → leg ein eigenes Sub an (z. B. r/OtakuPulse).
1. reddit.com/prefs/apps → *create app* → Typ **script** → client id + secret notieren.
2. In n8n: Node **→ Reddit** öffnen → *Credential to connect with* → **Reddit OAuth2 API** neu
   anlegen (client id/secret eintragen, OAuth-Flow durchklicken).
3. Im Node ggf. `subreddit` (Default `OtakuPulse`) anpassen. Kind = *link*, Title/URL sind verdrahtet.

### Facebook (HTTP-Node „→ Facebook" — höchster Aufwand)
Meta-App anlegen, **Page Access Token** (long-lived) besorgen, App-Review für `pages_manage_posts`.
Im Node **→ Facebook**: `HIER_PAGE_ID` und `HIER_PAGE_ACCESS_TOKEN` im JSON-Body ersetzen
(POST an `https://graph.facebook.com/v21.0/{PAGE_ID}/feed`). Tipp: Token nicht im Klartext lassen —
besser als n8n-Credential bzw. über den nativen *Facebook Graph API*-Node speichern.

## Betrieb / Tipps

- **Test ohne Spam:** Im RSS-Trigger einmal manuell „Fetch Test Event" — danach gilt alles als
  „gesehen". So flutet der erste echte Lauf die Kanäle nicht mit Altbestand.
- **Rate-Limit:** Poll-Intervall 15 Min ist konservativ; bei Bedarf erhöhen.
- **Logs:** `docker logs -f otakupulse-n8n`.
- **Workflow-Änderungen** zurück ins Repo exportieren: in n8n *Download* → diese JSON ersetzen.
