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
2. **Import:** Menü (oben rechts) → *Import from File* → `otakupulse-autoposter.json`.
3. In den beiden Nodes die Platzhalter ersetzen (s. u.), dann **Save** + Workflow **aktivieren**.

> Der Starter enthält **Discord + Mastodon** (je ein einzelner POST, sofort verifizierbar).
> Bluesky/Reddit/Facebook unten anbauen.

## Tokens je Plattform

### Discord (trivial)
Server → *Einstellungen → Integrationen → Webhooks → Neuer Webhook* → URL kopieren →
in Node **→ Discord** statt `HIER_DISCORD_WEBHOOK_URL_EINTRAGEN` einsetzen.

### Mastodon (leicht)
Auf deiner Instanz: *Einstellungen → Entwicklung → Neue Anwendung*, Scope `write:statuses`,
Token kopieren. Im Node **→ Mastodon**: `DEINE-INSTANZ.social` auf deine Instanz ändern und
`HIER_MASTODON_ACCESS_TOKEN_EINTRAGEN` ersetzen.

### Bluesky (Anbau, 2 Schritte)
Bluesky braucht erst eine Session, dann den Post. Per **App-Passwort** (Einstellungen → App Passwords):
1. HTTP POST `https://bsky.social/xrpc/com.atproto.server.createSession`
   Body `{ "identifier": "handle.bsky.social", "password": "APP-PASSWORT" }` → liefert `accessJwt` + `did`.
2. HTTP POST `https://bsky.social/xrpc/com.atproto.repo.createRecord`
   Header `Authorization: Bearer {{accessJwt}}`, Body:
   ```json
   { "repo": "{{did}}", "collection": "app.bsky.feed.post",
     "record": { "$type": "app.bsky.feed.post", "text": "TITEL\n\nLINK", "createdAt": "{{$now.toISO()}}" } }
   ```
   Für eine Link-Karte mit Bild zusätzlich `embed: app.bsky.embed.external` mit `uri/title/description`
   und (optional) `thumb` via `uploadBlob` setzen.

### Reddit (Anbau — erst eigenes Sub anlegen!)
**Wichtig:** In fremden Subs wird Self-Promo gebannt → leg ein eigenes Sub an (z. B. r/OtakuPulse).
Dann reddit.com/prefs/apps → *script*-App anlegen (client id + secret). In n8n den nativen
**Reddit**-Node nutzen (OAuth2-Credential), Operation *Post → Create*, Subreddit = euer Sub,
Kind *link*, Title = `{{$json.title}}`, URL = `{{$json.link}}`.

### Facebook (Anbau — höchster Aufwand)
Meta-App anlegen, **Page Access Token** (long-lived) besorgen, App-Review für `pages_manage_posts`.
Dann HTTP POST `https://graph.facebook.com/v21.0/{PAGE_ID}/feed`
Body `{ "message": "{{title}}", "link": "{{link}}", "access_token": "PAGE_TOKEN" }`.

## Betrieb / Tipps

- **Test ohne Spam:** Im RSS-Trigger einmal manuell „Fetch Test Event" — danach gilt alles als
  „gesehen". So flutet der erste echte Lauf die Kanäle nicht mit Altbestand.
- **Rate-Limit:** Poll-Intervall 15 Min ist konservativ; bei Bedarf erhöhen.
- **Logs:** `docker logs -f otakupulse-n8n`.
- **Workflow-Änderungen** zurück ins Repo exportieren: in n8n *Download* → diese JSON ersetzen.
