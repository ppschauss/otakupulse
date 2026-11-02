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


async def test_post_ohne_tags_sendet_leeren_tags_string(httpx_mock):
    httpx_mock.add_response(status_code=201, json={"response": {"id": 1}})
    await Tumblr().post(Post(text="T", url="https://u", title="H", tags=[]))
    assert json.loads(httpx_mock.get_requests()[0].content)["tags"] == ""


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
    assert r.ok is False and "TUMBLR_OAUTH_TOKEN" in r.error
    assert httpx_mock.get_requests() == []


# --- OAuth 1.0a ---

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
