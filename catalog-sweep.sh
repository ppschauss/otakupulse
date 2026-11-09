#!/bin/sh
# Wöchentlicher JustWatch-Katalog-Sweep (justwatch-catalog.py --sweep): pro Anbieter
# dessen vollständiger DE-Anime-Katalog (~100 Requests statt 11.061 Titelsuchen).
# Setzt streaming_verified_at für erfasste Titel — nur bei vollständigem Abruf
# (Exit 0); Exit 1 = unvollständig (nichts verifiziert), Exit 2 = Instanz-Sperre.
# Läuft auf dem HOST (curl_cffi). Danach prüft streaming-alarm.sh auf Lücken.
#
# CRON-REIHENFOLGE IST EINE ANFORDERUNG, KEIN ZUFALL:
#   der Sweep (Mo 05:20) läuft VOR dem Crunchyroll-Lauf (täglich 05:40).
#   Der Sweep löscht autoritativ und ignoriert dabei `source` — er überschreibt also die
#   von Crunchyroll belegte Zeile mit einer geerbten, unbestätigten. Der Crunchyroll-Lauf
#   danach stellt den Beleg wieder her; das System heilt sich selbst.
#   Abgelehnte Alternative: der Sweep spart source='crunchyroll' aus. Dann könnte er ein
#   echtes Lizenzende nie mehr entfernen, und die Zeile wäre für Titel außerhalb des
#   Crunchyroll-Umfangs dauerhaft eingefroren (dagegen hat Aufgabe 12 ihren Regressionstest).
#   Wer die Uhrzeiten ändert: Sweep muss VOR crunchyroll-availability.sh liegen.
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
F=/mnt/cache/appdata/otakupulse/frontend
LOG=/tmp/otaku-catalog-sweep.log

# Log klein halten (Endlos-Cron): bei >2 MB auf die letzten 500 Zeilen kürzen.
[ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 2000000 ] && { tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; }

cd "$F" || exit 1
echo "===== $(date) justwatch-catalog.py --sweep =====" >> "$LOG"
python3 -u src/scripts/justwatch-catalog.py --sweep >> "$LOG" 2>&1
RC=$?
echo "===== $(date) Exit $RC =====" >> "$LOG"

/mnt/cache/appdata/otakupulse/streaming-alarm.sh >> "$LOG" 2>&1
exit $RC
