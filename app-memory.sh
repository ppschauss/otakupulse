#!/bin/sh
# Speicherverlauf der App alle 15 Minuten — Diagnose der Heap-Abstürze (restart-app.sh).
# Wächst die Kurve gleichmäßig über den Tag, ist es ein Leck. Springt sie kurz vor
# 21:30, gibt es einen Auslöser (Anfrage, Job) — dann lohnt der Blick in die Logs
# genau dieser Minuten. Klein gehalten: die letzten 3000 Messpunkte (~31 Tage).
export PATH=/opt/otakupulse-cron/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
LOG=/srv/backups/otakupulse/app-memory.log
m=$(docker stats --no-stream --format '{{.MemUsage}}' otakupulse-app 2>/dev/null | cut -d/ -f1 | tr -d ' ')
echo "$(date '+%F %T') ${m:-?}" >> "$LOG"
if [ "$(wc -l < "$LOG")" -gt 3000 ]; then tail -n 3000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi
