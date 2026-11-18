#!/bin/sh
# Rollierende JustWatch-Auffrischung: pro Lauf ein kleiner Batch der am längsten
# nicht geprüften Titel (--stale). Über viele kleine Läufe rotiert der ganze
# ~11k-Katalog durch, ohne die Quelle mit einem Burst aufzuscheuchen (der einmalige
# --only-missing-Backfill hatte JustWatch mit ~85 Anfragen/Sek. auf 403 geschickt).
# Autoritativ auf gematchten Titeln: fügt neue Anbieter hinzu UND entfernt
# verschwundene; stempelt streaming_checked_at. Läuft auf dem HOST (curl_cffi).
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
F=/mnt/cache/appdata/otakupulse/frontend
LOG=/tmp/otaku-streaming-refresh.log
BATCH=150

# Log klein halten (Endlos-Cron): bei >2 MB auf die letzten 500 Zeilen kürzen.
[ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 2000000 ] && { tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; }

cd "$F" || exit 1
echo "===== $(date) --stale $BATCH =====" >> "$LOG"
python3 -u src/scripts/justwatch-streaming.py --stale "$BATCH" >> "$LOG" 2>&1

# Selbstprüfung der Angebote (C1-C6, rein SQL): die Folgenzahl beim Anbieter muss
# zur Folgenzahl des Eintrags passen, sonst zeigt das Mapping auf einen anderen
# Titel. Nur ins Log — der Cron soll nicht an Restbefunden hängen; `|| true`, weil
# das Skript bei error-Befunden bewusst mit 1 endet (CI-Gate).
echo "--- offer-audit ---" >> "$LOG"
python3 -u src/scripts/offer-audit.py >> "$LOG" 2>&1 || true
