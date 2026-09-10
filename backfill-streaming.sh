#!/bin/sh
# Einmaliger Backfill: Streaming-Anbieter + Dub/Sub-Sprachen für Titel, die durch
# den Massen-Import (2000–2011, 3216 Titel am 2026-07-01) kein „Wer streamt es?"
# bekamen — der tägliche Sync deckt nur --recent 3 ab. Alle drei Scraper laufen
# auf dem HOST (curl_cffi), sind idempotent und mergen. Sequenziell, um die
# Dienste nicht parallel zu hämmern.
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
F=/mnt/cache/appdata/otakupulse/frontend
LOG=/tmp/otaku-backfill-streaming.log
cd "$F" || exit 1

echo "===== $(date) Backfill-Start =====" >> "$LOG"

# JustWatch voll (alle Titel, Offers autoritativ): ~11k Requests bei 8–10 req/s ≈ 30 min.
echo "----- $(date) [1/3] JustWatch (voll, Offers) -----" >> "$LOG"
python3 -u src/scripts/justwatch-streaming.py >> "$LOG" 2>&1

echo "----- $(date) [2/3] Crunchyroll-Dub (voller Katalog, idempotent) -----" >> "$LOG"
python3 -u src/scripts/crunchyroll-dub.py >> "$LOG" 2>&1

echo "----- $(date) [3/3] Wikipedia-Dub (voller Katalog, idempotent) -----" >> "$LOG"
python3 -u src/scripts/wikipedia-dub.py >> "$LOG" 2>&1

echo "----- $(date) IndexNow: geänderte URLs melden -----" >> "$LOG"
docker exec --env-file "$F/secrets.env" otakupulse-enrich sh -lc 'cd /app && npx tsx src/scripts/indexnow.ts --recent 1' >> "$LOG" 2>&1

echo "===== $(date) Backfill-Ende =====" >> "$LOG"
