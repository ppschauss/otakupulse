#!/bin/sh
# Auffrischung der Streaming-Angebote, nach Aktualität gestaffelt.
#
# Anbieter-Kataloge bewegen sich bei neuen Titeln; ein Klassiker von 2003 wechselt
# selten die Plattform. `--due` wählt deshalb nur fällige Titel (Intervalle in
# REFRESH_TIERS: laufend 3 Tage, bis 16 Monate 7, bis 5 Jahre 30, bis 15 Jahre 90,
# älter 180) und nimmt die am stärksten überfälligen zuerst — gemessen in Vielfachen
# des eigenen Intervalls, damit keine Stufe verhungert. Im Dauerbetrieb sind das rund
# 230 Titel pro Tag statt 900 beim alten `--stale 150`, und die laufende Season wird
# dabei häufiger geprüft als vorher.
#
# Autoritativ auf gematchten Titeln: fügt neue Anbieter hinzu UND entfernt
# verschwundene; stempelt streaming_checked_at. Läuft auf dem HOST (curl_cffi).
# JustWatch verträgt ein Worker mit 1,2 s Pause (~0,6 Titel/s) — nie zwei Läufe
# parallel, dafür sorgt die Instanz-Sperre im Skript.
export PATH=/opt/otakupulse-cron/bin:/opt/otakupulse-cron/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
F=/srv/sites/otakupulse/app-src/frontend
LOG=/tmp/otaku-streaming-refresh.log
BATCH=80
# Nachholaktion: Titel ohne Angebot, die noch nie mit ID-Verifikation geprüft wurden
# (die ging am 18.11.2026 live). Beliebteste zuerst. Beendet sich selbst — sobald alle
# einmal danach geprüft sind, liefert die Abfrage nichts mehr und der Lauf ist ein
# No-op. Stichprobe vorab: 21 von 60 populären Titeln ohne Angebote hatten welche.
NACHHOLEN=150
SEIT=2026-11-18T21:00:00Z

# Log klein halten (Endlos-Cron): bei >2 MB auf die letzten 500 Zeilen kürzen.
[ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 2000000 ] && { tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; }

cd "$F" || exit 1
echo "===== $(date) --due $BATCH =====" >> "$LOG"
python3 -u src/scripts/justwatch-streaming.py --due "$BATCH" >> "$LOG" 2>&1

echo "--- Nachholen: --unmatched-top $NACHHOLEN --not-checked-since $SEIT ---" >> "$LOG"
python3 -u src/scripts/justwatch-streaming.py --unmatched-top "$NACHHOLEN" --not-checked-since "$SEIT" >> "$LOG" 2>&1

# Selbstprüfung der Angebote (C1-C6, rein SQL): die Folgenzahl beim Anbieter muss
# zur Folgenzahl des Eintrags passen, sonst zeigt das Mapping auf einen anderen
# Titel. Nur ins Log — der Cron soll nicht an Restbefunden hängen; "|| true", weil
# das Skript bei error-Befunden bewusst mit 1 endet (CI-Gate).
echo "--- offer-audit ---" >> "$LOG"
python3 -u src/scripts/offer-audit.py >> "$LOG" 2>&1 || true
