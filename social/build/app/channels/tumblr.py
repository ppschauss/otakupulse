"""Tumblr-Adapter.

POST https://api.tumblr.com/v2/blog/{blog-identifier}/posts im Neuen Post Format (NPF):
`content` ist eine Block-Liste, dazu `tags` (Komma-String) und `state: "published"`.
Erfolg ist 201 Created mit {"response": {"id": "<string>"}}.

Blockreihenfolge (Teile ohne Daten entfallen):
  1. Bild   -- MUSS der erste Block bleiben: das Theme holt es ueber
               `.op-body > figure:first-child` nach links.
  2. Kicker -- Kategorie als schlichter Absatz (kein subtype); das Theme macht aus dem ersten
               <p> die Kategorie-Pille (`.op-body > p:first-of-type`).
  3. Schlagzeile (heading2)
  4. Fliesstext
  5. Link-Zeile

AUTHENTIFIZIERUNG (am 2026-11-02 gegen github.com/tumblr/docs, api.md, geprueft)
  Belegt:
  - Die Post-Route fuehrt in der Methodentabelle die Auth-Stufe "OAuth". Die Doku definiert
    "OAuth" als "signed request that meets the OAuth 1.0a Protocol", nur HMAC-SHA1.
  - OAuth2 existiert (Token-Endpunkt https://api.tumblr.com/v2/oauth2/token, Bearer-Header,
    Authorization-Code-, Client-Credentials- und Refresh-Token-Grant, Scopes basic/write/
    offline_access), aber die Doku sagt NICHT, dass die Post-Route einen Bearer-Token akzeptiert.
  - Dort steht auch nichts zur Lebensdauer des Refresh-Tokens und nichts dazu, ob er bei jedem
    Refresh rotiert. Ein rotierender Token braeuchte persistenten Speicher im Dauerlaeufer,
    sonst steht der Kanal nach Tagen still.
  Gewaehlt: OAuth 1.0a (HMAC-SHA1) mit festem Token + Token-Secret aus der Umgebung. Das ist
  das einzige Verfahren, das die Doku fuer diese Route ausdruecklich nennt, und es braucht
  keine Erneuerung zur Laufzeit. Die Signatur ist hier selbst gebaut (kein Zusatzpaket) und
  gegen einen bekannten Testvektor geprueft.
  OFFEN (nicht ohne echte Zugangsdaten pruefbar):
  - Ob der Live-Server die Signatur tatsaechlich akzeptiert (JSON-Body, daher fliesst der
    Body nicht in die Signatur ein, nur die oauth_*-Parameter).
  - Ob die OAuth1-Access-Tokens ablaufen. Die Doku schweigt; kommt ein 401, ist das hier die
    erste Stelle zum Nachsehen.
  - Ob ein 429 immer einen Retry-After-Header traegt; ohne ihn bleibt retry_after leer und der
    Breaker nimmt seinen Standard.
  Das gesamte Verfahren steckt in `Tumblr._auth_headers()` (nutzt `oauth1_header`). Wechselt
  man auf OAuth2, aendert sich nur diese eine Methode.

Keine eigene Retry-Logik: Wiederholung, Breaker und Versuchszaehler liegen in poster.py.
Der Adapter markiert aber Ausgaenge, die man nicht wiederholen darf: Tumblr hat keinen
Idempotency-Key, nach ReadTimeout/WriteTimeout/PoolTimeout und nach 502/503/504 kann der Post
trotzdem veroeffentlicht sein. Dann steht `PostResult.outcome_unknown=True`, und poster.py gibt
sofort auf und meldet es. ConnectError/ConnectTimeout bleiben normal wiederholbar.
"""
import base64
import hashlib
import hmac
import logging
import secrets
import time
from urllib.parse import parse_qsl, quote, urlsplit

import httpx

from .. import config
from ..tagging import sanitize_tag
from .base import Channel, Post, PostResult

log = logging.getLogger(__name__)

API_BASE = "https://api.tumblr.com/v2"

# Anzeigename der Kategorie als Kicker; unbekannte Kategorien werden gross geschrieben.
_KATEGORIE_ANZEIGE = {
    "news": "News",
    "simulcast": "Simulcast",
}


def _pct(wert) -> str:
    """Prozent-Kodierung nach RFC 3986, wie OAuth 1.0a sie verlangt."""
    return quote(str(wert), safe="~")


def oauth1_header(
    method: str, url: str, *, consumer_key: str, consumer_secret: str, token: str,
    token_secret: str, extra_params: dict | None = None, nonce: str | None = None,
    timestamp: str | None = None,
) -> str:
    """OAuth-1.0a-Authorization-Header (HMAC-SHA1).

    `extra_params` sind formularkodierte Body-Parameter, die in die Signatur gehoeren. Bei einem
    JSON-Body (Tumblr-NPF) bleibt es leer: dann zaehlen nur Query- und oauth_*-Parameter.
    """
    oauth = {
        "oauth_consumer_key": consumer_key,
        "oauth_nonce": nonce or secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": timestamp or str(int(time.time())),
        "oauth_token": token,
        "oauth_version": "1.0",
    }
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


def _kicker(category) -> str | None:
    if not isinstance(category, str) or not category.strip():
        return None
    roh = category.strip()
    return _KATEGORIE_ANZEIGE.get(roh.lower(), roh.capitalize())


def _sauber(wert) -> str | None:
    """Nicht-leerer, getrimmter String oder None (auch bei Nicht-Strings)."""
    return wert.strip() if isinstance(wert, str) and wert.strip() else None


def build_npf_content(post: Post) -> list[dict]:
    """NPF-Blockliste in fester Reihenfolge; Teile ohne Daten entfallen."""
    bloecke: list[dict] = []
    titel = _sauber(post.title)

    bild = _sauber(post.image_url)
    if bild:
        block = {"type": "image", "media": [{"url": bild}]}
        if titel:
            block["alt_text"] = titel
        bloecke.append(block)

    kicker = _kicker(post.category)
    if kicker:
        bloecke.append({"type": "text", "text": kicker})

    if titel:
        bloecke.append({"type": "text", "subtype": "heading2", "text": titel})

    text = _sauber(post.text)
    if text:
        bloecke.append({"type": "text", "text": text})

    link = _sauber(post.url)
    if link:
        bloecke.append({
            "type": "text", "text": link,
            "formatting": [{"type": "link", "start": 0, "end": len(link), "url": link}],
        })
    return bloecke


def _tags_param(tags) -> str:
    """Komma-String fuer Tumblr. Jeder Tag geht durch sanitize_tag (ein Komma wuerde ihn
    zerreissen); Nicht-Strings und leere Reste werden verworfen statt zu crashen."""
    if not isinstance(tags, (list, tuple)):
        return ""
    sauber = (sanitize_tag(t) for t in tags if isinstance(t, str))
    return ",".join(t for t in sauber if t)


# Statuscodes und Fehler, nach denen unklar bleibt, ob der Post veröffentlicht wurde.
_AUSGANG_UNBEKANNT_STATUS = frozenset({502, 503, 504})
_AUSGANG_UNBEKANNT_FEHLER = (httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout)

_RETRY_AFTER_MAX = 86400  # ein Tag; größere Werte würden im Breaker überlaufen


def _retry_after(roh) -> int | None:
    """Retry-After in Sekunden, auf 1..86400 geklemmt; fehlend oder unlesbar: None."""
    try:
        sek = int(roh or "0")
    except (ValueError, TypeError):
        return None  # Datumsformat o. ä.: lieber keine Angabe als ein Absturz
    if sek == 0:
        return None
    return max(1, min(sek, _RETRY_AFTER_MAX))


def _post_id(r: httpx.Response) -> str | None:
    """ID des neuen Posts, falls die Antwort sie hergibt; jede andere Form ergibt None."""
    try:
        daten = r.json()
    except ValueError:
        return None
    antwort = daten.get("response") if isinstance(daten, dict) else None
    ext = antwort.get("id") if isinstance(antwort, dict) else None
    return str(ext) if ext is not None else None


def _fehlertext(e: Exception) -> str:
    """Art + Text: ein ReadTimeout hat oft einen leeren Text, dann stünde nur "unbekannt" in der DB."""
    return f"{type(e).__name__}: {e}"


class Tumblr(Channel):
    name = "tumblr"
    char_limit = 1000  # gleicher Wert wie compose.CHAR_LIMIT["tumblr"]

    def __init__(self):
        self._blog = config.TUMBLR_BLOG_IDENTIFIER
        self._consumer_key = config.TUMBLR_CONSUMER_KEY
        self._consumer_secret = config.TUMBLR_CONSUMER_SECRET
        self._token = config.TUMBLR_OAUTH_TOKEN
        self._token_secret = config.TUMBLR_OAUTH_TOKEN_SECRET

    def _fehlende_config(self) -> list[str]:
        werte = {
            "TUMBLR_BLOG_IDENTIFIER": self._blog,
            "TUMBLR_CONSUMER_KEY": self._consumer_key,
            "TUMBLR_CONSUMER_SECRET": self._consumer_secret,
            "TUMBLR_OAUTH_TOKEN": self._token,
            "TUMBLR_OAUTH_TOKEN_SECRET": self._token_secret,
        }
        return [k for k, v in werte.items() if not v]

    def _auth_headers(self, method: str, url: str) -> dict[str, str]:
        """EINZIGE Stelle, die das Auth-Verfahren kennt (derzeit OAuth 1.0a, siehe Modulkopf)."""
        return {"Authorization": oauth1_header(
            method, url,
            consumer_key=self._consumer_key, consumer_secret=self._consumer_secret,
            token=self._token, token_secret=self._token_secret,
        )}

    async def post(self, post: Post) -> PostResult:
        fehlt = self._fehlende_config()
        if fehlt:
            return PostResult(ok=False, error="Tumblr-Konfiguration unvollständig: " + ", ".join(fehlt))
        url = f"{API_BASE}/blog/{self._blog}/posts"
        try:
            # Der Aufbau steht im try: der Poster verlässt sich darauf, dass post() nie wirft.
            body = {"content": build_npf_content(post), "state": "published"}
            tags = _tags_param(post.tags)
            if tags:
                body["tags"] = tags  # leere Liste: Schlüssel weglassen statt "" zu senden
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(url, headers=self._auth_headers("POST", url), json=body)
                if r.status_code == 429:
                    return PostResult(ok=False, error="429 rate limited",
                                      retry_after=_retry_after(r.headers.get("retry-after")))
                r.raise_for_status()
                # Ein 201 ist ein Erfolg, auch wenn die ID nicht lesbar ist; sonst würde der
                # Poster einen schon veröffentlichten Beitrag erneut senden.
                return PostResult(ok=True, external_id=_post_id(r))
        except httpx.HTTPStatusError as e:
            code = e.response.status_code
            return PostResult(ok=False, error=f"HTTP {code}: {e.response.text[:200]}",
                              outcome_unknown=code in _AUSGANG_UNBEKANNT_STATUS)
        except _AUSGANG_UNBEKANNT_FEHLER as e:
            # Die Anfrage kann schon beim Server angekommen sein; Tumblr hat keinen Idempotency-Key.
            return PostResult(ok=False, error=_fehlertext(e), outcome_unknown=True)
        except Exception as e:  # noqa: BLE001
            # Dazu gehören ConnectError/ConnectTimeout: da ging nichts raus, Wiederholung ist sicher.
            return PostResult(ok=False, error=_fehlertext(e))
