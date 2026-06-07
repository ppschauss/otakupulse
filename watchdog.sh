#!/bin/bash
# Uptime-Watchdog: prüft alle paar Minuten, ob die App antwortet. Reagiert NUR,
# wenn der Container läuft, aber kein HTTP 200 liefert (so wird ein bewusst
# gestoppter Container während Deploys NICHT angefasst). Heilt per Neustart und
# alarmiert via Telegram (falls ALERT_CHAT_ID in secrets.env gesetzt).
set -uo pipefail

APP=otakupulse-app
URL=http://localhost:3001/
LOG=/mnt/cache/appdata/backups/watchdog.log
SECRETS=/mnt/cache/appdata/otakupulse/frontend/secrets.env

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

# Nur eingreifen, wenn der Container überhaupt laufen soll.
running=$(docker inspect -f '{{.State.Running}}' "$APP" 2>/dev/null || echo false)
[ "$running" = "true" ] || exit 0

check() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$URL" 2>/dev/null || echo 000; }

code=$(check)
[ "$code" = "200" ] && exit 0

sleep 12
code=$(check)
[ "$code" = "200" ] && { log "Erholte sich von sich aus (kurzer Aussetzer)"; exit 0; }

log "App antwortet nicht (HTTP $code) → Neustart $APP"
docker restart "$APP" >/dev/null 2>&1

# Telegram-Alarm (optional)
TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$SECRETS" 2>/dev/null | head -1 | cut -d= -f2-)
CHAT=$(grep -E '^ALERT_CHAT_ID=' "$SECRETS" 2>/dev/null | head -1 | cut -d= -f2-)
if [ -n "${TOKEN:-}" ] && [ -n "${CHAT:-}" ]; then
  curl -s -o /dev/null --max-time 15 "https://api.telegram.org/bot${TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${CHAT}" \
    --data-urlencode "text=⚠️ OtakuPulse war nicht erreichbar (HTTP ${code}) und wurde automatisch neu gestartet." \
    && log "Telegram-Alarm gesendet"
fi

# Nachkontrolle
sleep 20
log "Status nach Neustart: HTTP $(check)"
