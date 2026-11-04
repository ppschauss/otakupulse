#!/usr/bin/env python3
"""Einmalige Tumblr-Autorisierung (OAuth 1.0a, HMAC-SHA1) fuer den OtakuPulse-Social-Agent.

Laeuft auf DEINEM Rechner (nicht im Container, nicht auf dem VPS) und braucht nur Python >= 3.10
und diesen Repo-Checkout. Es ist ein eigenstaendiges Werkzeug, kein Teil des Container-Codes.

Ablauf (der klassische Dreisprung):
  1. POST https://www.tumblr.com/oauth/request_token   (mit oauth_callback im Authorization-Header)
  2. Du oeffnest die ausgegebene Autorisierungs-URL im Browser und bestaetigst bei Tumblr.
     Tumblr leitet auf http://localhost:8808/callback weiter; dort lauscht kurz dieses Skript.
  3. POST https://www.tumblr.com/oauth/access_token    (mit oauth_verifier im Authorization-Header)
     -> oauth_token + oauth_token_secret, die als secrets.env-Zeilen ausgegeben werden.

Voraussetzung: In der Tumblr-App (https://www.tumblr.com/oauth/apps) ist als Callback exakt
`http://localhost:8808/callback` eingetragen.

Aufruf:
  export TUMBLR_CONSUMER_KEY=...        # oder --consumer-key
  export TUMBLR_CONSUMER_SECRET=...     # oder --consumer-secret; fehlt es, wird unsichtbar gefragt
  python3 social/tools/tumblr_auth.py

Sicherheit: Das Skript schreibt NICHTS in Dateien und gibt weder das Consumer Secret noch
Zwischen-Tokens aus. Nur die zwei fertigen Zeilen am Ende landen auf der Konsole (stdout); alle
Hinweise gehen nach stderr. Der Zugriffslog des Mini-Servers ist abgeschaltet, weil die
Callback-Adresse Token und Verifier traegt.

Die Signatur kommt aus app/oauth1.py (dieselbe Funktion wie im Tumblr-Adapter, stdlib-only, so
dass weder Config noch httpx noetig sind). Das Skript findet sie relativ zu seinem eigenen Ort:
<repo>/social/tools/ -> <repo>/social/build/app/oauth1.py.
"""
import argparse
import errno
import getpass
import html
import ipaddress
import os
import selectors
import socket
import socketserver
import ssl
import sys
import time
from email.utils import parsedate_to_datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, quote, urlsplit
from urllib.request import Request, urlopen

if sys.version_info < (3, 10):
    raise SystemExit("Fehler: Python 3.10 oder neuer wird benötigt.")

# Signatur wiederverwenden statt ein zweites Mal zu implementieren. Ausserhalb des Containers
# liegt build/ neben tools/; im Testcontainer ist /app bereits im Suchpfad.
_BUILD = Path(__file__).resolve().parent.parent / "build"
if (_BUILD / "app" / "oauth1.py").exists() and str(_BUILD) not in sys.path:
    sys.path.insert(0, str(_BUILD))
try:
    from app.oauth1 import oauth1_header
except ImportError:
    raise SystemExit(
        "Fehler: app/oauth1.py nicht gefunden. Das Skript muss im Repo-Checkout unter "
        "social/tools/ liegen (neben social/build/app/)."
    )

PORT = 8808
CALLBACK_PATH = "/callback"
CALLBACK_URL = f"http://localhost:{PORT}{CALLBACK_PATH}"
REQUEST_TOKEN_URL = "https://www.tumblr.com/oauth/request_token"
AUTHORIZE_URL = "https://www.tumblr.com/oauth/authorize"
ACCESS_TOKEN_URL = "https://www.tumblr.com/oauth/access_token"
WARTEZEIT_SEKUNDEN = 300  # so lange wartet der Listener auf deine Bestätigung im Browser
ANFRAGE_TIMEOUT = 5  # Sekunden, die der Listener auf eine einzelne Anfrage wartet (Idle-Verbindungen)


class AuthFehler(Exception):
    """Fehler mit fertigem deutschem Text; enthält nie Secrets oder Token."""


class CallbackUnpassend(AuthFehler):
    """Ein Aufruf von /callback, der nicht zu dieser Sitzung gehört (alter Tab, fremdes Token).
    Der Listener antwortet 400 und wartet weiter, statt den ganzen Lauf abzubrechen."""


# --- reine Funktionen (getestet in social/build/tests/test_tumblr_auth.py) ---

def resolve_credentials(arg_key, arg_secret, env) -> tuple[str, str]:
    """Consumer Key/Secret: Argument vor Umgebung; fehlende Werte bleiben leer."""
    key = (arg_key or env.get("TUMBLR_CONSUMER_KEY") or "").strip()
    secret = (arg_secret or env.get("TUMBLR_CONSUMER_SECRET") or "").strip()
    return key, secret


def build_authorize_url(oauth_token: str) -> str:
    return f"{AUTHORIZE_URL}?oauth_token={quote(oauth_token, safe='')}"


def build_signed_post(
    url: str, *, consumer_key: str, consumer_secret: str, token: str, token_secret: str,
    oauth_params: dict, nonce: str | None = None, timestamp: str | None = None,
) -> tuple[str, bytes]:
    """Authorization-Header und Body für einen Schritt des Dreisprungs.

    Die oauth_*-Parameter des Schritts (oauth_callback, oauth_verifier) stehen im Header und in
    der Signatur; der Body bleibt leer (die konventionelle Form nach RFC 5849, Abschnitt 3.5.1).
    """
    kopf = oauth1_header(
        "POST", url, consumer_key=consumer_key, consumer_secret=consumer_secret,
        token=token, token_secret=token_secret, protocol_params=oauth_params, nonce=nonce,
        timestamp=timestamp,
    )
    return kopf, b""


def ist_loopback(adresse: str) -> bool:
    """True für 127.0.0.0/8 und ::1, auch in der IPv4-in-IPv6-Schreibweise (::ffff:127.0.0.1)."""
    try:
        ip = ipaddress.ip_address(adresse.split("%")[0])
    except ValueError:
        return False
    if ip.version == 6 and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return ip.is_loopback


def parse_callback(request_target: str, erwartetes_token: str) -> str | None:
    """Prüft einen Aufruf des Listeners und liefert den oauth_verifier.

    None: anderer Pfad (z. B. /favicon.ico), einfach ignorieren.
    CallbackUnpassend: /callback, aber nicht zu dieser Sitzung (noch kein Token erwartet, Token
    fehlt oder passt nicht); der Lauf geht weiter. AuthFehler: der Callback gehört zur Sitzung, ist
    aber unbrauchbar (von Tumblr abgelehnt, ohne Verifier); der Lauf endet.
    """
    teile = urlsplit(request_target)
    if teile.path != CALLBACK_PATH:
        return None
    if not erwartetes_token:
        # Der Listener läuft schon vor dem request_token-Schritt; ohne Erwartungswert gäbe
        # "" == "" sonst jedem Aufruf ohne oauth_token recht.
        raise CallbackUnpassend("Noch keine Autorisierung gestartet; dieser Aufruf wird ignoriert.")
    q = dict(parse_qsl(teile.query, keep_blank_values=True))
    if "denied" in q:
        raise AuthFehler("Die Autorisierung wurde bei Tumblr abgelehnt. "
                         "Skript neu starten und im Browser auf „Erlauben“ klicken.")
    if q.get("oauth_token", "") != erwartetes_token:
        raise CallbackUnpassend("Dieser Aufruf gehört nicht zur laufenden Autorisierung "
                                "(oauth_token fehlt oder passt nicht), etwa ein alter Browser-Tab. "
                                "Nur die zuletzt im Terminal ausgegebene Adresse öffnen.")
    verifier = q.get("oauth_verifier", "").strip()
    if not verifier:
        raise AuthFehler("Tumblr hat keinen oauth_verifier mitgeschickt – die Bestätigung im "
                         "Browser fehlt oder ist unvollständig. Skript neu starten.")
    return verifier


def parse_token_response(text: str) -> tuple[str, str]:
    """`oauth_token=...&oauth_token_secret=...` -> (token, secret).

    Der Rohtext landet bewusst nie in der Fehlermeldung (er könnte ein halbes Token enthalten).
    """
    werte = dict(parse_qsl((text or "").strip(), keep_blank_values=True))
    token = werte.get("oauth_token", "")
    secret = werte.get("oauth_token_secret", "")
    if not token or not secret:
        raise AuthFehler("Die Antwort von Tumblr enthält kein vollständiges Token-Paar "
                         "(oauth_token und oauth_token_secret erwartet). Skript neu starten; "
                         "bleibt es dabei, hat Tumblr sein Antwortformat geändert.")
    return token, secret


def format_env_lines(token: str, secret: str) -> str:
    return f"TUMBLR_OAUTH_TOKEN={token}\nTUMBLR_OAUTH_TOKEN_SECRET={secret}"


def zeitversatz_sekunden(date_header, jetzt: float) -> int | None:
    """Wie weit die eigene Uhr der von Tumblr vorgeht (negativ: geht nach); None: unlesbar."""
    if not date_header:
        return None
    try:
        server = parsedate_to_datetime(date_header).timestamp()
    except (TypeError, ValueError):
        return None
    return int(jetzt - server)


_URSACHEN_401 = (
    "Häufigste Ursachen:\n"
    "  1. Consumer Key oder Consumer Secret stimmen nicht (Tippfehler, Leerzeichen, falsche App).\n"
    "  2. Die Callback-URL der Tumblr-App weicht ab. Sie muss in beiden Feldern exakt "
    f"{CALLBACK_URL} lauten.\n"
    "  3. Die Uhr deines Rechners geht falsch. Die Signatur enthält einen Zeitstempel, Tumblr "
    "lehnt bei mehr als ein paar Minuten Abweichung ab."
)

# Nur bekannte oauth_problem-Werte werden übersetzt; der Antworttext selbst wird nie durchgereicht.
_PROBLEME = {
    "timestamp_refused": "Tumblr lehnt den Zeitstempel ab: Die Uhr deines Rechners geht falsch. "
                         "Zeit synchronisieren (NTP) und neu starten.",
    "signature_invalid": "Die Signatur stimmt nicht: Consumer Key oder Consumer Secret sind "
                         "wahrscheinlich falsch (oder die Uhr geht falsch).",
    "consumer_key_unknown": "Tumblr kennt diesen Consumer Key nicht.",
    "consumer_key_rejected": "Tumblr hat diesen Consumer Key abgelehnt.",
    "token_rejected": "Tumblr hat das Token abgelehnt (abgelaufen oder schon benutzt). "
                      "Skript neu starten.",
    "token_expired": "Das Token ist abgelaufen. Skript neu starten.",
}


def erklaere_http_fehler(status: int, body, *, schritt: str, date_header=None,
                         jetzt: float | None = None) -> str:
    """Deutscher Text zu einer Ablehnung durch Tumblr. Enthält nie Zugangsdaten oder Rohantwort."""
    kopf = f"Tumblr hat den Schritt „{schritt}“ abgelehnt (HTTP {status})."
    if status in (400, 401, 403):
        zeilen = [kopf]
        problem = dict(parse_qsl(body or "", keep_blank_values=True)).get("oauth_problem", "")
        if problem in _PROBLEME:
            zeilen.append(_PROBLEME[problem])
        versatz = zeitversatz_sekunden(date_header, time.time() if jetzt is None else jetzt)
        if versatz is not None and abs(versatz) >= 120:
            richtung = "geht vor" if versatz > 0 else "geht nach"
            zeilen.append(f"Auffällig: Deine Uhr {richtung} gegenüber Tumblr um "
                          f"{round(abs(versatz) / 60)} Minuten. Das reicht für eine Ablehnung.")
        zeilen.append(_URSACHEN_401)
        return "\n".join(zeilen)
    if status == 429:
        return kopf + " Zu viele Anfragen; ein paar Minuten warten und neu starten."
    if status >= 500:
        return kopf + " Das ist ein Fehler auf Tumblrs Seite; später erneut versuchen."
    return kopf + " Unerwarteter Status; Skript neu starten und Key/Secret/Callback prüfen."


def erklaere_netzfehler(ursache) -> str:
    """Deutscher Text zu einem Verbindungsfehler. Nennt nur die Art des Fehlers, nie seinen Text
    oder seine Argumente (die könnten URL-Teile oder Kopfzeilen enthalten)."""
    if isinstance(ursache, ssl.SSLError):
        return ("Das TLS-Zertifikat von Tumblr wird nicht akzeptiert. Die Systemuhr (falsches Datum) "
                "oder einen Proxy bzw. eine Firewall mit TLS-Prüfung kontrollieren.")
    if isinstance(ursache, socket.gaierror):
        return "Der Name www.tumblr.com lässt sich nicht auflösen. Internetverbindung oder DNS prüfen."
    if isinstance(ursache, TimeoutError):
        return "Zeitüberschreitung bei Tumblr. Verbindung prüfen und neu versuchen."
    if isinstance(ursache, ConnectionRefusedError):
        return "Tumblr hat die Verbindung verweigert. Proxy oder Firewall prüfen."
    name = type(ursache).__name__ if isinstance(ursache, BaseException) else "unbekannt"
    return f"Keine Verbindung zu Tumblr ({name}). Internetverbindung und Proxy prüfen."


def _unerwartet(e: BaseException, wo: str) -> str:
    # Bewusst nur der Typname: nie repr/args, damit nichts Sensibles in der Meldung landet.
    return f"Unerwarteter Fehler ({type(e).__name__}) {wo}. Bitte das Skript neu starten."


# --- Netzwerk (der echte Austausch mit Tumblr ist ungetestet: braucht echte Zugangsdaten) ---

def _post_form(url: str, kopf: str, body: bytes) -> tuple[int, str, str | None]:
    req = Request(url, data=body, method="POST", headers={
        "Authorization": kopf,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "otakupulse-tumblr-auth/1",
    })
    try:
        with urlopen(req, timeout=20) as r:
            return r.status, r.read().decode("utf-8", "replace"), r.headers.get("Date")
    except HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), e.headers.get("Date")
    except URLError as e:
        raise AuthFehler(erklaere_netzfehler(e.reason)) from None
    except OSError as e:  # schließt TimeoutError, ConnectionError, ssl.SSLError ein
        raise AuthFehler(erklaere_netzfehler(e)) from None
    except Exception as e:  # noqa: BLE001 (RemoteDisconnected, IncompleteRead, ... beim Lesen)
        raise AuthFehler(_unerwartet(e, "bei der Verbindung zu Tumblr")) from None


def _schritt(url: str, schritt: str, *, ck: str, cs: str, token: str, token_secret: str,
             oauth_params: dict) -> tuple[str, str]:
    kopf, body = build_signed_post(url, consumer_key=ck, consumer_secret=cs, token=token,
                                   token_secret=token_secret, oauth_params=oauth_params)
    status, text, datum = _post_form(url, kopf, body)
    if status != 200:
        raise AuthFehler(erklaere_http_fehler(status, text, schritt=schritt, date_header=datum))
    return parse_token_response(text)


# --- Listener ---

class _Sitzung:
    """Gemeinsamer Zustand zwischen Hauptablauf und Request-Handler."""

    def __init__(self):
        self.erwartetes_token = ""
        self.verifier: str | None = None
        self.fehler: str | None = None

    @property
    def fertig(self) -> bool:
        return self.verifier is not None or self.fehler is not None


def _seite(titel: str, text: str) -> bytes:
    return (
        "<!doctype html><html lang=\"de\"><meta charset=\"utf-8\"><title>OtakuPulse</title>"
        "<body style=\"font:16px system-ui;background:#09090b;color:#f4f4f5;"
        "display:grid;place-items:center;min-height:100vh;margin:0\">"
        f"<main style=\"max-width:32rem;padding:1rem\"><h1>{html.escape(titel)}</h1>"
        f"<p>{html.escape(text)}</p></main></body></html>"
    ).encode()


def _handler(sitzung: _Sitzung):
    class Handler(BaseHTTPRequestHandler):
        timeout = ANFRAGE_TIMEOUT  # eine Verbindung, die nichts sendet, hält den Server nur kurz auf

        def do_GET(self):  # noqa: N802 (Name von http.server vorgegeben)
            if not ist_loopback(self.client_address[0]):
                # Zweite Schicht; der Server weist fremde Peers schon vor dem Lesen ab.
                self._antwort(403, _seite("Verboten", "Nur vom eigenen Rechner erreichbar."))
                return
            try:
                verifier = parse_callback(self.path, sitzung.erwartetes_token)
            except CallbackUnpassend as e:
                self._antwort(400, _seite("Nicht die laufende Autorisierung", str(e)))
                return
            except AuthFehler as e:
                sitzung.fehler = str(e)
                self._antwort(400, _seite("Das hat nicht geklappt", str(e)))
                return
            if verifier is None:
                self._antwort(404, _seite("Nicht gefunden", "Hier gibt es nur /callback."))
                return
            sitzung.verifier = verifier
            self._antwort(200, _seite("Fertig", "Die Autorisierung ist angekommen. "
                                      "Dieses Fenster kann geschlossen werden."))

        def _antwort(self, code: int, inhalt: bytes):
            self.send_response(code)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(inhalt)))
            self.end_headers()
            self.wfile.write(inhalt)

        def log_message(self, *args):  # Zugriffslog aus: die Adresse trägt Token und Verifier
            pass

    return Handler


class _V4Server(HTTPServer):
    """Hört nur auf 127.0.0.1. Fremde Peers werden geschlossen, bevor etwas gelesen wird."""
    ADRESSE = "127.0.0.1"

    def verify_request(self, request, client_address):
        return ist_loopback(client_address[0])

    def server_bind(self):
        # Nicht HTTPServer.server_bind: es löst per getfqdn den Hostnamen auf (unnötig, evtl. langsam).
        socketserver.TCPServer.server_bind(self)
        self.server_name, self.server_port = self.server_address[:2]


class _V6Server(_V4Server):
    """Hört nur auf ::1. Eigener Socket statt Dual-Stack auf ::, damit nichts außerhalb des
    eigenen Rechners die Adresse erreicht."""
    address_family = socket.AF_INET6
    ADRESSE = "::1"

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
        super().server_bind()


def _hoere_zu(sitzung: _Sitzung, port: int = PORT) -> list[HTTPServer]:
    """Öffnet je einen Loopback-Socket für IPv4 und IPv6 (`localhost` löst je nach System und
    Browser zu 127.0.0.1 oder ::1 auf). Fehlt IPv6, genügt IPv4; ein belegter Port bricht ab."""
    handler = _handler(sitzung)
    server: list[HTTPServer] = []
    letzter: OSError | None = None
    try:
        for klasse in (_V4Server, _V6Server):
            try:
                server.append(klasse((klasse.ADRESSE, port), handler))
            except OSError as e:
                if e.errno == errno.EADDRINUSE:
                    raise AuthFehler(
                        f"Port {PORT} ist belegt. Bei Tumblr ist die Callback-URL fest auf diesen "
                        "Port eingetragen. Das andere Programm beenden (oft ein noch laufendes "
                        "Exemplar dieses Skripts) und neu starten.") from None
                letzter = e  # z. B. kein IPv6 auf diesem System: still weglassen
        if not server:
            grund = (letzter.strerror if letzter else None) or "unbekannter Grund"
            raise AuthFehler(f"Port {PORT} lässt sich auf dem eigenen Rechner nicht öffnen "
                             f"({grund}). Die Callback-URL ist bei Tumblr fest auf diesen Port "
                             "eingetragen.")
    except BaseException:
        for s in server:
            s.server_close()
        raise
    for s in server:
        s.timeout = 0  # handle_request kehrt sofort zurück; gewartet wird per selectors
    return server


def _warte_auf_callback(servers: list[HTTPServer], sitzung: _Sitzung, wartezeit: float) -> str:
    ende = time.monotonic() + wartezeit
    sel = selectors.DefaultSelector()
    try:
        for s in servers:
            sel.register(s, selectors.EVENT_READ)
        while not sitzung.fertig:
            rest = ende - time.monotonic()
            if rest <= 0:
                break
            for key, _ in sel.select(timeout=min(1.0, rest)):
                key.fileobj.handle_request()
                if sitzung.fertig:
                    break
    finally:
        sel.close()
        for s in servers:
            s.server_close()  # der Server lebt nur bis zum Callback
    if sitzung.fehler:
        raise AuthFehler(sitzung.fehler)
    if sitzung.verifier is None:
        raise AuthFehler(f"Keine Bestätigung innerhalb von {int(wartezeit)} Sekunden. "
                         "Skript neu starten.")
    return sitzung.verifier


# --- Ablauf ---

def _info(text: str = "") -> None:
    print(text, file=sys.stderr)


def autorisiere(ck: str, cs: str, wartezeit: float = WARTEZEIT_SEKUNDEN,
                port: int = PORT) -> tuple[str, str]:
    sitzung = _Sitzung()
    servers = _hoere_zu(sitzung, port)  # zuerst: ein belegter Port soll vor dem Netz scheitern
    try:
        req_token, req_secret = _schritt(
            REQUEST_TOKEN_URL, "request_token", ck=ck, cs=cs, token="", token_secret="",
            oauth_params={"oauth_callback": CALLBACK_URL})
        sitzung.erwartetes_token = req_token
        _info("Öffne diese Adresse im Browser und bestätige bei Tumblr (Strg+Klick):")
        _info()
        _info("  " + build_authorize_url(req_token))
        _info()
        _info(f"Warte auf die Weiterleitung nach {CALLBACK_URL} (höchstens {int(wartezeit)} s) ...")
    except BaseException:
        for s in servers:
            s.server_close()
        raise
    verifier = _warte_auf_callback(servers, sitzung, wartezeit)
    _info("Bestätigung erhalten, hole das Zugriffs-Token ...")
    return _schritt(ACCESS_TOKEN_URL, "access_token", ck=ck, cs=cs, token=req_token,
                    token_secret=req_secret, oauth_params={"oauth_verifier": verifier})


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Einmalige Tumblr-Autorisierung für OtakuPulse.")
    p.add_argument("--consumer-key", help="sonst TUMBLR_CONSUMER_KEY aus der Umgebung")
    p.add_argument("--consumer-secret",
                   help="sonst TUMBLR_CONSUMER_SECRET aus der Umgebung (Umgebung ist sicherer: "
                        "Argumente stehen in Prozessliste und Shell-Verlauf)")
    p.add_argument("--timeout", type=int, default=WARTEZEIT_SEKUNDEN, metavar="SEKUNDEN",
                   help=f"Wartezeit auf die Bestätigung im Browser (Standard {WARTEZEIT_SEKUNDEN})")
    args = p.parse_args(argv)

    ck, cs = resolve_credentials(args.consumer_key, args.consumer_secret, os.environ)
    if sys.stdin.isatty():
        if not ck:
            print("Consumer Key: ", end="", file=sys.stderr, flush=True)  # stdout bleibt sauber
            ck = input().strip()
        if not cs:
            cs = getpass.getpass("Consumer Secret (Eingabe bleibt unsichtbar): ").strip()
    if not ck or not cs:
        _info("Fehler: Consumer Key und Consumer Secret fehlen. Als --consumer-key/"
              "--consumer-secret übergeben oder TUMBLR_CONSUMER_KEY/TUMBLR_CONSUMER_SECRET "
              "setzen (Werte aus https://www.tumblr.com/oauth/apps).")
        return 2

    try:
        token, secret = autorisiere(ck, cs, wartezeit=args.timeout)
    except AuthFehler as e:
        _info(f"\nFehler: {e}")
        return 1
    except KeyboardInterrupt:
        _info("\nAbgebrochen.")
        return 130
    except Exception as e:  # noqa: BLE001
        _info("\nFehler: " + _unerwartet(e, "im Ablauf"))
        return 1

    _info("\nFertig. Diese zwei Zeilen in social/secrets.env eintragen (nicht in Chats, Tickets "
          "oder Logs kopieren):\n")
    print(format_env_lines(token, secret))
    return 0


if __name__ == "__main__":
    sys.exit(main())
