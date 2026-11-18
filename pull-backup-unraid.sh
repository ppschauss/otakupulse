#!/bin/bash
# Zweites, unabhängiges Offsite-Ziel für die OtakuPulse-Dumps: der UNRAID zieht sie
# nachts vom VPS. Läuft auf dem Unraid, nicht auf dem VPS.
#
# Warum: Das B2-Offsite (backup-db.sh) hängt an einem einzigen Konto, und das stand
# ab dem 13.11.2026 an seiner Speichergrenze — OtakuPulse UND Matrix bekamen ab da
# keine Offsite-Kopie mehr, sechs Tage lang unbemerkt. Ein zweites Ziel bei einem
# anderen Anbieter (hier: der Homeserver) fällt nicht aus demselben Grund aus.
#
# PULL statt Push: der VPS bekommt keinen Zugang zum Unraid. Ein kompromittierter VPS
# kann diese Kopien also weder lesen noch löschen. Gezogen wird nur, nie gelöscht
# (kein --delete); die Rotation passiert hier auf dem Unraid.
#
# Fehlschläge melden sich über Unraids eigene Benachrichtigung (Web-UI plus die dort
# eingestellten Kanäle) — still scheitern ist genau das, was beim B2-Offsite passiert ist.
#
# Installation (Unraid):
#   cp pull-backup-unraid.sh /mnt/cache/appdata/backups/otakupulse-vps-pull.sh
#   /boot/config/plugins/dynamix/otakupulse-vps-pull.cron:
#     5 4 * * * /mnt/cache/appdata/backups/otakupulse-vps-pull.sh &> /dev/null
#   update_cron
#
# Achtung Tailscale: die Verbindung läuft über Tailscale SSH. Steht die Regel für
# diese Verbindung auf "check", verlangt Tailscale regelmäßig eine Bestätigung im
# Browser — ein Cron kann das nicht, der Abzug scheitert dann (mit Meldung, s. u.).
# Dauerhaft lösen: in der Tailscale-ACL für Quelle "isekai" → VPS die SSH-Regel auf
# "action": "accept" setzen.
set -uo pipefail

VPS=administrator@100.64.244.17
SRC=/srv/backups/otakupulse
DEST=/mnt/cache/appdata/backups/otakupulse-vps
KEEP=30            # je Präfix; ~1,1 GB bei 37 MB pro Dump
MAX_ALTER_H=36     # neuester Dump älter → Warnung (Backup auf dem VPS steht?)
LOG="$DEST/pull.log"
NOTIFY=/usr/local/emhttp/webGui/scripts/notify

mkdir -p "$DEST"
log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }
melde() { # <normal|warning|alert> <Betreff> <Text>
  [ -x "$NOTIFY" ] && "$NOTIFY" -e "OtakuPulse-Backup" -i "$1" -s "$2" -d "$3" >/dev/null 2>&1
  log "MELDUNG ($1): $2 — $3"
}

log "=== Abzug vom VPS ==="
marker=$(mktemp)

# 1) Ziehen. Nur die beiden Präfixe; timeout, weil eine ausstehende Tailscale-
#    Bestätigung die Verbindung sonst unbegrenzt offen hält.
timeout 900 rsync -a \
  --include='otakupulse-*.sql.gz' --include='umami-*.sql.gz' --exclude='*' \
  -e "ssh -o BatchMode=yes -o ConnectTimeout=20 -o ServerAliveInterval=15" \
  "$VPS:$SRC/" "$DEST/" 2>>"$LOG"
rc=$?
if [ "$rc" -ne 0 ]; then
  grund="rsync Exit $rc"
  [ "$rc" -eq 124 ] && grund="Zeitüberschreitung — wartet Tailscale auf eine Bestätigung im Browser?"
  melde alert "Abzug vom VPS fehlgeschlagen" "$grund. Vorhandene Kopien bleiben unangetastet."
fi

# 2) Integrität der in diesem Lauf neu angekommenen Dumps. -cnewer statt -newer:
#    rsync -a übernimmt die Änderungszeit der Quelle (03:30 auf dem VPS), die
#    Inode-Zeit (ctime) setzt es beim Anlegen dagegen zwangsläufig auf jetzt.
kaputt=0
while IFS= read -r f; do
  if gzip -t "$f" 2>/dev/null; then
    log "OK  $(basename "$f") ($(du -h "$f" | cut -f1))"
  else
    kaputt=$((kaputt + 1)); log "DEFEKT $(basename "$f")"
  fi
done < <(find "$DEST" -maxdepth 1 -name '*.sql.gz' -cnewer "$marker" 2>/dev/null | sort)
rm -f "$marker"
[ "$kaputt" -gt 0 ] && melde alert "Defekte Dumps gezogen" "$kaputt Datei(en) bestehen gzip -t nicht (siehe $LOG)."

# 3) Rotation hier auf dem Unraid: je Präfix die KEEP neuesten behalten.
for p in otakupulse umami; do
  ls -1t "$DEST"/$p-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | while IFS= read -r alt; do
    rm -f "/mnt/cache/appdata/backups/otakupulse-vps/$(basename "$alt")"
  done
done

# 4) Frische: steht das Backup auf dem VPS, kommt nichts Neues mehr an — auch wenn
#    der Abzug selbst funktioniert.
neuester=$(ls -1t "$DEST"/otakupulse-*.sql.gz 2>/dev/null | head -1)
if [ -z "$neuester" ]; then
  melde alert "Keine OtakuPulse-Dumps auf dem Unraid" "$DEST ist leer."
else
  alter_h=$(( ( $(date +%s) - $(stat -c %Y "$neuester") ) / 3600 ))
  if [ "$alter_h" -gt "$MAX_ALTER_H" ]; then
    melde warning "OtakuPulse-Backup veraltet" "Neuester Dump ist ${alter_h} h alt ($(basename "$neuester")) — läuft backup-db.sh auf dem VPS?"
  fi
fi

anzahl=$(ls -1 "$DEST"/otakupulse-*.sql.gz 2>/dev/null | wc -l)
log "=== fertig: $anzahl OtakuPulse-Dumps auf dem Unraid, neuester $(basename "${neuester:-keiner}") ==="
