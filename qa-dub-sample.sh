#!/bin/sh
# Monatliche Dub-Kontrolle: stratifizierte Stichprobe der Ger-Dub-Behauptungen plus
# der Stand der sechs Invarianten. Die Invarianten (offer-audit.py, läuft alle 4 h)
# prüfen die Daten gegen sich selbst; ob eine deutsche Synchronfassung wirklich
# existiert, sagt nur eine externe Quelle — und die beiden brauchbaren (Synchronkartei,
# aniSearch) lassen sich nicht automatisiert abfragen. Deshalb: jeden Monat eine neue
# Stichprobe ziehen, von Hand abhaken, Trefferquote pro Beleggruppe verfolgen.
#
# Das Salz ist der Monat: innerhalb eines Monats reproduzierbar, jeden Monat andere
# Titel. Ohne das würde dieselbe Stichprobe ewig wiederholt.
#
# Die Meldung enthält einen fertigen Prompt — damit aus dem Befund ohne Zwischenschritt
# ein Auftrag wird: Nachricht aufmachen, Prompt kopieren, abschicken, fertig.
#
# Telegram (optional, beliebiger Bot): QA_TELEGRAM_BOT_TOKEN + QA_TELEGRAM_CHAT_ID in
# secrets.env. NICHT der News-Kanal — das ist der öffentliche Feed. Fehlt die Angabe,
# bleibt es bei Datei + Log, der Lauf schlägt nie deswegen fehl.
#
# Cron (1. des Monats, 8:10):  10 8 1 * * root /opt/otakupulse-cron/qa-dub-sample.sh
export PATH=/opt/otakupulse-cron/bin:/opt/otakupulse-cron/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
F=/srv/sites/otakupulse/app-src/frontend
OUT=/srv/sites/otakupulse/data/qa
LOG=/tmp/otaku-qa-dub.log
MONAT=$(date +%Y-%m)
CSV="$OUT/dub-stichprobe-$MONAT.csv"

mkdir -p "$OUT"
cd "$F" || exit 1
echo "===== $(date) Dub-Kontrolle $MONAT =====" >> "$LOG"

python3 -u src/scripts/dub-sample.py --per-band 5 --salz "$MONAT" --out "$CSV" >> "$LOG" 2>&1
ZEILEN=$(( $(wc -l < "$CSV") - 1 ))

# Invarianten-Stand dazu: eine Meldung im Monat, die beide Seiten abdeckt.
AUDIT=$(python3 -u src/scripts/offer-audit.py 2>&1 | grep -E '^C[1-6]' | tr -s ' ')
FEHLER=$(echo "$AUDIT" | awk '$3=="error" {s+=$4} END {print s+0}')
echo "$AUDIT" >> "$LOG"

# Nur die letzten 12 Monate behalten.
ls -1t "$OUT"/dub-stichprobe-*.csv 2>/dev/null | tail -n +13 | while read -r alt; do rm -f "$alt"; done

# Vormonat: wurde er ausgefüllt? Dann die Quote mitschicken, sonst daran erinnern.
VORMONAT=$(ls -1t "$OUT"/dub-stichprobe-*.csv 2>/dev/null | sed -n 2p)
QUOTE=""
if [ -n "$VORMONAT" ]; then
  GEFUELLT=$(awk -F';' 'NR>1 && $12 != "" {n++} END {print n+0}' "$VORMONAT")
  NEIN=$(awk -F';' 'NR>1 && tolower($12) ~ /^nein/ {n++} END {print n+0}' "$VORMONAT")
  if [ "$GEFUELLT" -gt 0 ]; then
    QUOTE="Vormonat: $GEFUELLT geprüft, davon $NEIN nicht bestätigt."
  else
    QUOTE="Vormonat ($(basename "$VORMONAT")) ist noch nicht ausgefüllt."
  fi
fi

if [ "$FEHLER" -gt 0 ]; then
  PROMPT="Dub-Kontrolle $MONAT: offer-audit meldet $FEHLER Befunde mit Severity error. Bitte auf dem VPS nachsehen (cd /srv/sites/otakupulse/app-src/frontend && python3 src/scripts/offer-audit.py), Ursache feststellen und entscheiden, ob die Daten oder die Regel falsch sind — die Regel steht wortgleich in justwatch-streaming.py, lib/streaming.ts, platformLists.ts und offer-audit.py und muss es bleiben."
else
  PROMPT="Dub-Kontrolle $MONAT ausgewertet: $CSV auf dem VPS, Spalte dub_bestaetigt ist gefüllt. Bitte Trefferquote je Beleggruppe (tonspur vs. titel-flag) und je Nachfrage-Band berechnen, die nicht bestätigten Titel einzeln ansehen und daraus ableiten, ob Marker-Liste, Plausibilitätsgrenzen oder der Dub-Fallback nachgezogen werden müssen."
fi

NACHRICHT="Dub-Kontrolle $MONAT · $ZEILEN Titel zur Handprüfung
$AUDIT
$QUOTE

Spalte dub_bestaetigt füllen (ja/nein/unklar). Fällt die Quote in der Gruppe titel-flag ab, ist das Titel-Flag als Beleg zu schwach.

— Prompt für Claude (kopieren und abschicken) —
$PROMPT"

if [ -f "$F/secrets.env" ]; then
  QA_TELEGRAM_BOT_TOKEN=$(sed -n 's/^QA_TELEGRAM_BOT_TOKEN=//p' "$F/secrets.env" | tr -d '"'"'"'\r')
  QA_TELEGRAM_CHAT_ID=$(sed -n 's/^QA_TELEGRAM_CHAT_ID=//p' "$F/secrets.env" | tr -d '"'"'"'\r')
fi
if [ -n "$QA_TELEGRAM_BOT_TOKEN" ] && [ -n "$QA_TELEGRAM_CHAT_ID" ]; then
  curl -s -o /dev/null -F "chat_id=$QA_TELEGRAM_CHAT_ID" -F "document=@$CSV" \
    -F "caption=$NACHRICHT" "https://api.telegram.org/bot$QA_TELEGRAM_BOT_TOKEN/sendDocument"
  echo "→ Stichprobe + Prompt per Telegram verschickt." >> "$LOG"
else
  echo "→ QA_TELEGRAM_BOT_TOKEN/QA_TELEGRAM_CHAT_ID fehlen in secrets.env — nur Datei + Log." >> "$LOG"
  printf '%s\n' "$NACHRICHT" >> "$LOG"
fi
echo "✓ $ZEILEN Titel in $CSV" >> "$LOG"
