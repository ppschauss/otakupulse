"""Tumblr-Adapter: NPF-Aufbau, Tag-Bereinigung, OAuth-1.0a-Signatur, Fehlerpfade.

Alle HTTP-Aufrufe laufen gegen pytest-httpx; es gibt keinen echten Tumblr-Zugriff.
"""
import json

import httpx
import pytest

from app import compose, config
from app.channels import registry
from app.channels.base import Post
from app.channels.tumblr import Tumblr, build_npf_content, oauth1_header

POST_URL = "https://api.tumblr.com/v2/blog/blog.example/posts"


@pytest.fixture(autouse=True)
def tumblr_config(monkeypatch):
    """Platzhalter-Zugangsdaten, nie echte Werte."""
    monkeypatch.setattr(config, "TUMBLR_BLOG_IDENTIFIER", "blog.example")
    monkeypatch.setattr(config, "TUMBLR_CONSUMER_KEY", "ck")
    monkeypatch.setattr(config, "TUMBLR_CONSUMER_SECRET", "cs")
    monkeypatch.setattr(config, "TUMBLR_OAUTH_TOKEN", "tok")
    monkeypatch.setattr(config, "TUMBLR_OAUTH_TOKEN_SECRET", "toksec")


# --- NPF-Aufbau ---

def test_npf_blockreihenfolge_mit_bild():
    p = Post(text="Taikis Doppel steht.", url="https://otakupulse.de/news/x",
             title="Blue Box S2 Folge 4", image_url="https://cdn/x.jpg",
             tags=["anime", "otakupulse"], category="simulcast")
    c = build_npf_content(p)
    assert [b["type"] for b in c] == ["image", "text", "text", "text", "text"]
    assert c[0]["media"][0]["url"] == "https://cdn/x.jpg"
    assert c[1]["text"] == "Simulcast"
    assert "subtype" not in c[1]  # Kicker muss ein normaler Absatz sein (Theme: p:first-of-type)
    assert c[2]["subtype"] == "heading2"
    assert c[2]["text"] == "Blue Box S2 Folge 4"
    assert c[3]["text"] == "Taikis Doppel steht."
    assert p.url in c[4]["text"]


def test_npf_ohne_bild_laesst_bildblock_weg():
    p = Post(text="T", url="https://otakupulse.de/news/x", title="H",
             image_url=None, category="news")
    c = build_npf_content(p)
    assert [b["type"] for b in c] == ["text", "text", "text", "text"]
    assert c[0]["text"] == "News"


def test_npf_ohne_kategorie_laesst_kicker_weg():
    p = Post(text="T", url="https://u", title="H", image_url=None, category=None)
    c = build_npf_content(p)
    assert [b["type"] for b in c] == ["text", "text", "text"]
    assert c[0]["subtype"] == "heading2"


def test_npf_leere_teile_entfallen():
    p = Post(text="  ", url="https://u", title=None, image_url="", category="  ")
    c = build_npf_content(p)
    assert [b["text"] for b in c] == ["https://u"]


def test_npf_unbekannte_kategorie_wird_gross_geschrieben():
    c = build_npf_content(Post(text="T", url="https://u", title="H", category="guide"))
    assert c[0]["text"] == "Guide"


def test_npf_link_zeile_traegt_link_format():
    c = build_npf_content(Post(text="T", url="https://u/x", title="H"))
    assert c[-1]["formatting"] == [{"type": "link", "start": 0, "end": len("https://u/x"),
                                    "url": "https://u/x"}]


# --- Senden ---

async def test_post_sendet_tags_kommasepariert(httpx_mock):
    httpx_mock.add_response(status_code=201, json={"response": {"id": 42}})
    await Tumblr().post(Post(text="T", url="https://u", title="H",
                             tags=["anime", "urban fantasy"]))
    body = json.loads(httpx_mock.get_requests()[0].content)
    assert body["tags"] == "anime,urban fantasy"
    assert body["state"] == "published"
    assert body["content"][-1]["text"] == "https://u"


async def test_post_sendet_an_blog_route_mit_oauth_header(httpx_mock):
    httpx_mock.add_response(status_code=201, json={"response": {"id": "42"}})
    r = await Tumblr().post(Post(text="T", url="https://u", title="H"))
    req = httpx_mock.get_requests()[0]
    assert str(req.url) == POST_URL and req.method == "POST"
    assert req.headers["authorization"].startswith("OAuth ")
    assert 'oauth_signature_method="HMAC-SHA1"' in req.headers["authorization"]
    assert req.headers["content-type"].startswith("application/json")
    assert r.ok is True and r.external_id == "42"


async def test_tags_mit_komma_werden_vor_dem_senden_bereinigt(httpx_mock):
    httpx_mock.add_response(status_code=201, json={"response": {"id": 1}})
    await Tumblr().post(Post(text="T", url="https://u", title="H",
                             tags=["Fate, Zero", "ok", "a,b,c"]))
    body = json.loads(httpx_mock.get_requests()[0].content)
    # Tumblr trennt an Kommas: genau diese drei Tags duerfen ankommen, keine Splitter
    assert body["tags"] == "fate zero,ok,a b c"
    assert body["tags"].split(",") == ["fate zero", "ok", "a b c"]


async def test_tags_mit_nicht_strings_stuerzen_nicht_ab(httpx_mock):
    httpx_mock.add_response(status_code=201, json={"response": {"id": 1}})
    r = await Tumblr().post(Post(text="T", url="https://u", title="H",
                                 tags=["anime", None, 7, ["x"], {"a": 1}, "", "  ", "ok"]))
    body = json.loads(httpx_mock.get_requests()[0].content)
    assert r.ok is True
    assert body["tags"] == "anime,ok"


async def test_post_gibt_retry_after_bei_429(httpx_mock):
    httpx_mock.add_response(status_code=429, headers={"Retry-After": "900"})
    r = await Tumblr().post(Post(text="T", url="https://u", title="H"))
    assert r.ok is False and r.retry_after == 900


async def test_429_ohne_nutzbaren_header_gibt_kein_retry_after(httpx_mock):
    httpx_mock.add_response(status_code=429, headers={"Retry-After": "bald"})
    r = await Tumblr().post(Post(text="T", url="https://u", title="H"))
    assert r.ok is False and r.retry_after is None and "429" in r.error


async def test_http_fehler_wird_zum_postresult(httpx_mock):
    httpx_mock.add_response(status_code=401, text="Unauthorized")
    r = await Tumblr().post(Post(text="T", url="https://u", title="H"))
    assert r.ok is False and "401" in r.error


async def test_netzwerkfehler_wird_zum_postresult(httpx_mock):
    httpx_mock.add_exception(httpx.ConnectError("kein Netz"))
    r = await Tumblr().post(Post(text="T", url="https://u", title="H"))
    assert r.ok is False and "kein Netz" in r.error


async def test_fehlende_zugangsdaten_senden_nichts(monkeypatch, httpx_mock):
    monkeypatch.setattr(config, "TUMBLR_OAUTH_TOKEN", "")
    r = await Tumblr().post(Post(text="T", url="https://u", title="H"))
    assert r.ok is False and "TUMBLR_OAUTH_TOKEN" in r.error and r.outcome_unknown is False
    assert httpx_mock.get_requests() == []


# --- Fix-Durchlauf 1: Doppelpost-Risiken ---

@pytest.mark.parametrize("antwort", [
    {"json": []}, {"json": {"response": [1]}}, {"json": {"response": "x"}},
    {"json": {"response": None}}, {"json": "text"}, {"text": "<html>kein JSON</html>"},
])
async def test_201_mit_unlesbarem_body_bleibt_erfolg(httpx_mock, antwort):
    """Der Post ist draussen: nie als Fehlschlag melden, sonst postet der Poster doppelt."""
    httpx_mock.add_response(status_code=201, **antwort)
    r = await Tumblr().post(Post(text="T", url="https://u", title="H"))
    assert r.ok is True and r.external_id is None and r.outcome_unknown is False


@pytest.mark.parametrize("exc", [
    httpx.ReadTimeout(""), httpx.WriteTimeout("zu"), httpx.PoolTimeout("voll"),
    httpx.RemoteProtocolError("Server disconnected without sending a response."),
    httpx.ReadError("kaputt"), httpx.WriteError("kaputt"), httpx.CloseError("kaputt"),
    httpx.DecodingError("kaputt komprimiert"), httpx.ProxyError("Proxy"),
    RuntimeError("voellig unerwartet"),
])
async def test_fehler_nach_dem_absenden_sind_ausgang_unbekannt(httpx_mock, exc):
    """Umgekehrte Regel: alles, was nicht sicher VOR dem Senden scheitert, ist unbekannt."""
    httpx_mock.add_exception(exc)
    r = await Tumblr().post(Post(text="T", url="https://u", title="H"))
    assert r.ok is False and r.outcome_unknown is True
    assert type(exc).__name__ in r.error  # auch bei leerem Text steht die Art des Fehlers drin


@pytest.mark.parametrize("status", [500, 502, 503, 504])
async def test_5xx_ist_ausgang_unbekannt(httpx_mock, status):
    httpx_mock.add_response(status_code=status, text="Serverfehler")
    r = await Tumblr().post(Post(text="T", url="https://u", title="H"))
    assert r.ok is False and r.outcome_unknown is True and str(status) in r.error


@pytest.mark.parametrize("exc", [
    httpx.ConnectError("kein Netz"), httpx.ConnectTimeout(""),
    httpx.UnsupportedProtocol("kein http"), httpx.LocalProtocolError("lokal"),
    httpx.InvalidURL("kaputt"),
])
async def test_fehler_vor_dem_absenden_sind_sicher_wiederholbar(httpx_mock, exc):
    httpx_mock.add_exception(exc)
    r = await Tumblr().post(Post(text="T", url="https://u", title="H"))
    assert r.ok is False and r.outcome_unknown is False
    assert type(exc).__name__ in r.error


@pytest.mark.parametrize("status", [400, 401, 403, 404])
async def test_4xx_ist_endgueltiger_fehlschlag(httpx_mock, status):
    httpx_mock.add_response(status_code=status, text="nein")
    r = await Tumblr().post(Post(text="T", url="https://u", title="H"))
    assert r.ok is False and r.outcome_unknown is False and str(status) in r.error


# --- I2: Erfolg ist ausschliesslich 201 ---

@pytest.mark.parametrize("status", [200, 202, 204])
async def test_2xx_ohne_201_ist_kein_erfolg(httpx_mock, status):
    """raise_for_status schweigt bei 200 — ohne 201-Pruefung waere der Entwurf 'posted'."""
    httpx_mock.add_response(status_code=status, json={"response": {"id": 42}})
    r = await Tumblr().post(Post(text="T", url="https://u", title="H"))
    assert r.ok is False and r.outcome_unknown is True
    assert str(status) in r.error and "201" in r.error


@pytest.mark.parametrize("status", [301, 302, 307, 308])
async def test_3xx_ist_kein_erfolg(httpx_mock, status):
    """httpx folgt von sich aus keiner Weiterleitung: die 3xx-Antwort kommt hier an."""
    httpx_mock.add_response(status_code=status, headers={"Location": "https://anderswo"})
    r = await Tumblr().post(Post(text="T", url="https://u", title="H"))
    assert r.ok is False and r.outcome_unknown is True
    assert str(status) in r.error
    assert len(httpx_mock.get_requests()) == 1  # keiner Weiterleitung gefolgt


async def test_nur_201_ist_erfolg(httpx_mock):
    httpx_mock.add_response(status_code=201, json={"response": {"id": "7"}})
    r = await Tumblr().post(Post(text="T", url="https://u", title="H"))
    assert r.ok is True and r.external_id == "7"


@pytest.mark.parametrize("roh,erwartet", [
    ("999999999999", 86400), ("86401", 86400), ("900", 900), ("-5", 1), ("1", 1),
])
async def test_retry_after_wird_geklemmt(httpx_mock, roh, erwartet):
    httpx_mock.add_response(status_code=429, headers={"Retry-After": roh})
    r = await Tumblr().post(Post(text="T", url="https://u", title="H"))
    assert r.retry_after == erwartet


async def test_429_ganz_ohne_header(httpx_mock):
    httpx_mock.add_response(status_code=429)
    r = await Tumblr().post(Post(text="T", url="https://u", title="H"))
    assert r.ok is False and r.retry_after is None and r.outcome_unknown is False


async def test_leere_tag_liste_laesst_tags_schluessel_weg(httpx_mock):
    httpx_mock.add_response(status_code=201, json={"response": {"id": 1}})
    await Tumblr().post(Post(text="T", url="https://u", title="H", tags=[]))
    assert "tags" not in json.loads(httpx_mock.get_requests()[0].content)


async def test_tags_die_nach_bereinigung_leer_sind_lassen_den_schluessel_weg(httpx_mock):
    httpx_mock.add_response(status_code=201, json={"response": {"id": 1}})
    await Tumblr().post(Post(text="T", url="https://u", title="H", tags=[",", None, " "]))
    assert "tags" not in json.loads(httpx_mock.get_requests()[0].content)


async def test_post_wirft_nie_auch_wenn_der_aufbau_scheitert(monkeypatch, httpx_mock):
    from app.channels import tumblr as modul

    def kaputt(post):
        raise RuntimeError("Aufbau kaputt")

    monkeypatch.setattr(modul, "build_npf_content", kaputt)
    r = await Tumblr().post(Post(text="T", url="https://u", title="H"))
    assert r.ok is False and "RuntimeError" in r.error and "Aufbau kaputt" in r.error
    assert r.outcome_unknown is False  # scheitert vor dem Senden: sicher wiederholbar
    assert httpx_mock.get_requests() == []


# --- OAuth 1.0a ---

def test_oauth1_signatur_in_produktionsform():
    """So senden wir wirklich: POST, api.tumblr.com, keine Query, keine Formular-Parameter.

    Erwartung unabhängig mit oauthlib berechnet (gleiche Schlüssel, Nonce, Zeitstempel).
    """
    h = oauth1_header(
        "POST", "https://api.tumblr.com/v2/blog/blog.example/posts",
        consumer_key="ck", consumer_secret="cs", token="tok", token_secret="toksec",
        nonce="abc123nonce", timestamp="1700000000",
    )
    assert 'oauth_signature="cERw8uW9itBuyah%2F4N0I9keywmY%3D"' in h

def test_oauth1_signatur_gegen_bekannten_testvektor():
    """Beispiel aus der Twitter-OAuth-Doku (HMAC-SHA1, Query + Formular-Parameter)."""
    h = oauth1_header(
        "POST", "https://api.twitter.com/1.1/statuses/update.json?include_entities=true",
        consumer_key="xvz1evFS4wEEPTGEFPHBog",
        consumer_secret="kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
        token="370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
        token_secret="LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
        extra_params={"status": "Hello Ladies + Gentlemen, a signed OAuth request!"},
        nonce="kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", timestamp="1318622958",
    )
    # Erwartung: Signatur aus dem Twitter-Doku-Abschnitt "Creating a signature"; unabhängig
    # mit oauthlib nachgerechnet (gleiches Ergebnis).
    assert 'oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"' in h
    assert 'oauth_nonce="kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg"' in h
    assert "status" not in h  # Formular-Parameter gehoeren nur in die Signatur, nicht in den Header


# --- Verdrahtung ---

def test_registry_kennt_tumblr():
    assert "tumblr" in registry.known_channel_names()
    assert isinstance(registry.get("tumblr"), Tumblr)


def test_zeichenlimit_in_compose_passt_zum_adapter():
    assert compose.CHAR_LIMIT["tumblr"] == Tumblr.char_limit == 1000
