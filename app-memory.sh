#!/bin/sh
# Speicherverlauf der App alle 15 Minuten — Diagnose der Heap-Abstürze (restart-app.sh).
#
# Gemessen wird `anon` aus memory.stat des Containers: der anonyme Speicher aller
# Prozesse darin, also Heaps und native Allokationen. NICHT `docker stats` — das zählt
# je nach cgroup-Version den Kernel-Seitencache mit (ISR-Dateien, gelesene Bilder).
# Auf Staging zeigte `docker stats` nach zwei Crawls 3,5 GB, der Prozess selbst hatte
# 329 MB und der lebende JS-Heap 102 MB; der Rest war Datei-Cache.
#
# Wächst `anon` gleichmäßig über den Tag, ist es ein Leck. Springt es kurz vor 21:30,
# gibt es einen Auslöser (Anfrage, Job). Klein gehalten: die letzten 3000 Messpunkte.
export PATH=/opt/otakupulse-cron/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
LOG=/srv/backups/otakupulse/app-memory.log
werte=$(docker exec otakupulse-app sh -c 'grep -E "^(anon|file) " /sys/fs/cgroup/memory.stat' 2>/dev/null \
  | awk '{printf "%s=%dMB ", $1, $2/1048576}')
echo "$(date '+%F %T') ${werte:-?}" >> "$LOG"
if [ "$(wc -l < "$LOG")" -gt 3000 ]; then tail -n 3000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi
