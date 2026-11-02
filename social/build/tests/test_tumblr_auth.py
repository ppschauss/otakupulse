"""Tests fuer das Autorisierungs-Hilfsskript social/tools/tumblr_auth.py.

Getestet werden die reinen Teile (URL, Callback-Parsing, Token-Antwort, Ausgabe, Signatur der
Dreisprung-Requests, Fehlertexte) UND die Logik des Listeners samt Ablauf: der Handler laeuft auf
Loopback-Port 0 (nie auf 8808), `_post_form`/`urlopen` sind ersetzt. Ungetestet bleiben allein der
echte Austausch mit Tumblr und der Browser: dafuer gibt es weder Zugangsdaten noch einen Browser.

Die Erwartungswerte der Signaturen stammen unabhaengig aus oauthlib (Client mit
signature_type=BODY, gleiche Schluessel, Nonce und Zeitstempel).
"""
import errno
import http.client
import importlib.util
import io
import socket
import ssl
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.error import URLError

import pytest

BUILD = Path(__file__).resolve().parent.parent  # social/build bzw. /app im Testcontainer


def _skript_pfad() -> Path:
    # Lokal liegt das Skript in social/tools, im Testcontainer wird es nach /app/tools gehaengt.
    for kandidat in (BUILD / "tools", BUILD.parent / "tools"):
        p = kandidat / "tumblr_auth.py"
        if p.exists():
            return p
    pytest.fail("tumblr_auth.py nicht gefunden (manage.sh test haengt social/tools nach /app/tools)")


@pytest.fixture
def auth():
    spec = importlib.util.spec_from_file_location("tumblr_auth", _skript_pfad())
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    return modul


# --- Signatur: geteilte Funktion ---

def test_oauth1_modul_braucht_weder_config_noch_httpx():
    """Das Skript laeuft ausserhalb des Containers: der Import darf keine Pflicht-Variablen
    (app.config) und keine Zusatzpakete (httpx) verlangen."""
    code = (
        "import sys; sys.path.insert(0, sys.argv[1]); import app.oauth1; "
        "bad = [m for m in ('app.config', 'httpx') if m in sys.modules]; "
        "sys.exit('geladen: ' + ','.join(bad) if bad else 0)"
    )
    r = subprocess.run([sys.executable, "-I", "-c", code, str(BUILD)],
                       capture_output=True, text=True, env={})
    assert r.returncode == 0, r.stderr


def test_tumblr_und_skript_nutzen_dieselbe_signaturfunktion(auth):
    from app.channels import tumblr
    from app import oauth1
    assert tumblr.oauth1_header is oauth1.oauth1_header
    assert auth.oauth1_header is oauth1.oauth1_header


# --- Dreisprung: signierte Requests ---

def test_request_token_signatur_gegen_oauthlib(auth):
    kopf, body = auth.build_signed_post(
        auth.REQUEST_TOKEN_URL, consumer_key="ck", consumer_secret="cs", token="",
        token_secret="", oauth_params={"oauth_callback": auth.CALLBACK_URL},
        nonce="n0nce", timestamp="1700000000",
    )
    assert 'oauth_signature="SlAGuPWvqwj373w7G1VFc5HE0RQ%3D"' in kopf
    assert 'oauth_callback="http%3A%2F%2Flocalhost%3A8808%2Fcallback"' in kopf
    assert "oauth_token" not in kopf  # erster Schritt: noch kein Token
    assert body == b""


def test_access_token_signatur_gegen_oauthlib(auth):
    kopf, body = auth.build_signed_post(
        auth.ACCESS_TOKEN_URL, consumer_key="ck", consumer_secret="cs", token="rtok",
        token_secret="rsec", oauth_params={"oauth_verifier": "ver1"},
        nonce="n0nce", timestamp="1700000000",
    )
    assert 'oauth_signature="q3txechXeAmSN5hYzsJmKpkF500%3D"' in kopf
    assert 'oauth_token="rtok"' in kopf
    assert 'oauth_verifier="ver1"' in kopf
    assert body == b""


def test_protocol_params_stehen_im_header_extra_params_nicht():
    """oauth_*-Protokollparameter gehoeren in den Header; formularkodierte Body-Parameter nur
    in die Signatur (die Signatur selbst ist in beiden Faellen dieselbe)."""
    from app.oauth1 import oauth1_header
    basis = dict(consumer_key="ck", consumer_secret="cs", token="", token_secret="",
                 nonce="n0nce", timestamp="1700000000")
    url = "https://www.tumblr.com/oauth/request_token"
    cb = "http://localhost:8808/callback"
    im_header = oauth1_header("POST", url, protocol_params={"oauth_callback": cb}, **basis)
    nur_signiert = oauth1_header("POST", url, extra_params={"oauth_callback": cb}, **basis)
    assert "oauth_callback=" in im_header
    assert "oauth_callback" not in nur_signiert
    sig = 'oauth_signature="SlAGuPWvqwj373w7G1VFc5HE0RQ%3D"'
    assert sig in im_header and sig in nur_signiert


def test_feste_adressen(auth):
    assert auth.CALLBACK_URL == "http://localhost:8808/callback"
    assert auth.PORT == 8808
    assert auth.REQUEST_TOKEN_URL == "https://www.tumblr.com/oauth/request_token"
    assert auth.ACCESS_TOKEN_URL == "https://www.tumblr.com/oauth/access_token"


# --- Autorisierungs-URL ---

def test_authorize_url(auth):
    assert auth.build_authorize_url("abc123") == \
        "https://www.tumblr.com/oauth/authorize?oauth_token=abc123"


def test_authorize_url_kodiert_sonderzeichen(auth):
    assert auth.build_authorize_url("a b&c") == \
        "https://www.tumblr.com/oauth/authorize?oauth_token=a%20b%26c"


# --- Callback-Query ---

def test_callback_liefert_verifier(auth):
    assert auth.parse_callback("/callback?oauth_token=rtok&oauth_verifier=ver1", "rtok") == "ver1"


def test_anderer_pfad_wird_ignoriert(auth):
    assert auth.parse_callback("/favicon.ico", "rtok") is None
    assert auth.parse_callback("/", "rtok") is None
    assert auth.parse_callback("/callback/extra?oauth_verifier=x&oauth_token=rtok", "rtok") is None


def test_callback_ohne_verifier_beendet_den_lauf(auth):
    """Token passt, aber Tumblr schickt keinen Verifier: echter Fehler, kein Warten."""
    with pytest.raises(auth.AuthFehler) as e:
        auth.parse_callback("/callback?oauth_token=rtok", "rtok")
    assert not isinstance(e.value, auth.CallbackUnpassend)
    assert "oauth_verifier" in str(e.value)


def test_callback_abgelehnt_beendet_den_lauf(auth):
    with pytest.raises(auth.AuthFehler) as e:
        auth.parse_callback("/callback?denied=rtok", "rtok")
    assert not isinstance(e.value, auth.CallbackUnpassend)
    assert "abgelehnt" in str(e.value).lower()


def test_callback_ohne_query_ist_unpassend(auth):
    with pytest.raises(auth.CallbackUnpassend):
        auth.parse_callback("/callback", "rtok")


def test_callback_ohne_oauth_token_ist_unpassend(auth):
    with pytest.raises(auth.CallbackUnpassend):
        auth.parse_callback("/callback?oauth_verifier=v", "rtok")


def test_callback_mit_fremdem_token_ist_unpassend(auth):
    """Alter Browser-Tab o. ae.: nicht zu dieser Sitzung, aber kein Grund aufzugeben."""
    with pytest.raises(auth.CallbackUnpassend) as e:
        auth.parse_callback("/callback?oauth_token=fremd&oauth_verifier=v", "rtok")
    assert "fremd" not in str(e.value)  # kein Token in Fehlermeldungen


def test_callback_ohne_erwartungswert_ist_unpassend(auth):
    """Der Listener laeuft vor dem request_token-Schritt: "" == "" darf nicht durchgehen."""
    with pytest.raises(auth.CallbackUnpassend):
        auth.parse_callback("/callback?oauth_verifier=x", "")
    with pytest.raises(auth.CallbackUnpassend):
        auth.parse_callback("/callback?oauth_token=&oauth_verifier=x", "")


# --- Token-Antwort ---

def test_token_antwort_parsen(auth):
    assert auth.parse_token_response("oauth_token=abc&oauth_token_secret=xyz") == ("abc", "xyz")


def test_token_antwort_reihenfolge_und_zusatzfelder(auth):
    roh = "oauth_callback_confirmed=true&oauth_token_secret=xyz&oauth_token=abc\n"
    assert auth.parse_token_response(roh) == ("abc", "xyz")


def test_token_antwort_dekodiert_prozentkodierung(auth):
    assert auth.parse_token_response("oauth_token=a%2Bb&oauth_token_secret=c%2Fd") == ("a+b", "c/d")


@pytest.mark.parametrize("roh", [
    "", "<html>Fehler</html>", "oauth_token=nur-token", "oauth_token_secret=nur-secret",
    "oauth_token=&oauth_token_secret=",
])
def test_token_antwort_unvollstaendig_ist_fehler(auth, roh):
    with pytest.raises(auth.AuthFehler):
        auth.parse_token_response(roh)


def test_token_antwort_fehler_enthaelt_keine_rohdaten(auth):
    """Der Antworttext kann ein halbes Token enthalten und darf nicht in der Meldung landen."""
    with pytest.raises(auth.AuthFehler) as e:
        auth.parse_token_response("oauth_token=GEHEIMES-TOKEN")
    assert "GEHEIMES-TOKEN" not in str(e.value)


# --- Ausgabe ---

def test_env_zeilen(auth):
    assert auth.format_env_lines("abc", "xyz") == \
        "TUMBLR_OAUTH_TOKEN=abc\nTUMBLR_OAUTH_TOKEN_SECRET=xyz"


# --- Zugangsdaten ---

def test_zugangsdaten_aus_argumenten(auth):
    assert auth.resolve_credentials("k", "s", {"TUMBLR_CONSUMER_KEY": "ek"}) == ("k", "s")


def test_zugangsdaten_aus_umgebung(auth):
    env = {"TUMBLR_CONSUMER_KEY": " ek ", "TUMBLR_CONSUMER_SECRET": "es"}
    assert auth.resolve_credentials(None, None, env) == ("ek", "es")


def test_zugangsdaten_teilweise_fehlend(auth):
    assert auth.resolve_credentials(None, "s", {}) == ("", "s")
    assert auth.resolve_credentials("", "", {}) == ("", "")


# --- Fehlertexte ---

def test_fehlertext_401_nennt_die_drei_haeufigen_ursachen(auth):
    t = auth.erklaere_http_fehler(401, "", schritt="request_token")
    assert "Consumer Key" in t and "Secret" in t
    assert "localhost:8808/callback" in t
    assert "Uhr" in t  # Zeitversatz


def test_fehlertext_400_wie_401(auth):
    assert "localhost:8808/callback" in auth.erklaere_http_fehler(400, "", schritt="request_token")


def test_fehlertext_zeitversatz_bei_bekannter_abweichung(auth):
    t = auth.erklaere_http_fehler(
        401, "", schritt="request_token",
        date_header="Mon, 02 Nov 2026 12:00:00 GMT", jetzt=1793620800 + 900,
    )
    assert "15 Minuten" in t and "geht vor" in t


def test_fehlertext_kleiner_zeitversatz_wird_nicht_genannt(auth):
    t = auth.erklaere_http_fehler(
        401, "", schritt="request_token",
        date_header="Mon, 02 Nov 2026 12:00:00 GMT", jetzt=1793620800 + 30,
    )
    assert "Auffällig" not in t


def test_fehlertext_oauth_problem_wird_ueber_das_mapping_uebersetzt(auth):
    """Prueft die Saetze aus _PROBLEME; die allgemeinen Ursachen allein bestuenden den Test nicht."""
    t = auth.erklaere_http_fehler(401, "oauth_problem=timestamp_refused", schritt="request_token")
    assert "Zeit synchronisieren (NTP)" in t
    t = auth.erklaere_http_fehler(401, "oauth_problem=signature_invalid", schritt="request_token")
    assert "Die Signatur stimmt nicht" in t
    t = auth.erklaere_http_fehler(401, "oauth_problem=token_rejected", schritt="access_token")
    assert "abgelaufen oder schon benutzt" in t


def test_fehlertext_unbekanntes_oauth_problem_wird_nicht_durchgereicht(auth):
    t = auth.erklaere_http_fehler(401, "oauth_problem=cs-geheim-12345", schritt="request_token")
    assert "cs-geheim-12345" not in t
    assert "Häufigste Ursachen" in t


def test_fehlertext_429(auth):
    t = auth.erklaere_http_fehler(429, "", schritt="request_token")
    assert "429" in t and "Zu viele Anfragen" in t


def test_fehlertext_5xx(auth):
    t = auth.erklaere_http_fehler(503, "<html>boese</html>", schritt="access_token")
    assert "503" in t and "access_token" in t and "Tumblrs Seite" in t
    assert "boese" not in t  # Antworttext nicht ungeprueft durchreichen


def test_fehlertext_sonstiger_status(auth):
    t = auth.erklaere_http_fehler(404, "", schritt="request_token")
    assert "404" in t and "Unerwarteter Status" in t


def test_zeitversatz_berechnung(auth):
    # 02 Nov 2026 12:00:00 GMT = 1793620800
    assert auth.zeitversatz_sekunden("Mon, 02 Nov 2026 12:00:00 GMT", 1793620800) == 0
    assert auth.zeitversatz_sekunden("Mon, 02 Nov 2026 12:00:00 GMT", 1793620800 + 300) == 300
    assert auth.zeitversatz_sekunden("Mon, 02 Nov 2026 12:00:00 GMT", 1793620800 - 60) == -60


def test_zeitversatz_unlesbar_ist_none(auth):
    assert auth.zeitversatz_sekunden("", 0) is None
    assert auth.zeitversatz_sekunden(None, 0) is None
    assert auth.zeitversatz_sekunden("kein Datum", 0) is None


# --- Netzwerkfehler (urlopen ersetzt) ---

class _Antwort:
    """Minimale Antwort mit Kontextmanager, deren read() scheitert."""
    status = 200
    headers = {}

    def __init__(self, fehler):
        self._fehler = fehler

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        raise self._fehler


def _urlopen_wirft(fehler):
    def f(*a, **k):
        raise fehler
    return f


def _post(auth):
    return auth._post_form("https://www.tumblr.com/oauth/request_token", "OAuth x", b"")


@pytest.mark.parametrize("fehler, erwartet", [
    (URLError(socket.gaierror(-2, "Name or service not known")), "DNS"),
    (URLError(ssl.SSLCertVerificationError()), "Zertifikat"),
    (URLError(ConnectionRefusedError()), "verweigert"),
    (TimeoutError(), "Zeitüberschreitung"),
    (URLError("irgendwas"), "Keine Verbindung zu Tumblr"),
])
def test_post_form_netzfehler_sind_verstaendlich(auth, monkeypatch, fehler, erwartet):
    monkeypatch.setattr(auth, "urlopen", _urlopen_wirft(fehler))
    with pytest.raises(auth.AuthFehler) as e:
        _post(auth)
    assert erwartet in str(e.value)


def test_post_form_abgerissene_verbindung_nennt_nur_den_typnamen(auth, monkeypatch):
    monkeypatch.setattr(auth, "urlopen", _urlopen_wirft(
        http.client.RemoteDisconnected("geheim-12345")))
    with pytest.raises(auth.AuthFehler) as e:
        _post(auth)
    assert "RemoteDisconnected" in str(e.value)
    assert "geheim-12345" not in str(e.value)


def test_post_form_fehler_beim_lesen_ist_deutsch_und_ohne_details(auth, monkeypatch):
    """IncompleteRead & Co. beim r.read() liefen frueher als englischer Traceback durch."""
    monkeypatch.setattr(auth, "urlopen", lambda *a, **k: _Antwort(
        http.client.IncompleteRead(b"geheim-12345", 99)))
    with pytest.raises(auth.AuthFehler) as e:
        _post(auth)
    text = str(e.value)
    assert "Unerwarteter Fehler (IncompleteRead)" in text and "neu starten" in text
    assert "geheim-12345" not in text


# --- Listener ---

def _get(port, pfad):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        c.request("GET", pfad)
        r = c.getresponse()
        r.read()
        return r.status
    finally:
        c.close()


def _lauf(auth, sitzung, aktionen, wartezeit=10):
    """Startet den Listener auf Port 0, laesst `aktionen(port)` in einem Thread laufen und wartet
    wie das Skript. Liefert (Verifier oder AuthFehler, Ergebnis der Aktionen, Dauer)."""
    servers = auth._hoere_zu(sitzung, 0)
    port = servers[0].server_address[1]  # IPv4 ist immer der erste
    ergebnis = {}
    t = threading.Thread(target=lambda: ergebnis.update(antwort=aktionen(port)))
    t.start()
    start = time.monotonic()
    try:
        wert = auth._warte_auf_callback(servers, sitzung, wartezeit)
    except auth.AuthFehler as e:
        wert = e
    dauer = time.monotonic() - start
    t.join(timeout=10)
    return wert, ergebnis.get("antwort"), dauer


def _sitzung(auth, token="rtok"):
    s = auth._Sitzung()
    s.erwartetes_token = token
    return s


def test_listener_404_fuer_fremde_pfade_dann_callback(auth):
    s = _sitzung(auth)
    wert, codes, _ = _lauf(auth, s, lambda p: [
        _get(p, "/favicon.ico"), _get(p, "/callback?oauth_token=rtok&oauth_verifier=V1")])
    assert wert == "V1" and codes == [404, 200]
    assert s.verifier == "V1" and s.fehler is None and s.fertig


def test_listener_falsches_token_gibt_400_und_wartet_weiter(auth):
    """Ein alter Browser-Tab darf den Lauf nicht beenden (M2)."""
    s = _sitzung(auth)
    wert, codes, _ = _lauf(auth, s, lambda p: [
        _get(p, "/callback?oauth_token=alt&oauth_verifier=X"),
        _get(p, "/callback?oauth_token=rtok&oauth_verifier=V2")])
    assert codes == [400, 200] and wert == "V2"
    assert s.fehler is None


def test_listener_ohne_erwartetes_token_nimmt_nichts_an(auth):
    s = _sitzung(auth, token="")
    wert, codes, _ = _lauf(auth, s, lambda p: [_get(p, "/callback?oauth_verifier=x")], wartezeit=1)
    assert codes == [400]
    assert s.verifier is None and s.fehler is None
    assert isinstance(wert, auth.AuthFehler) and "Keine Bestätigung" in str(wert)


def test_listener_abgelehnt_beendet_sofort(auth):
    s = _sitzung(auth)
    wert, codes, dauer = _lauf(auth, s, lambda p: [_get(p, "/callback?denied=rtok")])
    assert codes == [400]
    assert isinstance(wert, auth.AuthFehler) and "abgelehnt" in str(wert)
    assert s.fehler and dauer < 5


def test_listener_timeout_und_server_schliesst(auth):
    s = _sitzung(auth)
    servers = auth._hoere_zu(s, 0)
    port = servers[0].server_address[1]
    with pytest.raises(auth.AuthFehler) as e:
        auth._warte_auf_callback(servers, s, 1)
    assert "Keine Bestätigung innerhalb von 1 Sekunden" in str(e.value)
    with pytest.raises(ConnectionRefusedError):
        socket.create_connection(("127.0.0.1", port), timeout=2)


def test_listener_nach_dem_callback_ist_der_server_zu(auth):
    s = _sitzung(auth)
    servers = auth._hoere_zu(s, 0)
    port = servers[0].server_address[1]
    t = threading.Thread(target=lambda: _get(port, "/callback?oauth_token=rtok&oauth_verifier=V"))
    t.start()
    assert auth._warte_auf_callback(servers, s, 10) == "V"
    t.join()
    with pytest.raises(ConnectionRefusedError):
        socket.create_connection(("127.0.0.1", port), timeout=2)


def test_listener_untaetiger_client_blockiert_nicht(auth, monkeypatch):
    """I1: eine offene Verbindung, die nichts sendet (z. B. spekulativer Preconnect des
    Browsers), darf den Single-Thread-Server nur kurz aufhalten."""
    monkeypatch.setattr(auth, "ANFRAGE_TIMEOUT", 0.5)
    s = _sitzung(auth)

    def aktionen(port):
        idle = socket.create_connection(("127.0.0.1", port), timeout=5)
        try:
            time.sleep(0.1)  # der Server hat die Idle-Verbindung als erste angenommen
            return _get(port, "/callback?oauth_token=rtok&oauth_verifier=V3")
        finally:
            idle.close()

    wert, code, dauer = _lauf(auth, s, aktionen, wartezeit=10)
    assert wert == "V3" and code == 200
    assert dauer < 4


def test_listener_wartezeit_gilt_trotz_untaetigem_client(auth, monkeypatch):
    monkeypatch.setattr(auth, "ANFRAGE_TIMEOUT", 0.5)
    s = _sitzung(auth)

    def aktionen(port):
        idle = socket.create_connection(("127.0.0.1", port), timeout=5)
        time.sleep(2.5)
        idle.close()

    wert, _, dauer = _lauf(auth, s, aktionen, wartezeit=1)
    assert isinstance(wert, auth.AuthFehler) and "Keine Bestätigung" in str(wert)
    assert dauer < 3


def test_server_weist_fremde_peers_vor_dem_lesen_ab(auth):
    s = _sitzung(auth)
    servers = auth._hoere_zu(s, 0)
    try:
        for srv in servers:
            assert srv.verify_request(None, ("127.0.0.1", 1))
            assert srv.verify_request(None, ("::1", 1, 0, 0))
            assert srv.verify_request(None, ("::ffff:127.0.0.1", 1, 0, 0))
            assert not srv.verify_request(None, ("192.168.1.5", 1))
            assert not srv.verify_request(None, ("2001:db8::1", 1, 0, 0))
    finally:
        for srv in servers:
            srv.server_close()


def test_ist_loopback(auth):
    for ok in ("127.0.0.1", "::1", "::ffff:127.0.0.1", "::1%lo"):
        assert auth.ist_loopback(ok), ok
    for nein in ("192.168.1.5", "10.0.0.1", "::ffff:192.168.1.5", "2001:db8::1", "kaputt", ""):
        assert not auth.ist_loopback(nein), nein


def test_listener_bindet_nur_loopback(auth):
    servers = auth._hoere_zu(_sitzung(auth), 0)
    try:
        assert servers and servers[0].server_address[0] == "127.0.0.1"
        assert all(s.server_address[0] in ("127.0.0.1", "::1") for s in servers)
    finally:
        for s in servers:
            s.server_close()


def test_ohne_ipv6_reicht_ipv4(auth, monkeypatch):
    class KeinIPv6:
        ADRESSE = "::1"

        def __init__(self, *a, **k):
            raise OSError(errno.EAFNOSUPPORT, "Address family not supported by protocol")

    monkeypatch.setattr(auth, "_V6Server", KeinIPv6)
    servers = auth._hoere_zu(_sitzung(auth), 0)
    try:
        assert len(servers) == 1 and servers[0].server_address[0] == "127.0.0.1"
    finally:
        for s in servers:
            s.server_close()


def test_belegter_port_hat_eigene_meldung(auth):
    belegt = socket.socket()
    belegt.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    belegt.bind(("127.0.0.1", 0))
    belegt.listen()
    try:
        with pytest.raises(auth.AuthFehler) as e:
            auth._hoere_zu(_sitzung(auth), belegt.getsockname()[1])
        assert "belegt" in str(e.value) and "8808" in str(e.value)
    finally:
        belegt.close()


def test_weder_ipv4_noch_ipv6_ist_ein_deutscher_fehler(auth, monkeypatch):
    class Kaputt:
        ADRESSE = "127.0.0.1"

        def __init__(self, *a, **k):
            raise OSError(errno.EAFNOSUPPORT, "nicht unterstuetzt")

    monkeypatch.setattr(auth, "_V4Server", Kaputt)
    monkeypatch.setattr(auth, "_V6Server", Kaputt)
    with pytest.raises(auth.AuthFehler) as e:
        auth._hoere_zu(_sitzung(auth), 0)
    assert "8808" in str(e.value) and "nicht öffnen" in str(e.value)


# --- Ablauf (autorisiere) ---

def _freier_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class _FakeTumblr:
    def __init__(self, auth, request_status=200):
        self.auth = auth
        self.aufrufe = []
        self.request_status = request_status

    def __call__(self, url, kopf, body):
        self.aufrufe.append((url, kopf, body))
        if url == self.auth.REQUEST_TOKEN_URL:
            if self.request_status != 200:
                return self.request_status, "", None
            return 200, "oauth_token=rtok&oauth_token_secret=rsec&oauth_callback_confirmed=true", None
        return 200, "oauth_token=ACC&oauth_token_secret=ACCSEC", None


def _klopfe_an(port, ende=8):
    """Schickt den Callback, bis er angenommen wird (er kommt absichtlich evtl. zu frueh)."""
    stop = time.monotonic() + ende
    codes = []
    while time.monotonic() < stop:
        try:
            codes.append(_get(port, "/callback?oauth_token=rtok&oauth_verifier=VER"))
        except OSError:
            pass
        if codes and codes[-1] == 200:
            break
        time.sleep(0.05)
    return codes


def test_autorisiere_reihenfolge_und_header(auth, monkeypatch, capsys):
    fake = _FakeTumblr(auth)
    monkeypatch.setattr(auth, "_post_form", fake)
    port = _freier_port()
    ergebnis = {}
    t = threading.Thread(target=lambda: ergebnis.update(codes=_klopfe_an(port)))
    t.start()
    token = auth.autorisiere("ck", "cs", wartezeit=10, port=port)
    t.join()

    assert token == ("ACC", "ACCSEC")
    assert ergebnis["codes"][-1] == 200
    assert [a[0] for a in fake.aufrufe] == [auth.REQUEST_TOKEN_URL, auth.ACCESS_TOKEN_URL]
    (_, kopf1, body1), (_, kopf2, body2) = fake.aufrufe
    assert "oauth_callback=" in kopf1 and "oauth_token=" not in kopf1
    assert 'oauth_token="rtok"' in kopf2 and 'oauth_verifier="VER"' in kopf2
    assert body1 == b"" and body2 == b""
    err = capsys.readouterr().err
    assert "https://www.tumblr.com/oauth/authorize?oauth_token=rtok" in err
    assert "rsec" not in err and "ACCSEC" not in err


def test_autorisiere_scheitert_request_token_und_schliesst_den_listener(auth, monkeypatch):
    fake = _FakeTumblr(auth, request_status=401)
    monkeypatch.setattr(auth, "_post_form", fake)
    port = _freier_port()
    with pytest.raises(auth.AuthFehler) as e:
        auth.autorisiere("ck", "cs", wartezeit=5, port=port)
    assert "request_token" in str(e.value) and "401" in str(e.value)
    assert [a[0] for a in fake.aufrufe] == [auth.REQUEST_TOKEN_URL]  # access_token nie versucht
    probe = socket.socket()  # Port wieder frei
    probe.bind(("127.0.0.1", port))
    probe.close()


def test_autorisiere_bindet_vor_dem_netz(auth, monkeypatch):
    """Ein belegter Port soll scheitern, bevor irgendein Request an Tumblr geht."""
    fake = _FakeTumblr(auth)
    monkeypatch.setattr(auth, "_post_form", fake)
    belegt = socket.socket()
    belegt.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    belegt.bind(("127.0.0.1", 0))
    belegt.listen()
    try:
        with pytest.raises(auth.AuthFehler):
            auth.autorisiere("ck", "cs", wartezeit=1, port=belegt.getsockname()[1])
    finally:
        belegt.close()
    assert fake.aufrufe == []


# --- main ---

class _TtyStdin(io.StringIO):
    def isatty(self):
        return True


@pytest.fixture
def ohne_env(monkeypatch):
    monkeypatch.delenv("TUMBLR_CONSUMER_KEY", raising=False)
    monkeypatch.delenv("TUMBLR_CONSUMER_SECRET", raising=False)


def test_main_ohne_zugangsdaten(auth, ohne_env, capsys):
    assert auth.main([]) == 2
    out, err = capsys.readouterr()
    assert out == "" and "Consumer Key" in err


def test_main_gibt_nur_die_zwei_zeilen_auf_stdout_aus(auth, ohne_env, monkeypatch, capsys):
    monkeypatch.setattr(auth, "autorisiere", lambda ck, cs, wartezeit: ("TOK", "SEC"))
    assert auth.main(["--consumer-key", "KEY", "--consumer-secret", "CONSUMERSECRET"]) == 0
    out, err = capsys.readouterr()
    assert out == "TUMBLR_OAUTH_TOKEN=TOK\nTUMBLR_OAUTH_TOKEN_SECRET=SEC\n"
    assert "CONSUMERSECRET" not in out + err


def test_main_fragt_nach_stderr(auth, ohne_env, monkeypatch, capsys):
    """M3: die Eingabeaufforderung darf stdout nicht verunreinigen."""
    monkeypatch.setattr(sys, "stdin", _TtyStdin("MEINKEY\n"))
    monkeypatch.setattr(auth.getpass, "getpass", lambda prompt="": "MEINSECRET")
    gesehen = {}
    monkeypatch.setattr(auth, "autorisiere",
                        lambda ck, cs, wartezeit: gesehen.update(ck=ck, cs=cs) or ("T", "S"))
    assert auth.main([]) == 0
    out, err = capsys.readouterr()
    assert gesehen == {"ck": "MEINKEY", "cs": "MEINSECRET"}
    assert out == "TUMBLR_OAUTH_TOKEN=T\nTUMBLR_OAUTH_TOKEN_SECRET=S\n"
    assert "Consumer Key:" in err and "MEINSECRET" not in out + err


def test_main_autherror_gibt_exit_1(auth, ohne_env, monkeypatch, capsys):
    def boom(ck, cs, wartezeit):
        raise auth.AuthFehler("kaputt auf deutsch")
    monkeypatch.setattr(auth, "autorisiere", boom)
    assert auth.main(["--consumer-key", "k", "--consumer-secret", "s"]) == 1
    assert "kaputt auf deutsch" in capsys.readouterr().err


def test_main_catch_all_nennt_nur_den_typnamen(auth, ohne_env, monkeypatch, capsys):
    """I2: unerwartete Fehler -> deutsche Meldung ohne Traceback, ohne Text und Argumente."""
    def boom(ck, cs, wartezeit):
        raise RuntimeError("topsecret-12345", ck, cs)
    monkeypatch.setattr(auth, "autorisiere", boom)
    assert auth.main(["--consumer-key", "KEYWERT", "--consumer-secret", "SECRETWERT"]) == 1
    out, err = capsys.readouterr()
    assert "Unerwarteter Fehler (RuntimeError)" in err and "neu starten" in err
    for geheim in ("topsecret-12345", "KEYWERT", "SECRETWERT", "Traceback"):
        assert geheim not in out + err
