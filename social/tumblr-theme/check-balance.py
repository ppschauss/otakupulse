#!/usr/bin/env python3
"""Prueft ein Tumblr-Theme auf unbalancierte {block:X}-Tags.

Unbalancierte Bloecke sind die haeufigste Ursache fuer eine komplett weisse
Vorschau: Tumblr verschluckt alles ab dem offenen Block, ohne Fehlermeldung.
Achtung, der Parser liest Tags AUCH in HTML-Kommentaren — deshalb warnt das
Skript zusaetzlich vor Platzhaltern in Kommentaren.

    python3 check-balance.py theme.html
"""
import io
import re
import sys


def main(path: str) -> int:
    s = io.open(path, encoding="utf-8").read()
    stack: list[str] = []
    errs: list[str] = []

    for closing, name in re.findall(r"\{(/?)block:([A-Za-z0-9]+)\}", s):
        if not closing:
            stack.append(name)
        elif not stack:
            errs.append("schliessender Block ohne oeffnenden: /%s" % name)
        elif stack[-1] != name:
            errs.append("falsch verschachtelt: /%s schliesst %s" % (name, stack[-1]))
            stack.pop()
        else:
            stack.pop()

    if stack:
        errs.append("nicht geschlossen: " + ", ".join(stack))

    for m in re.finditer(r"<!--.*?-->", s, re.S):
        hits = re.findall(r"\{[A-Za-z/][^}]*\}", m.group(0))
        if hits:
            errs.append("Platzhalter im HTML-Kommentar (Tumblr parst die mit): "
                        + ", ".join(sorted(set(hits))))

    if errs:
        print("\n".join(errs))
        return 1
    print("ok: Bloecke balanciert, keine Platzhalter in Kommentaren")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "theme.html"))
