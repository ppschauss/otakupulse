#!/bin/bash
# Nächtliches DB-Backup: App-DB (otakupulse) + Umami-DB → /srv/backups/otakupulse,
# gzip, rotierend (14 Tage). Optional Offsite-Upload via rclone, falls ein Remote
# namens "gdrive" konfiguriert ist.
set -euo pipefail

# PATH selbst setzen statt sich auf die Cron-Datei zu verlassen: der Docker-Wrapper
# in /opt/otakupulse-cron/bin übersetzt die Unraid-Containernamen auf die Coolify-
# Namen. Ohne ihn findet `docker exec otakupulse-db` nichts — bei einem Aufruf von
# Hand (sudo) brach der Dump ab, und der Watchdog hielt den Container für gestoppt
# und meldete Exit 0, ohne die App je geprüft zu haben.
export PATH=/opt/otakupulse-cron/bin:/opt/otakupulse-cron/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

DEST=/srv/backups/otakupulse
KEEP=14
# Offsite je Präfix behalten. Der B2-Bucket hat eine Speichergrenze (Caps & Alerts),
# und 14 Dumps à 36 MB + Umami lagen mit 507 MB genau darüber: ab dem 13.11.2026
# scheiterte jeder Upload mit `403 storage_cap_exceeded`, die neueste Kopie
# offsite war vom 12.11. Mit 7 liegt der Höchststand bei rund 260 MB (siehe
# offsite_sync) — Luft, auch wenn die DB weiter wächst. Lokal bleiben 14 Tage (KEEP).
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

# Offsite (Backblaze B2 via rclone), nur wenn Remote "offsite" konfiguriert ist.
RCLONE=/usr/bin/rclone
export RCLONE_CONFIG=/srv/sites/otakupulse/app-src/rclone.conf

# Offsite = genau die KEEP_OFFSITE neuesten LOKALEN Dumps je Präfix, nicht mehr.
#
# Vorher: Rotation auf die neuesten N im Bucket, dann `rclone copy` aller lokalen
# Dumps. Das trägt nur, solange lokal und offsite gleich viele behalten (14/14) —
# und genau damit stand der Bucket an der Grenze. Mit weniger offsite lädt `copy`
# jede Nacht die lokalen Dumps wieder hoch, die die Rotation gerade gelöscht hat.
# Und nach einem Ausfall rotiert die alte Logik auf die neuesten N IM BUCKET (also
# alte Stände) und lädt dann die verpassten Tage obendrauf — über die Grenze.
#
# Jetzt: Liste der neuesten N lokalen Dumps bilden, im Bucket alles löschen, was
# nicht darauf steht (VOR dem Upload, damit Platz ist), dann nur diese Liste
# hochladen. Höchststand = N Dumps je Präfix, auch beim Nachholen nach Ausfällen.
# Hard-Delete, weil bei B2 auch versteckte Altversionen auf die Grenze zählen.
offsite_sync() {
  local keep="$DEST/.offsite-keep"
  : > "$keep"
  for p in otakupulse umami; do
    ls -1t "$DEST"/$p-*.sql.gz 2>/dev/null | head -n "$KEEP_OFFSITE" | xargs -r -n1 basename >> "$keep"
  done
  local weg=0
  while read -r f; do
    if ! grep -qxF "$f" "$keep"; then
      "$RCLONE" deletefile --b2-hard-delete "offsite:otakupulse-backups/$f" 2>>"$LOG" && weg=$((weg + 1))
    fi
  done < <("$RCLONE" lsf offsite:otakupulse-backups --include "*.sql.gz" 2>/dev/null)
  log "Offsite: $weg veraltete Dumps entfernt, Soll = neueste $KEEP_OFFSITE je Präfix"
  "$RCLONE" copy "$DEST" offsite:otakupulse-backups --files-from "$keep" --transfers 2 2>>"$LOG"
}
if [ -x "$RCLONE" ] && "$RCLONE" listremotes 2>/dev/null | grep -q '^offsite:'; then
  if offsite_sync; then
    log "Offsite: nach offsite:otakupulse-backups (Backblaze B2) kopiert"
  else
    log "Offsite-Upload FEHLGESCHLAGEN"
  fi
else
  log "Offsite übersprungen (rclone-Remote 'offsite' noch nicht konfiguriert)"
fi
log "=== fertig ==="
