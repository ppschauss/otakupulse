#!/usr/bin/env python3
"""
Offer-Audit: prüft die Anbieter-/Sprachdaten gegen sich selbst (keine externe Quelle).

Hintergrund: `justwatch-streaming.py` matcht über Titelähnlichkeit. Vor dem Einbau
von `spinoff_mismatch`/`episodes_implausible` erbten Vorschau-, Mini- und Picture-
Drama-Einträge die Anbieter und Sprachen ihrer Hauptserie — „Harukana Receive:
Yokoku" (11 Folgen) wies „Crunchyroll · 1 Staffel · 12 Folgen · Deutscher Dub" aus.
Solche Zeilen widerlegen sich selbst: die Folgenzahl beim Anbieter passt nicht zur
Folgenzahl des Eintrags. Genau das prüft dieses Skript — billig, vollständig und
ohne JustWatch-Abfrage, weil es auf der eigenen DB läuft.

Checks (error = blockiert, warn = nur Bericht):
  C1 episode_mismatch   warn   Folgen beim Anbieter weichen > 25 % (min. ±1) ab
  C2 spinoff_inherits   warn   Titelzusatz (Yokoku, Mini Anime, Petit, Picture Drama …)
                               mit Anbieter-Angebot → Verdacht auf Vererbung
  C3 tiny_entry         error  ≤ 3 Folgen im Eintrag, ≥ 3 Folgen mehr beim Anbieter
  C4 sub_lt_dub         warn   pro Anbieter mehr Dub- als Sub-Titel
  C5 dub_without_sub    warn   deutsche Tonspur ohne deutsche Untertitel
  C6 lang_without_offer warn   `de-dub`-Flag, aber kein Angebot mit deutscher Tonspur
                               (= die Lücke zwischen Kopfzahl und Listenzahl)

Aufruf (HOST, braucht nur `docker`):
  python3 src/scripts/offer-audit.py                  # Bericht, Exit 1 bei errors
  python3 src/scripts/offer-audit.py --csv audit.csv  # zusätzlich als CSV
  python3 src/scripts/offer-audit.py --purge          # C2/C3-Zeilen löschen (eindeutig falsch)

`--purge` entfernt NUR den eindeutigen Fall C3, dazu den abgeleiteten
Anbieter-Index und die Sprach-Flags der betroffenen Titel. Die Sprach-Flags sind
selbstheilend: `crunchyroll-dub.py` schreibt sie pro Titel komplett neu und
`wikipedia-dub.py` ergänzt echte Synchronfassungen beim nächsten Lauf wieder.
C1 und C2 werden bewusst nicht gelöscht: C1 enthält den legitimen Fall „Season-1-
Eintrag, Anbieter führt die ganze Serie", und C2 meldet auch korrekte Zuordnungen,
weil das Audit den JustWatch-Titel nicht kennt.
"""
import csv
import subprocess
import sys

DB_CONTAINER = "otakupulse-db"

# Titelzusätze, die ein eigenes Werk bezeichnen (gleiche Liste wie
# `_SPINOFF_MARKERS` in justwatch-streaming.py, als POSIX-Regex auf dem
# normalisierten Titel).
# "omake" fehlt absichtlich: zusammengezogen steckt es in "how to make" und
# meldete "Magic Maker: How to Make Magic in Another World" als Vererbung.
SPINOFF_RE = ("yokoku|vorschau|preview|trailer|minianime|miniaftershow|petit|puchi|chibi|"
              "picturedrama|pictoredrama|collab|choitashi|recap|soushuuhen|sousyuuhen|"
              "dougagekijou|specialedition|digest")

# Normalisierter Titel (ein Ausdruck für alle Titelspalten).
# Trenner zwischen den Titeln: ohne ihn entstehen Marker ueber die Spaltengrenze
# hinweg ("Isekai Mahou" + "Maker" ergab "omake") und die Prüfung meldet Unsinn.
# Jeder Titel wird EINZELN zusammengezogen und die Titel dann mit Leerzeichen
# getrennt — genau wie `spinoff_mismatch` in justwatch-streaming.py. Verkettet man
# erst und sauebert dann, entstehen Marker ueber die Spaltengrenze hinweg
# ("Isekai Mahou" + "Maker" ergab "omake") und die Pruefung meldet Unsinn.
NORM = ("lower(regexp_replace(coalesce(a.title_romaji,''), '[^a-zA-Z0-9]', '', 'g') || ' ' || "
        "regexp_replace(coalesce(a.title_english,''), '[^a-zA-Z0-9]', '', 'g') || ' ' || "
        "regexp_replace(coalesce(a.title_german,''), '[^a-zA-Z0-9]', '', 'g'))")

STREAM = "o.monetization IN ('flatrate','ads','free')"

CHECKS = [
    # Spiegelt `offerContradictsEntry` (lib/streaming.ts) und `episodes_implausible`
    # (justwatch-streaming.py): Serien-Formate dürfen abweichen, weil der Anbieter
    # den ganzen Lauf listet, während unser Eintrag ein Cour ist. Solche Zeilen
    # blendet die Ausgabe aus und der nächste Sync-Lauf entfernt sie — deshalb
    # Hinweis, kein Gate.
    ("C1", "episode_mismatch", "warn", f"""
        SELECT a.slug, o.provider, a.episodes::text, o.episodes::text
          FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
         WHERE {STREAM} AND a.episodes > 0 AND o.episodes IS NOT NULL
           AND coalesce(a.format::text,'') NOT IN ('TV','TV_SHORT','ONA')
           AND abs(o.episodes - a.episodes) > greatest(1, a.episodes * 0.25)
         ORDER BY abs(o.episodes - a.episodes) DESC"""),
    # Nur Verdacht, kein Gate: ob der Zusatz ein eigenes Werk bezeichnet, entscheidet
    # `spinoff_mismatch` im Sync — der sieht auch den JustWatch-Titel und laesst den
    # Treffer stehen, wenn der Marker dort ebenfalls steht. Das Audit sieht nur unsere
    # Seite und meldet deshalb auch korrekte Zuordnungen: die beiden Bocchi-Recap-Filme
    # laufen wirklich bei Crunchyroll, und „Code Geass: Rozé of the Recapture" enthaelt
    # „recap" als Wortfragment. Solche Zeilen darf --purge nicht anfassen.
    ("C2", "spinoff_inherits", "warn", f"""
        SELECT a.slug, o.provider, a.episodes::text, o.episodes::text
          FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
         WHERE {STREAM} AND {NORM} ~* '{SPINOFF_RE}'
         ORDER BY a.popularity DESC NULLS LAST"""),
    ("C3", "tiny_entry", "error", f"""
        SELECT a.slug, o.provider, a.episodes::text, o.episodes::text
          FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
         WHERE {STREAM} AND a.episodes > 0 AND a.episodes <= 3
           AND o.episodes IS NOT NULL AND o.episodes >= a.episodes + 3
         ORDER BY o.episodes DESC"""),
    # Für Simulcast-Plattformen (Crunchyroll) gilt sub >= dub; deutsche Dub-first-
    # Label wie Aniverse (377 Dub / 367 Sub) verletzen das legitim. Daher nur Hinweis.
    ("C4", "sub_lt_dub", "warn", f"""
        SELECT o.provider, '', count(DISTINCT a.id) FILTER (WHERE (',' || coalesce(o.audio,'') || ',') LIKE '%,de,%')::text,
               count(DISTINCT a.id) FILTER (WHERE (',' || coalesce(o.subs,'') || ',') LIKE '%,de,%')::text
          FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
         WHERE {STREAM} AND a.is_hentai IS NOT TRUE
         GROUP BY o.provider
        HAVING count(DISTINCT a.id) FILTER (WHERE (',' || coalesce(o.audio,'') || ',') LIKE '%,de,%')
             > count(DISTINCT a.id) FILTER (WHERE (',' || coalesce(o.subs,'') || ',') LIKE '%,de,%')"""),
    ("C5", "dub_without_sub", "warn", f"""
        SELECT a.slug, o.provider, coalesce(o.audio,''), coalesce(o.subs,'')
          FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
         WHERE {STREAM} AND (',' || coalesce(o.audio,'') || ',') LIKE '%,de,%'
           AND (',' || coalesce(o.subs,'') || ',') NOT LIKE '%,de,%'
         ORDER BY a.popularity DESC NULLS LAST"""),
    ("C6", "lang_without_offer", "warn", """
        SELECT a.slug, '', 'de-dub', ''
          FROM anime a
         WHERE EXISTS (SELECT 1 FROM anime_available_languages l WHERE l.parent_id = a.id AND l.value = 'de-dub')
           AND EXISTS (SELECT 1 FROM anime_streaming_offers o WHERE o._parent_id = a.id
                       AND o.monetization IN ('flatrate','ads','free'))
           AND NOT EXISTS (SELECT 1 FROM anime_streaming_offers o WHERE o._parent_id = a.id
                       AND o.monetization IN ('flatrate','ads','free')
                       AND (',' || coalesce(o.audio,'') || ',') LIKE '%,de,%')
         ORDER BY a.popularity DESC NULLS LAST"""),
]


def psql(sql: str, read: bool = True) -> str:
    inner = 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
    if read:
        inner += " -t -A -F'|'"
    res = subprocess.run(["docker", "exec", "-i", DB_CONTAINER, "sh", "-c", inner],
                         input=sql, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"psql-Fehler: {res.stderr.strip()}")
    return res.stdout


def rows(sql: str) -> list[list[str]]:
    return [line.split("|") for line in psql(sql).strip().splitlines() if line]


def purge() -> None:
    """C3-Zeilen löschen, danach Anbieter-Index und Sprach-Flags der Titel aufräumen.

    NUR C3: ein Eintrag mit höchstens drei Folgen und ein Angebot mit mindestens drei
    Folgen mehr ist eindeutig. C2 (Titelmarker) bleibt draußen, weil das Audit nur
    unsere Titel sieht und auch korrekte Zuordnungen meldet — ein Purge über C2 hat
    „Magic Maker: How to Make Magic…" die richtigen Angebote genommen („omake" steckt
    in „to make"), und dieselbe Falle sind „Recapture" und die Bocchi-Recap-Filme.
    Die echten Vererbungsfälle entfernt der Sync selbst: dort vergleicht
    `spinoff_mismatch` unseren Titel MIT dem JustWatch-Titel.
    """
    c3 = (f"{STREAM} AND a.episodes > 0 AND a.episodes <= 3 AND o.episodes IS NOT NULL "
          "AND o.episodes >= a.episodes + 3")
    ids = rows(f"""
        SELECT DISTINCT a.id FROM anime a JOIN anime_streaming_offers o ON o._parent_id = a.id
         WHERE {c3};""")
    affected = [r[0] for r in ids]
    if not affected:
        print("→ Nichts zu löschen.")
        return
    idlist = ",".join(affected)
    print(f"→ Lösche Angebote von {len(affected)} Titeln (C3) …")
    psql(f"""BEGIN;
      DELETE FROM anime_streaming_offers WHERE _parent_id IN ({idlist});
      DELETE FROM anime_streaming_providers WHERE parent_id IN ({idlist});
      DELETE FROM anime_available_languages WHERE parent_id IN ({idlist});
      UPDATE anime SET content_updated_at = now(), updated_at = now(),
                       streaming_checked_at = NULL WHERE id IN ({idlist});
    COMMIT;""", read=False)
    print(f"✓ {len(affected)} Titel bereinigt. `streaming_checked_at` zurückgesetzt — der nächste "
          "justwatch-streaming.py-Lauf (--stale) prüft sie mit den neuen Regeln erneut.")


def main() -> None:
    if "--purge" in sys.argv:
        purge()
        return
    out, errors = [], 0
    for cid, name, sev, sql in CHECKS:
        found = rows(sql)
        if sev == "error":
            errors += len(found)
        print(f"{cid} {name:18s} {sev:5s} {len(found):6d}")
        for r in found[:10]:
            print("     " + " | ".join(x for x in r if x))
        if len(found) > 10:
            print(f"     … und {len(found) - 10} weitere")
        out += [[cid, name, sev] + r for r in found]
    csv_path = None
    if "--csv" in sys.argv:
        i = sys.argv.index("--csv")
        csv_path = sys.argv[i + 1] if i + 1 < len(sys.argv) else "offer-audit.csv"
    if csv_path:
        with open(csv_path, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["check", "name", "severity", "slug_oder_provider", "provider", "wert1", "wert2"])
            w.writerows(out)
        print(f"→ {len(out)} Zeilen in {csv_path}")
    print(f"\n{errors} Befunde mit Severity error.")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
