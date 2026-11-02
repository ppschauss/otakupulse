# OtakuPulse-Tumblr-Theme „Editorial Dark"

Theme für `otakupulse.tumblr.com`. Eine Datei: [`theme.html`](theme.html).
Entwurf und Begründung: `docs/superpowers/specs/2026-11-02-tumblr-kanal-design.md`.

## Einsetzen

1. Auf Tumblr einloggen → Blog auswählen → **Darstellung bearbeiten**
2. **Theme bearbeiten** → **Eigenes HTML bearbeiten**
3. Inhalt von `theme.html` komplett einsetzen (das Vorhandene ersetzen)
4. **Vorschau** prüfen, dann **Speichern**

Kein Deploy-Pfad, kein Automatismus. Die Datei liegt nur versioniert hier,
damit Änderungen nachvollziehbar sind. Wer im Tumblr-Editor etwas ändert,
muss es hier nachtragen — sonst läuft es auseinander.

## Was der Theme-Editor anpassbar macht

Ohne HTML anzufassen, über die Seitenleiste im Editor:

| Option | Default |
|---|---|
| Background / Text / Muted / Accent / Accent 2 / Line | OtakuPulse-Tokens (`#09090b`, `#ff4d6d`, `#8b5cf6` …) |
| Kicker | „Anime-News, jeden Tag" |
| Site Link / Site Label | `https://otakupulse.de` / `otakupulse.de` |
| Show Avatar | an |
| Show Notes | an |

`{CustomCSS}` steht am Ende des Style-Blocks, eigenes CSS aus dem Editor
überschreibt also alles.

## Die eine Stolperfalle: NPF

Posts, die der Social-Agent über die API im **Neue Post Format** erzeugt,
rendern in Legacy-Themes fast immer über die **Text**-Post-Variablen — nicht
über `{block:Photo}`. Praktische Folgen:

- Das Cover steckt **innerhalb** des Body, nicht in `PhotoURL-HighRes`.
  Das Theme holt es deshalb per CSS nach links
  (`.op-body > figure:first-child` und Geschwister-Selektoren), ab 560px
  Fensterbreite; darunter bleibt es volle Breite oben.
- Die Schlagzeile kommt als `<h2>` im Body an, weil `Title` bei
  NPF-Text-Posts leer bleibt. `.op-body h2` ist deshalb genauso gestylt wie
  `.op-title`.

Die Legacy-Blöcke Photo, Photoset, Quote, Link, Video, Audio, Chat und
Answer sind zusätzlich gestylt, damit manuell erstellte Posts nicht nackt
dastehen.

## Die zweite Stolperfalle: Tags in Kommentaren

Tumblrs Parser liest Template-Tags **auch in HTML-Kommentaren**. Ein
`block:Photo` in geschweiften Klammern in einem Kommentar zählt als
geöffneter Block — alles danach verschwindet, die Seite wird komplett weiß,
ohne Fehlermeldung. Genau daran ist die erste Fassung dieses Themes
gescheitert. In Kommentaren deshalb nie geschweifte Klammern um Tag-Namen
setzen.

Prüfen lässt sich das mit `check-balance.py` in diesem Ordner:

```
python3 check-balance.py theme.html
```

## Vor dem Scharfschalten prüfen

Die Selektoren für das Cover hängen daran, wie Tumblr NPF-Blöcke konkret in
HTML gießt, und das ist nicht offiziell dokumentiert. Also:

1. Erst **einen** Post über die API erzeugen (`DRY_RUN=0` nur für diesen
   einen, oder von Hand über die API).
2. Blog-Seite öffnen, Element-Inspektor auf das Cover.
3. Steht das Bild nicht als erstes Kind in `.op-body`, den Selektor in
   `theme.html` an die tatsächliche Struktur anpassen.

Erst danach den Kanal regulär laufen lassen.
