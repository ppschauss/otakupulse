#!/bin/bash
# OtakuPulse Social-Agent Verwaltung (Docker-Run-Fallback, da Unraid-Host kein compose-Plugin hat).
set -e
cd "$(dirname "$0")"
IMAGE=otakupulse-social:latest
NAME=otakupulse-social
NET=otakupulse-net
case "$1" in
  build)   docker build -t "$IMAGE" ./build ;;
  up)
    docker rm -f "$NAME" 2>/dev/null || true
    docker run -d --name "$NAME" --restart unless-stopped \
      --network "$NET" \
      --env-file ./secrets.env -e TZ=Europe/Berlin -e DB_PATH=/data/social.sqlite3 \
      -v "$(pwd)/data:/data" "$IMAGE"
    echo "gestartet."
    ;;
  rebuild) "$0" build && "$0" up ;;
  down)    docker rm -f "$NAME" ;;
  restart) docker restart "$NAME" ;;
  logs)    docker logs -f "$NAME" ;;
  # CLI-Helfer: laufen im gestarteten Container (teilen sich DB + Env).
  seed)      docker exec "$NAME" python -m app.cli seed "${@:2}" ;;
  cli)       docker exec "$NAME" python -m app.cli "${@:2}" ;;
  *) echo "Nutzung: $0 {build|up|rebuild|down|restart|logs|seed|cli <cmd>}" ;;
esac
