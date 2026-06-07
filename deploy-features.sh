#!/bin/sh
# Deploy: RSS-Feeds + Telegram-Admin-Push. Schema-Push lief bereits.
# Pre-Build zuerst → bei Fehler bleibt die laufende App unangetastet (keine Downtime).
set -u
F=/mnt/cache/appdata/otakupulse/frontend
SECRETS="$F/secrets.env"

echo "== 1/6 Pre-Build (validiert Code + erzeugt .next) im enrich-Container =="
if ! docker exec --env-file "$SECRETS" -e NODE_ENV=production otakupulse-enrich sh -lc 'cd /app && npx next build'; then
  echo "❌ BUILD FEHLGESCHLAGEN — App NICHT angefasst, nichts geändert. Abbruch."
  exit 1
fi

echo "== 2/6 Baseline-Seed: alte Redaktions-Artikel als 'gepostet' markieren =="
docker exec otakupulse-db psql -U otaku -d otakupulse -c \
"UPDATE articles SET telegram_posted_at = now() WHERE _status='published' AND telegram_posted_at IS NULL AND slug NOT LIKE 'neu-%';"

echo "== 3/6 App-Container mit Live-Code neu erstellen (nutzt das Pre-Build .next) =="
docker stop otakupulse-app >/dev/null 2>&1
docker rm   otakupulse-app >/dev/null 2>&1
docker run -d --name otakupulse-app \
  --network otakupulse-net --restart unless-stopped \
  -p 3001:3000 -w /app \
  --env-file "$SECRETS" -e NODE_ENV=production \
  -v "$F":/app \
  otakupulse:prod \
  sh -lc 'npm run start'

echo "== 4/6 Warte auf App =="
up=0
for i in $(seq 1 40); do
  if curl -fsS -o /dev/null http://127.0.0.1:3001/; then echo "✅ App ist oben (nach ~$((i*3))s)."; up=1; break; fi
  sleep 3
done
[ "$up" = 1 ] || echo "⚠️  App nach 120s noch nicht erreichbar — Logs prüfen: docker logs --tail 50 otakupulse-app"

echo "== 5/6 Obsolete JSON-State löschen (Dedup läuft jetzt über DB) =="
rm -f "$F/.telegram-posted.json"

echo "== 6/6 Neue Anime-Posts in den Telegram-Channel (gedrosselt, 3s/Post) =="
docker exec --env-file "$SECRETS" otakupulse-enrich sh -lc 'cd /app && npx tsx src/scripts/telegram-notify.ts --max 50'

echo ""
echo "🎉 Deploy fertig. Prüfe: /legal/admin (Felder + Feeds), t.me/otakupulse_de (Posts)."
