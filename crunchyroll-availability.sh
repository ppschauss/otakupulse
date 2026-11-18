#!/bin/sh
# Täglicher Crunchyroll-Direktabgleich (crunchyroll-dub.py --availability): belegt die
# Verfügbarkeit laufender Titel direkt beim Anbieter (confirmed, source=crunchyroll).
# Umfang: RELEASING + laufender und vorheriger Jahrgang. Läuft auf dem HOST (curl_cffi).
#
# MUSS NACH catalog-sweep.sh LAUFEN (Cron: Sweep Mo 05:20, dieser Lauf täglich 05:40):
# der Sweep überschreibt die Crunchyroll-Zeile mit einer geerbten, unbestätigten, dieser
# Lauf stellt den Beleg wieder her. Begründung ausführlich in catalog-sweep.sh.
#
# Dieser Lauf ist zugleich der einzige LÖSCHWEG für Crunchyroll-Belege: nach einem
# erfolgreichen Durchlauf räumt der Frische-Verfall Zeilen ab, deren last_seen_at älter
# als 7 Tage ist (expiry_sql). Fällt der Job länger als eine Woche aus, verschwinden
# belegte Zeilen und die Titel fallen auf die gekennzeichnete JustWatch-Angabe zurück —
# ein ausgefallener Lauf ist hier also sichtbar, nicht still.
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
F=/mnt/cache/appdata/otakupulse/frontend
LOG=/tmp/otaku-crunchyroll-availability.log

# Log klein halten (Endlos-Cron): bei >2 MB auf die letzten 500 Zeilen kürzen.
[ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 2000000 ] && { tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; }

cd "$F" || exit 1
echo "===== $(date) crunchyroll-dub.py --availability =====" >> "$LOG"
python3 -u src/scripts/crunchyroll-dub.py --availability >> "$LOG" 2>&1
