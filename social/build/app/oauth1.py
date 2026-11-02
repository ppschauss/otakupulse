"""OAuth 1.0a (HMAC-SHA1), nur Standardbibliothek.

Bewusst ohne Import aus dem Rest von `app` (keine Config, kein httpx): diese Datei wird vom
Tumblr-Adapter UND vom Autorisierungs-Hilfsskript `social/tools/tumblr_auth.py` benutzt, das auf
dem Rechner des Betreibers laeuft, nicht im Container. Es gibt genau eine Implementierung der
Signatur.
"""
import base64
import hashlib
import hmac
import secrets
import time
from urllib.parse import parse_qsl, quote, urlsplit


def _pct(wert) -> str:
    """Prozent-Kodierung nach RFC 3986, wie OAuth 1.0a sie verlangt."""
    return quote(str(wert), safe="~")


def oauth1_header(
    method: str, url: str, *, consumer_key: str, consumer_secret: str, token: str = "",
    token_secret: str = "", extra_params: dict | None = None,
    protocol_params: dict | None = None, nonce: str | None = None, timestamp: str | None = None,
) -> str:
    """OAuth-1.0a-Authorization-Header (HMAC-SHA1).

    `extra_params` sind formularkodierte Body-Parameter, die in die Signatur gehoeren (ohne in den
    Header zu wandern). Bei einem JSON-Body (Tumblr-NPF) bleibt es leer: dann zaehlen nur Query-
    und oauth_*-Parameter.

    `protocol_params` sind zusaetzliche oauth_*-Parameter (beim Dreisprung der Autorisierung
    `oauth_callback` bzw. `oauth_verifier`): sie fliessen in die Signatur UND stehen im Header, der
    Body bleibt leer. Die Signatur ist dieselbe wie bei `extra_params`.

    Ein leeres `token` heisst "noch kein Token" (erster Schritt des Dreisprungs): dann entfaellt
    `oauth_token` in Signatur und Header ganz.
    """
    oauth = {
        "oauth_consumer_key": consumer_key,
        "oauth_nonce": nonce or secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": timestamp or str(int(time.time())),
        "oauth_version": "1.0",
    }
    if token:
        oauth["oauth_token"] = token
    oauth.update(protocol_params or {})
    teile = urlsplit(url)
    basis_url = f"{teile.scheme.lower()}://{teile.netloc.lower()}{teile.path}"
    alle = list(oauth.items()) + parse_qsl(teile.query, keep_blank_values=True)
    alle += list((extra_params or {}).items())
    norm = sorted((_pct(k), _pct(v)) for k, v in alle)
    param_str = "&".join(f"{k}={v}" for k, v in norm)
    basis = "&".join([method.upper(), _pct(basis_url), _pct(param_str)])
    schluessel = f"{_pct(consumer_secret)}&{_pct(token_secret)}".encode()
    sig = base64.b64encode(hmac.new(schluessel, basis.encode(), hashlib.sha1).digest()).decode()
    oauth["oauth_signature"] = sig
    return "OAuth " + ", ".join(f'{k}="{_pct(v)}"' for k, v in sorted(oauth.items()))
