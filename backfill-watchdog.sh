#!/bin/bash
# TEMPORÄRER Watchdog für den 2000–2011-Anime-Backfill.
# Prüft alle paar Minuten: läuft der Import? Ist er fertig?
#  - fertig  → entfernt sich selbst (Cron-Fragment) und stoppt
#  - läuft   → nichts tun
#  - gestoppt & nicht fertig → Import neu starten (resumable, überspringt Vorhandenes)
set -u

BASE=/mnt/cache/appdata/otakupulse
LOG="$BASE/frontend/backfill-2000-2011.log"
WLOG="$BASE/backfill-watchdog.log"
CRON=/boot/config/plugins/dynamix/otakupulse-backfill.cron
ENVF="$BASE/frontend/secrets.env"
CMD='cd /app && npx tsx src/scripts/backfill-years.ts --startYear 2000 --endYear 2011 >> /app/backfill-2000-2011.log 2>&1'

ts() { date '+%Y-%m-%d %H:%M:%S'; }

# 1) Fertig? → Watchdog selbst deaktivieren.
if grep -q '✓ Fertig' "$LOG" 2>/dev/null; then
  echo "$(ts) Backfill fertig – Watchdog entfernt sich." >> "$WLOG"
  rm -f "$CRON"
  /usr/local/sbin/update_cron >/dev/null 2>&1
  exit 0
fi

# 2) Läuft noch? → nichts tun.
if docker exec otakupulse-enrich pgrep -f backfill-years.ts >/dev/null 2>&1; then
  exit 0
fi

# 3) Gestoppt & nicht fertig → neu starten.
echo "$(ts) Import nicht aktiv & nicht fertig → Neustart." >> "$WLOG"
docker exec -d --env-file "$ENVF" otakupulse-enrich sh -lc "$CMD"
