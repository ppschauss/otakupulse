#!/bin/sh
set -e
apk add --no-cache git >/dev/null 2>&1
cd /work
rm -rf frontend
echo "=== create-payload-app (nicht-interaktiv, stdin=/dev/null) ==="
npx -y create-payload-app@latest -n frontend -t blank --use-npm --no-deps --no-agent < /dev/null 2>&1 | tail -50 || echo ">>> EXITCODE != 0"
echo "=== STRUKTUR ==="
find frontend -maxdepth 2 -type f -not -path "*/node_modules/*" 2>/dev/null | sort | head -60
echo "=== package.json ==="
cat frontend/package.json 2>/dev/null | head -70 || echo "keine package.json"
echo "=== payload.config.ts (db-Zeilen) ==="
grep -n -E "Adapter|db:|connectionString|url:|DATABASE" frontend/src/payload.config.ts 2>/dev/null || echo "keine config"
