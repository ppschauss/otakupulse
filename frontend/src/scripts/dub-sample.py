#!/usr/bin/env python3
"""
Stichprobe der Ger-Dub-Behauptungen für die Handprüfung.

Die sechs Invarianten in `offer-audit.py` finden Widersprüche in den eigenen Daten.
Was sie NICHT können: prüfen, ob eine deutsche Synchronfassung wirklich existiert.
Dafür braucht es eine externe Quelle, und die beiden brauchbaren lassen sich nicht
automatisiert abfragen — die aniSearch-Suche verlangt ein Session-Token, und
synchronkartei.de sperrt Bots per robots.txt. Also: stratifizierte Stichprobe
ziehen, Links daneben legen, von Hand prüfen.

Geschichtet wird nach Nachfrage (Popularität) und nach Beleglage:
  `tonspur`    — der Anbieter weist eine deutsche Tonspur aus (stärkster Beleg)
  `titel-flag` — nur `availableLanguages` sagt „de-dub" (Anbieter ohne Tonspurdaten
                 wie Netflix/Joyn, oder Wikipedia-Ergänzung)
Die zweite Gruppe ist die interessante: dort steht die Behauptung auf dem
schwächeren Fundament.

Aufruf (HOST, braucht nur `docker`):
  python3 src/scripts/dub-sample.py                  # 30 Titel, CSV auf stdout
  python3 src/scripts/dub-sample.py --per-band 8     # größere Stichprobe
  python3 src/scripts/dub-sample.py --out stichprobe.csv
"""
import csv
import subprocess
import sys
from urllib.parse import quote

DB_CONTAINER = "otakupulse-db"
SITE = "https://www.otakupulse.de"

# Nachfrage-Bänder (AniList-Popularität): oben die Titel, bei denen ein Fehler weh tut.
BANDS = [("top", "a.popularity >= 20000"), ("mittel", "a.popularity BETWEEN 2000 AND 19999"),
         ("longtail", "coalesce(a.popularity,0) < 2000")]

QUERY = """
SELECT a.slug,
       coalesce(nullif(a.title_german,''), nullif(a.title_english,''), a.title_romaji) AS titel,
       coalesce(a.format::text,'?') AS format,
       coalesce(a.episodes::text,'?') AS folgen,
       coalesce(a.popularity::text,'0') AS popularitaet,
       string_agg(DISTINCT o.provider, '+') AS anbieter,
       CASE WHEN bool_or((',' || coalesce(o.audio,'') || ',') LIKE '%,de,%')
            THEN 'tonspur' ELSE 'titel-flag' END AS beleg
  FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
 WHERE o.monetization IN ('flatrate','ads','free') AND a.is_hentai IS NOT TRUE
   AND NOT (a.episodes > 0 AND o.episodes > 0 AND (
             (a.episodes <= 3 AND o.episodes >= a.episodes + 3)
          OR (coalesce(a.format::text,'') NOT IN ('TV','TV_SHORT','ONA')
              AND abs(o.episodes - a.episodes) > greatest(1, a.episodes * 0.25))))
   AND ((',' || coalesce(o.audio,'') || ',') LIKE '%,de,%'
        OR EXISTS (SELECT 1 FROM anime_available_languages l
                    WHERE l.parent_id = a.id AND l.value = 'de-dub'))
   AND {band}
 GROUP BY a.id, a.slug, titel, a.format, a.episodes, a.popularity
HAVING CASE WHEN bool_or((',' || coalesce(o.audio,'') || ',') LIKE '%,de,%')
            THEN 'tonspur' ELSE 'titel-flag' END = '{beleg}'
 ORDER BY md5(a.slug || '{salz}')
 LIMIT {n};
"""


def psql(sql: str) -> str:
    res = subprocess.run(
        ["docker", "exec", "-i", DB_CONTAINER, "sh", "-c",
         'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -F"\t"'],
        input=sql, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"psql-Fehler: {res.stderr.strip()}")
    return res.stdout


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def main() -> None:
    per_band = int(arg("--per-band", 5))
    salz = arg("--salz", "otakupulse")  # gleiche Stichprobe reproduzierbar, andere per --salz
    rows = []
    for band, cond in BANDS:
        for beleg in ("tonspur", "titel-flag"):
            out = psql(QUERY.format(band=cond, beleg=beleg, n=per_band, salz=salz))
            for line in out.strip().splitlines():
                if not line:
                    continue
                slug, titel, fmt, folgen, pop, anbieter, _ = line.split("\t")
                rows.append({
                    "band": band, "beleg": beleg, "slug": slug, "titel": titel,
                    "format": fmt, "folgen": folgen, "popularitaet": pop, "anbieter": anbieter,
                    "unsere_seite": f"{SITE}/anime/{slug}",
                    "synchronkartei": f"https://www.synchronkartei.de/suche?q={quote(titel)}",
                    "anisearch": f"https://www.anisearch.de/anime/index?char=all&text={quote(titel)}",
                    "dub_bestaetigt": "", "anmerkung": "",
                })
    cols = ["band", "beleg", "titel", "slug", "format", "folgen", "popularitaet", "anbieter",
            "unsere_seite", "synchronkartei", "anisearch", "dub_bestaetigt", "anmerkung"]
    path = arg("--out")
    fh = open(path, "w", newline="") if path else sys.stdout
    w = csv.DictWriter(fh, fieldnames=cols, delimiter=";")
    w.writeheader()
    w.writerows(rows)
    if path:
        fh.close()
        print(f"✓ {len(rows)} Titel in {path}")
        print("  Spalte `dub_bestaetigt` von Hand füllen (ja/nein/unklar). Fällt die Trefferquote")
        print("  in der Gruppe `titel-flag` deutlich ab, ist das Titel-Flag als Beleg zu schwach.")


if __name__ == "__main__":
    main()
