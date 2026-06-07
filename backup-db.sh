#!/bin/bash
# Nächtliches DB-Backup: App-DB (otakupulse) + Umami-DB → /mnt/cache/appdata/backups,
# gzip, rotierend (14 Tage). Optional Offsite-Upload via rclone, falls ein Remote
# namens "gdrive" konfiguriert ist.
set -euo pipefail

DEST=/mnt/cache/appdata/backups
KEEP=14
TS=$(date +%Y%m%d-%H%M%S)
LOG=/mnt/cache/appdata/backups/backup.log
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
RCLONE=/mnt/cache/appdata/otakupulse/bin/rclone
export RCLONE_CONFIG=/mnt/cache/appdata/otakupulse/rclone.conf
if [ -x "$RCLONE" ] && "$RCLONE" listremotes 2>/dev/null | grep -q '^offsite:'; then
  if "$RCLONE" copy "$DEST" offsite:otakupulse-backups --include "*.sql.gz" --transfers 2 2>>"$LOG"; then
    log "Offsite: nach offsite:otakupulse-backups (Backblaze B2) kopiert"
  else
    log "Offsite-Upload FEHLGESCHLAGEN"
  fi
else
  log "Offsite übersprungen (rclone-Remote 'offsite' noch nicht konfiguriert)"
fi

log "=== fertig ==="
