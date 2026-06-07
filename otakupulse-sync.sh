#!/bin/sh
# Täglicher OtakuPulse-Sync. Wird per Cron aufgerufen, logt nach /tmp/otaku-sync.log.
# Liegt in der persistenten Appdata (überlebt Reboot — anders als /root auf Unraid).
#   1) AniList-Sync (aktuelle Season + laufende Anime + Episoden) im app-Container.
#   2) JustWatch-Streaming-Anbieter für NEU hinzugekommene Titel (HOST, curl_cffi).
#   3) Blog-Beitrag pro neuem Titel (Claude) im enrich-Container (Live-Code).
#   4) Neue Beiträge in den Telegram-Channel posten.
# enrich-Container bind-mountet den Live-Code; Env per --env-file injiziert
# (so unabhängig davon, wann der Container erstellt wurde).
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
LOG=/tmp/otaku-sync.log
F=/mnt/cache/appdata/otakupulse/frontend
SECRETS="$F/secrets.env"

enrich() { docker exec --env-file "$SECRETS" otakupulse-enrich sh -lc "cd /app && $1" >> "$LOG" 2>&1; }

echo "===== $(date) Sync-Start =====" >> "$LOG"
docker exec otakupulse-app npm run sync >> "$LOG" 2>&1
echo "----- $(date) JustWatch: Anbieter für neue Titel -----" >> "$LOG"
cd "$F" && python3 -u src/scripts/justwatch-streaming.py --recent 3 >> "$LOG" 2>&1
echo "----- $(date) Blog-Beiträge für neue Titel -----" >> "$LOG"
enrich "npx tsx src/scripts/generate-anime-news.ts --recent 3"
echo "----- $(date) Telegram: neue Beiträge posten -----" >> "$LOG"
enrich "npx tsx src/scripts/telegram-notify.ts --max 15"
echo "===== $(date) Sync-Ende =====" >> "$LOG"
