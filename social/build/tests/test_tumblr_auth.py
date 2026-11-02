"""Tests fuer das Autorisierungs-Hilfsskript social/tools/tumblr_auth.py.

Getestet werden nur die reinen Teile (URL, Callback-Parsing, Token-Antwort, Ausgabe, Signatur
der Dreisprung-Requests, Fehlertexte). Netzwerk, Browser und der Listener bleiben ungetestet:
dafuer gibt es weder Zugangsdaten noch einen Browser.

Die Erwartungswerte der Signaturen stammen unabhaengig aus oauthlib (Client mit
signature_type=BODY, gleiche Schluessel, Nonce und Zeitstempel).
"""
import importlib.util
import subprocess
import sys
from pathlib import Path

import pytest

BUILD = Path(__file__).resolve().parent.parent  # social/build bzw. /app im Testcontainer


def _skript_pfad() -> Path:
    # Lokal liegt das Skript in social/tools, im Testcontainer wird es nach /app/tools gehaengt.
    for kandidat in (BUILD / "tools", BUILD.parent / "tools"):
        p = kandidat / "tumblr_auth.py"
        if p.exists():
            return p
    pytest.fail("tumblr_auth.py nicht gefunden (manage.sh test haengt social/tools nach /app/tools)")


@pytest.fixture(scope="module")
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


def test_oauth1_ohne_token_laesst_oauth_token_weg():
    from app.oauth1 import oauth1_header
    h = oauth1_header("POST", "https://www.tumblr.com/oauth/request_token",
                      consumer_key="ck", consumer_secret="cs", token="", token_secret="",
                      nonce="n0nce", timestamp="1700000000")
    assert "oauth_token" not in h


def test_oauth1_mit_token_unveraendert():
    from app.oauth1 import oauth1_header
    h = oauth1_header("POST", "https://x.example/", consumer_key="ck", consumer_secret="cs",
                      token="tok", token_secret="ts", nonce="n", timestamp="1")
    assert 'oauth_token="tok"' in h


# --- Dreisprung: signierte Form-Requests ---

def test_request_token_signatur_gegen_oauthlib(auth):
    kopf, body = auth.build_signed_post(
        auth.REQUEST_TOKEN_URL, consumer_key="ck", consumer_secret="cs", token="",
        token_secret="", form={"oauth_callback": auth.CALLBACK_URL},
        nonce="n0nce", timestamp="1700000000",
    )
    assert 'oauth_signature="SlAGuPWvqwj373w7G1VFc5HE0RQ%3D"' in kopf
    assert "oauth_token" not in kopf
    assert body == b"oauth_callback=http%3A%2F%2Flocalhost%3A8808%2Fcallback"


def test_access_token_signatur_gegen_oauthlib(auth):
    kopf, body = auth.build_signed_post(
        auth.ACCESS_TOKEN_URL, consumer_key="ck", consumer_secret="cs", token="rtok",
        token_secret="rsec", form={"oauth_verifier": "ver1"},
        nonce="n0nce", timestamp="1700000000",
    )
    assert 'oauth_signature="q3txechXeAmSN5hYzsJmKpkF500%3D"' in kopf
    assert 'oauth_token="rtok"' in kopf
    assert body == b"oauth_verifier=ver1"


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
    ziel = "/callback?oauth_token=rtok&oauth_verifier=ver1"
    assert auth.parse_callback(ziel, "rtok") == "ver1"


def test_callback_tumblr_haengt_fragment_an(auth):
    """Tumblr haengt an OAuth1-Weiterleitungen gern `#_=_` an; der Server sieht es nie, ein
    verirrtes Fragment im Ziel darf das Parsen aber nicht stoeren."""
    ziel = "/callback?oauth_token=rtok&oauth_verifier=ver1#_=_"
    assert auth.parse_callback(ziel, "rtok") == "ver1"


def test_anderer_pfad_wird_ignoriert(auth):
    assert auth.parse_callback("/favicon.ico", "rtok") is None
    assert auth.parse_callback("/", "rtok") is None
    assert auth.parse_callback("/callback/extra?oauth_verifier=x&oauth_token=rtok", "rtok") is None


def test_callback_ohne_verifier_ist_fehler(auth):
    with pytest.raises(auth.AuthFehler) as e:
        auth.parse_callback("/callback?oauth_token=rtok", "rtok")
    assert "oauth_verifier" in str(e.value) or "Bestätigung" in str(e.value)


def test_callback_ohne_query_ist_fehler(auth):
    with pytest.raises(auth.AuthFehler):
        auth.parse_callback("/callback", "rtok")


def test_callback_mit_fremdem_token_ist_fehler(auth):
    """Schutz vor einem untergeschobenen Callback (Token gehoert nicht zu dieser Sitzung)."""
    with pytest.raises(auth.AuthFehler) as e:
        auth.parse_callback("/callback?oauth_token=fremd&oauth_verifier=v", "rtok")
    assert "fremd" not in str(e.value)  # kein Token in Fehlermeldungen


def test_callback_abgelehnt_ist_eigene_meldung(auth):
    with pytest.raises(auth.AuthFehler) as e:
        auth.parse_callback("/callback?denied=rtok", "rtok")
    assert "abgelehnt" in str(e.value).lower()


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


def test_fehlertext_zeitversatz_bei_bekannter_abweichung(auth):
    t = auth.erklaere_http_fehler(
        401, "", schritt="request_token",
        date_header="Mon, 02 Nov 2026 12:00:00 GMT", jetzt=1793620800 + 900,
    )
    assert "15 Minuten" in t


def test_fehlertext_oauth_problem_wird_uebersetzt(auth):
    t = auth.erklaere_http_fehler(401, "oauth_problem=timestamp_refused", schritt="request_token")
    assert "Uhr" in t


def test_fehlertext_signatur_ungueltig(auth):
    t = auth.erklaere_http_fehler(401, "oauth_problem=signature_invalid", schritt="request_token")
    assert "Secret" in t


def test_fehlertext_unbekannte_status(auth):
    t = auth.erklaere_http_fehler(503, "<html>boese</html>", schritt="access_token")
    assert "503" in t and "access_token" in t
    assert "boese" not in t  # Antworttext nicht ungeprueft durchreichen


def test_fehlertext_enthaelt_nie_die_zugangsdaten(auth):
    t = auth.erklaere_http_fehler(401, "oauth_problem=signature_invalid&consumer=cs-geheim",
                                  schritt="request_token")
    assert "cs-geheim" not in t


def test_zeitversatz_berechnung(auth):
    # 02 Nov 2026 12:00:00 GMT = 1793620800
    assert auth.zeitversatz_sekunden("Mon, 02 Nov 2026 12:00:00 GMT", 1793620800) == 0
    assert auth.zeitversatz_sekunden("Mon, 02 Nov 2026 12:00:00 GMT", 1793620800 + 300) == 300
    assert auth.zeitversatz_sekunden("Mon, 02 Nov 2026 12:00:00 GMT", 1793620800 - 60) == -60


def test_zeitversatz_unlesbar_ist_none(auth):
    assert auth.zeitversatz_sekunden("", 0) is None
    assert auth.zeitversatz_sekunden(None, 0) is None
    assert auth.zeitversatz_sekunden("kein Datum", 0) is None
