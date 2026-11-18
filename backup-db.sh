#!/bin/bash
# Nächtliches DB-Backup: App-DB (otakupulse) + Umami-DB → /srv/backups/otakupulse,
# gzip, rotierend (14 Tage). Optional Offsite-Upload via rclone, falls ein Remote
# namens "gdrive" konfiguriert ist.
set -euo pipefail

DEST=/srv/backups/otakupulse
KEEP=14
# Offsite je Präfix behalten. Der B2-Bucket hat eine Speichergrenze (Caps & Alerts),
# und 14 Dumps à 36 MB + Umami lagen mit 507 MB genau darüber: ab dem 13.11.2026
# scheiterte jeder Upload mit `403 storage_cap_exceeded`, die neueste Kopie
# offsite war vom 12.11. Mit 7 liegt der Höchststand (7 + 1 frischer Upload vor
# der Nach-Rotation) bei rund 290 MB — Luft, auch wenn die DB weiter wächst.
# Lokal bleiben weiter 14 Tage (KEEP).
KEEP_OFFSITE=7
TS=$(date +%Y%m%d-%H%M%S)
LOG=/srv/backups/otakupulse/backup.log
mkdir -p "$DEST"

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }

dump() { # <container> <user-env> <db-env> <prefix>
  local container="$1" prefix="$2" out="$DEST/$2-$TS.sql.gz"
  if docker exec "$container" sh -lc 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' 2>>"$LOG" | gzip > "$out"; then
    log "OK  $prefix → $(du -h "$out" | cut -f1)  ($out)"
  else
    log "FEHLER beim Dump von $container"; rm -f "$out"; return 1
  fi
}

log "=== Backup-Lauf $TS ==="
dump otakupulse-db otakupulse
dump umami-db umami || log "Umami-Dump übersprungen/fehlgeschlagen (nicht kritisch)"

# Rotation: je Präfix nur die KEEP neuesten behalten.
for p in otakupulse umami; do
  ls -1t "$DEST"/$p-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f
done

# Offsite (Google Drive via rclone), nur wenn Remote "gdrive" konfiguriert ist.
RCLONE=/usr/bin/rclone
export RCLONE_CONFIG=/srv/sites/otakupulse/app-src/rclone.conf
# Offsite-Rotation: je Präfix nur die KEEP_OFFSITE neuesten behalten (B2-Cap!)
offsite_rotate() {
  for p in otakupulse umami; do
    "$RCLONE" lsf offsite:otakupulse-backups --include "$p-*.sql.gz" 2>/dev/null \
      | sort | head -n -$KEEP_OFFSITE | while read -r f; do
        "$RCLONE" deletefile --b2-hard-delete "offsite:otakupulse-backups/$f" 2>>"$LOG"
      done
  done
  log "Offsite-Rotation: je Präfix neueste $KEEP_OFFSITE behalten"
}
if [ -x "$RCLONE" ] && "$RCLONE" listremotes 2>/dev/null | grep -q '^offsite:'; then
  # Auch VOR dem Upload rotieren: Ist der Cap voll, scheitert der Upload, und eine
  # Rotation nur nach Erfolg käme nie zum Zug (Deadlock seit 2026-10-29).
  offsite_rotate
  if "$RCLONE" copy "$DEST" offsite:otakupulse-backups --include "*.sql.gz" --transfers 2 2>>"$LOG"; then
    log "Offsite: nach offsite:otakupulse-backups (Backblaze B2) kopiert"
    offsite_rotate
  else
    log "Offsite-Upload FEHLGESCHLAGEN"
  fi
else
  log "Offsite übersprungen (rclone-Remote 'offsite' noch nicht konfiguriert)"
fi

log "=== fertig ==="
