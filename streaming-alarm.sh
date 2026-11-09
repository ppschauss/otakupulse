#!/bin/bash
# Lücken-Alarm: meldet per Telegram, wenn Titel der laufenden Season weder ein
# Streaming-Angebot noch einen Prüfstempel (streaming_verified_at) haben — also dann,
# wenn die Abdeckungslücke zurückkommt. Schweigt bei 0: ein Alarm, der jeden Tag ohne
# Anlass kommt, wird ignoriert.
#
# Die Entscheidung "melden oder schweigen" trifft justwatch-streaming.py --gap-alarm
# (testbar, tests/test_matcher.py); es gibt nur bei Lücken etwas aus. Dieses Skript
# transportiert nur — dasselbe Muster wie watchdog.sh (Token und Chat-ID aus secrets.env,
# curl gegen api.telegram.org). Wird am Ende von catalog-sweep.sh und
# refresh-streaming.sh aufgerufen; höchstens eine Meldung pro Tag (Stempeldatei).
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
F=/mnt/cache/appdata/otakupulse/frontend
SECRETS=$F/secrets.env
STAMP=/tmp/otaku-streaming-alarm.day
LOG=/tmp/otaku-streaming-refresh.log

cd "$F" || exit 1
MSG=$(python3 -u src/scripts/justwatch-streaming.py --gap-alarm 2>>"$LOG") || {
  echo "===== $(date) Lücken-Abfrage fehlgeschlagen (kein Alarm gesendet) =====" >> "$LOG"; exit 1; }
[ -n "$MSG" ] || exit 0   # keine Lücke → still

[ "$(cat "$STAMP" 2>/dev/null)" = "$(date +%F)" ] && exit 0   # heute schon gemeldet

TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$SECRETS" 2>/dev/null | head -1 | cut -d= -f2-)
CHAT=$(grep -E '^ALERT_CHAT_ID=' "$SECRETS" 2>/dev/null | head -1 | cut -d= -f2-)
if [ -n "${TOKEN:-}" ] && [ -n "${CHAT:-}" ]; then
  curl -s -o /dev/null --max-time 15 "https://api.telegram.org/bot${TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${CHAT}" \
    --data-urlencode "text=${MSG}" \
    && { date +%F > "$STAMP"; echo "===== $(date) Lücken-Alarm gesendet =====" >> "$LOG"; }
fi
