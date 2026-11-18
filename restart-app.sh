#!/bin/bash
# Täglicher, kontrollierter Neustart der App (Cron 06:30).
#
# Warum: Der Node-Prozess wächst über den Tag auf über 4 GB Heap und stirbt dann mit
# „JavaScript heap out of memory" — viermal zwischen 05.11. und 17.11.2026, jedes Mal
# zwischen 21:30 und 22:05 Uhr, also mitten in der Abendnutzung. Ein Neustart in der
# ruhigsten Stunde setzt den Heap zurück, bevor er voll läuft. Das behebt das Leck
# nicht — dafür protokolliert app-memory.sh den Speicherverlauf —, aber es verlegt
# den Ausfall aus dem Abend in einen geplanten Moment ohne Besucher.
#
# 06:30 und nicht früher: der AniList-Sync läuft ab 04:15 IM App-Container
# (docker exec … npm run sync) und würde von einem Neustart abgeschossen.
set -uo pipefail
export PATH=/opt/otakupulse-cron/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
APP=otakupulse-app
LOG=/srv/backups/otakupulse/watchdog.log
LOCK=/tmp/otakupulse-deploy.lock
log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

# Nicht während eines Deploys …
if [ -f "$LOCK" ] && [ $(( $(date +%s) - $(stat -c %Y "$LOCK") )) -lt 1200 ]; then
  log "Geplanter Neustart übersprungen: Deploy läuft"; exit 0
fi
# … und nicht, solange der Sync im Container läuft. „[s]" verhindert, dass pgrep
# seine eigene Kommandozeile mitzählt.
if docker exec "$APP" pgrep -f '[s]cripts/sync.ts' >/dev/null 2>&1; then
  log "Geplanter Neustart übersprungen: AniList-Sync läuft noch"; exit 0
fi

vorher=$(docker stats --no-stream --format '{{.MemUsage}}' "$APP" 2>/dev/null | cut -d/ -f1 | tr -d ' ')
# Watchdog für die Dauer des Neustarts ruhigstellen (dieselbe Sperre wie beim Deploy).
touch "$LOCK"
trap 'rm -f "$LOCK"' EXIT
docker restart "$APP" >/dev/null 2>&1
code=000
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://localhost:3001/ || true)
  if [ "$code" = "200" ]; then
    log "Geplanter Neustart (Speicher vorher: ${vorher:-?}) — oben nach ~$((i * 3))s"
    exit 0
  fi
  sleep 3
done
# Sperre fällt beim Exit weg, dann greift der Watchdog innerhalb von 5 Minuten.
log "Geplanter Neustart: App antwortet nach 90 s nicht (HTTP $code) — Watchdog übernimmt"
