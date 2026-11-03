#!/bin/bash
# Rollout auf dem VPS. Läuft DORT, als Nutzer `administrator`:
#   ssh administrator@100.64.244.17 '/srv/sites/otakupulse/app-src/deploy-vps.sh'
#
# Warum ein Skript: Bis zum 03.11.2026 war `app-src` kein Git-Checkout, sondern
# ein einmal hineinkopierter Stand. Deploys passierten von Hand, mal so, mal so —
# mit dem Ergebnis, dass der Live-Code zwei Monate hinter dem Repo lag und auf dem
# Server entstandene Arbeit nirgends sonst existierte. Die Reihenfolge hier ist
# die, die sich bewährt hat; die Fallstricke stehen an Ort und Stelle.
set -euo pipefail

REPO=/srv/sites/otakupulse/app-src
F="$REPO/frontend"
SECRETS="$F/secrets.env"
STACK=ei9kq0mxqajfydp1vcydbnyg
APP="otakupulse-app-$STACK"
NET="$STACK"
PORT=3001
# Docker laeuft hier nur mit erhoehten Rechten — `administrator` ist nicht in der
# docker-Gruppe. Ohne sudo bricht der Build mit „permission denied … docker.sock" ab.
DOCKER="sudo docker"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

say "1/6 Quellstand holen"
cd "$REPO"
# Unversioniertes (secrets.env, node_modules, .next*, in Arbeit befindliche
# Dateien) überlebt `reset --hard` — nur versionierte Dateien werden angefasst.
before=$(git rev-parse --short HEAD)
git fetch --depth 1 origin main
git reset --hard "$(git rev-parse FETCH_HEAD)"
after=$(git rev-parse --short HEAD)
echo "   $before → $after  $(git log --oneline -1 --format=%s)"
if ! git status --porcelain | grep -q .; then :; else
  echo "   Hinweis: unversionierte Dateien im Baum (bleiben unberührt):"
  git status --porcelain | sed 's/^/     /'
fi

say "2/6 Build im Wegwerf-Container"
# NICHT im app-/enrich-Container bauen: beide mounten /srv/sites/otakupulse/media
# nach /app/public/media (über 100.000 Dateien). Tailwind scannt das mit und der
# PostCSS-Worker stirbt per OOM. Dieser Container hat den Mount nicht.
# NICHT ins laufende .next bauen: ISR schreibt dort parallel → ENOTEMPTY.
sudo rm -rf "$F/.next-new"
$DOCKER rm -f op-build >/dev/null 2>&1 || true
$DOCKER run --rm --name op-build \
  --network "$NET" \
  --env-file "$SECRETS" \
  -e NODE_ENV=production -e NEXT_DIST_DIR=.next-new \
  -e NODE_OPTIONS=--max-old-space-size=6144 \
  -v "$F":/app -w /app \
  node:22-alpine sh -lc 'apk add --no-cache libc6-compat >/dev/null 2>&1; npx next build'

say "3/6 Build prüfen"
# Ohne BUILD_ID ist der Build abgebrochen — dann die laufende App NICHT anfassen.
[ -f "$F/.next-new/BUILD_ID" ] || { echo "   ✗ keine BUILD_ID — Abbruch, Live bleibt unverändert."; exit 1; }
echo "   BUILD_ID: $(cat "$F/.next-new/BUILD_ID")"

say "4/6 Einsetzen"
ts=$(date +%Y%m%d-%H%M)
sudo mv "$F/.next" "$F/.next.bak-$ts"
sudo mv "$F/.next-new" "$F/.next"
echo "   alter Build liegt unter .next.bak-$ts"

say "5/6 App neu starten"
$DOCKER restart "$APP" >/dev/null
code=000
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://localhost:$PORT/" || echo 000)
  [ "$code" = "200" ] && { echo "   oben nach ~$((i*3))s"; break; }
  sleep 3
done
if [ "$code" != "200" ]; then
  echo "   ✗ App antwortet mit $code — zurück auf den alten Build."
  sudo rm -rf "$F/.next"; sudo mv "$F/.next.bak-$ts" "$F/.next"
  $DOCKER restart "$APP" >/dev/null
  exit 1
fi

say "6/6 Cloudflare-Cache leeren"
# Pflicht, kein Extra: Die Cache-Regeln legen /genre, /anime, /tag, /studio und
# /season für 8 h an den Edge (override_origin), /character und /person für 72 h.
# Ohne Purge liefert die öffentliche Seite nach einem Rollout stundenlang den
# alten Stand, während der Origin längst richtig antwortet — das kostet
# Fehlersuche an der falschen Stelle.
set +u; . "$SECRETS"; set -u
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ -n "${CLOUDFLARE_ZONE_ID:-}" ]; then
  out=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/purge_cache" \
      -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H 'Content-Type: application/json' \
      --data '{"purge_everything":true}')
  case "$out" in
    *'"success":true'*) echo "   Cache geleert." ;;
    *) echo "   ✗ Purge fehlgeschlagen: $out"; exit 1 ;;
  esac
else
  echo "   ⚠ CLOUDFLARE_API_TOKEN/_ZONE_ID fehlen in secrets.env — NICHT geleert."
  echo "     Die Seite zeigt bis zu 8 h den alten Stand. Im Dashboard leeren:"
  echo "     Caching → Configuration → Purge Everything"
fi

say "Fertig: $after läuft."
