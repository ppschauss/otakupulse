"""Post-Lauf: freigegebene Entwürfe rausschicken, Breaker + Retry-Limit beachten.

Kein blindes Feuern: guard(channel) fragt den Breaker, bei Fehler wird zurückgestellt,
nach 3 Versuchen 'failed' + Telegram-Meldung. Trockene Kanäle (DRY_RUN global oder
DRY_RUN_CHANNELS je Kanal) kurzschließen den echten Post. Tumblr: höchstens ein Entwurf je
Durchlauf, und nur bis TUMBLR_MAX_POSTS_PER_DAY; darüber verfällt der Entwurf (eine
Telegram-Meldung je Durchlauf). Erfolgreiche Tumblr-Posts werden nicht einzeln gemeldet,
sondern in der Tagesmeldung (batch.tumblr_summary). Entwürfe für Kanäle, die nicht in CHANNELS_ENABLED stehen,
bleiben unangetastet liegen.

Zwei Schranken gegen Doppelposts, beide VOR dem Senden:
- models.already_posted: steht der Beitrag für diesen Kanal schon im posted_log, wird nicht
  gesendet, der Entwurf gilt als 'posted'. Gilt für alle Kanäle.
- Tumblr-Vormerkung: Tumblr hat keinen Idempotency-Key und keine Einzelfreigabe. Vor ch.post()
  wird die Absicht als "Ausgang unbekannt" festgeschrieben, damit ein Abbruch im Sendefenster
  (Redeploy, SIGTERM, OOM) keinen 'approved'-Entwurf hinterlässt, den der nächste Durchlauf
  zwei Minuten später erneut sendet. Erfolg überschreibt das per mark_posted.
"""
import json
import logging
import time

from . import config, models, breaker, runtime, settings, texts_de as T
from .channels import registry
from .channels.base import Post

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 3
TUMBLR = "tumblr"

# Drossel für die Warnung "Kanal nicht in CHANNELS_ENABLED": der Post-Lauf kommt alle 2 Minuten,
# unbegrenztes Wiederholen würde das Log zumüllen. Gemeldet wird bei geänderter Anzahl, sonst
# höchstens stündlich. channel -> (Anzahl, Zeitpunkt der letzten Meldung).
_SKIP_LOG_INTERVALL = 3600.0
_skip_gemeldet: dict[str, tuple[int, float]] = {}


def _skip_melden(channel: str, n: int) -> bool:
    """True, wenn die Liegenbleib-Warnung für diesen Kanal jetzt (wieder) ins Log gehört."""
    letzte = _skip_gemeldet.get(channel)
    jetzt = time.monotonic()
    if letzte is not None and letzte[0] == n and jetzt - letzte[1] < _SKIP_LOG_INTERVALL:
        return False
    _skip_gemeldet[channel] = (n, jetzt)
    return True


def _pruefe_tags(roh, channel: str) -> list[str]:
    """Tags streng prüfen: Liste aus nicht-leeren Strings, für Tumblr zusätzlich nicht leer.

    isinstance(..., list) allein reicht nicht: tumblr._tags_param verwirft Nicht-Strings und
    leere Reste still, und der Post ginge dann ohne Tags raus — genau das, was hier auffallen soll.
    """
    if not isinstance(roh, list):
        raise ValueError("tags ist keine Liste")
    if not all(isinstance(t, str) and t.strip() for t in roh):
        raise ValueError("tags enthält leere Einträge oder Nicht-Strings")
    if channel == TUMBLR and not roh:
        raise ValueError("tags ist leer (ein Tumblr-Post ohne Tags ist keiner)")
    return roh


async def run_post_pass() -> None:
    if await settings.is_paused():
        return
    drafts = await models.approved_drafts()
    uebersprungen: dict[str, int] = {}
    limit_verworfen = 0  # wegen Tageslimit verfallene Tumblr-Entwürfe dieses Durchlaufs
    tumblr_drin = False  # höchstens ein Tumblr-Entwurf je Durchlauf (Abstand durch den 2-min-Takt)
    for d in drafts:
        channel = d["channel"]
        if channel not in config.CHANNELS_ENABLED:
            # Weder posten noch trocken verbuchen: bleibt 'approved', falls der Kanal zurückkommt.
            uebersprungen[channel] = uebersprungen.get(channel, 0) + 1
            continue
        if await models.already_posted(channel, d["source_kind"], d["source_ref"]):
            # Der Beitrag ist auf diesem Kanal schon draußen (Zwillings-Entwurf). Nicht senden,
            # nicht den Tumblr-Platz dieses Durchlaufs und nicht das Tageslimit verbrauchen.
            await models.mark_posted_duplicate(d["id"])
            log.warning("Entwurf %s: %s/%s steht für %s schon in posted_log — nicht erneut "
                        "gesendet, Entwurf auf 'posted' gesetzt.",
                        d["id"], d["source_kind"], d["source_ref"], channel)
            continue
        if channel == TUMBLR and tumblr_drin:
            continue  # bleibt 'approved' für den nächsten Durchlauf
        if not await breaker.guard(channel):
            continue  # Kanal stillgelegt / Retry-After noch nicht abgelaufen
        if channel == TUMBLR:
            if await models.posted_today(TUMBLR) >= config.TUMBLR_MAX_POSTS_PER_DAY:
                # Verfallen statt aufschieben: eine Halde wäre schlimmer als ein verpasster Post.
                await models.expire_draft(d["id"])
                limit_verworfen += 1
                log.warning("Tumblr-Tageslimit (%d) erreicht — Entwurf %s verfällt.",
                            config.TUMBLR_MAX_POSTS_PER_DAY, d["id"])
                continue
            tumblr_drin = True

        try:
            tags = _pruefe_tags(json.loads(d["tags"] or "[]"), channel)
        except (ValueError, TypeError) as e:
            # Kaputte Tags nie still durch [] ersetzen: sonst ginge ein Tumblr-Post ohne Tags raus.
            log.exception("Entwurf %s hat unbrauchbare Tags — als gescheitert markiert.", d["id"])
            await models.record_attempt_failure(d["id"], f"Tags unbrauchbar: {e}", give_up=True)
            await _notify(f"⚠️ Entwurf für {T.CHANNEL_LABEL.get(channel, channel)} hat unbrauchbare "
                          f"Tags und wurde nicht gepostet.\n{d['url']}")
            continue

        post = Post(
            text=models.effective_body(d),
            url=d["url"],
            title=d["title"],
            image_url=d["image_url"],
            tags=tags,
            category=d["category"],
        )

        if config.is_dry(channel):
            ext = f"dry-{d['id']}"
            await models.mark_posted(d["id"], ext, channel, d["source_kind"], d["source_ref"])
            await breaker.record_ok(channel)
            await _note_posted(channel, d["url"], ext)
            continue

        ch = registry.get(channel)
        if ch is None:
            await models.record_attempt_failure(d["id"], f"Kein Adapter für {channel}", give_up=True)
            continue

        # Nur Tumblr: Absicht festschreiben, BEVOR gesendet wird (siehe Modulkopf). Bluesky und
        # Mastodon brauchen das nicht — sie haben eine manuelle Freigabe und werden nicht alle
        # 2 Minuten unbeaufsichtigt nachgefasst; ihr Verhalten bleibt unverändert.
        vorgemerkt = channel == TUMBLR
        if vorgemerkt:
            await models.record_attempt_failure(
                d["id"], f"{models.AUSGANG_UNBEKANNT}: Versand begonnen", give_up=True)

        result = await ch.post(post)
        if result.ok:
            await models.mark_posted(d["id"], result.external_id, channel,
                                     d["source_kind"], d["source_ref"])
            await breaker.record_ok(channel)
            await _note_posted(channel, d["url"], result.external_id)
        else:
            await breaker.record_fail(channel, result.error or "unbekannt", result.retry_after)
            # Bei vorgemerkten Entwürfen ist der Versuch schon gezählt: nur Grund und Zustand
            # überschreiben, sonst wäre das Retry-Limit nach der Hälfte der Durchläufe erreicht.
            if result.outcome_unknown:
                # Kein Retry: der Post könnte schon draußen sein, ein zweiter wäre ein Doppelpost.
                await models.record_attempt_failure(
                    d["id"], f"{models.AUSGANG_UNBEKANNT}: {result.error or 'unbekannt'}",
                    give_up=True, count_attempt=not vorgemerkt)
                await _notify(T.outcome_unknown_note(channel, d["url"], result.error or "unbekannt"))
                continue
            give_up = int(d["attempts"]) + 1 >= MAX_ATTEMPTS
            await models.record_attempt_failure(d["id"], result.error or "unbekannt", give_up,
                                                count_attempt=not vorgemerkt)
            if give_up:
                await _notify(f"⚠️ Post auf {T.CHANNEL_LABEL.get(channel, channel)} "
                              f"nach {MAX_ATTEMPTS} Versuchen aufgegeben.\n{d['url']}")

    if limit_verworfen:
        await _notify(T.tageslimit_note(TUMBLR, limit_verworfen, config.TUMBLR_MAX_POSTS_PER_DAY))

    for channel, n in uebersprungen.items():
        if _skip_melden(channel, n):
            log.warning("Kanal %s ist nicht in CHANNELS_ENABLED — %d freigegebene(r) "
                        "Entwurf/Entwürfe bleiben liegen.", channel, n)
    # Kanäle, die diesmal nicht übersprungen wurden, vergessen: kommt der Kanal zurück und fällt
    # später wieder weg, soll die Warnung sofort wieder erscheinen.
    for channel in [c for c in _skip_gemeldet if c not in uebersprungen]:
        del _skip_gemeldet[channel]


async def _note_posted(channel, url, ext) -> None:
    if channel == TUMBLR:
        return  # Tumblr: bis zu 6 Posts am Tag wären Lärm — die tägliche Sammelmeldung (batch) deckt es ab
    await _notify(T.posted_note(channel, url, ext))


async def _notify(text: str) -> None:
    chat_id = await settings.approval_chat_id()
    if chat_id and runtime.bot:
        try:
            await runtime.bot.send_message(chat_id=chat_id, text=text,
                                           disable_web_page_preview=True)
        except Exception:
            log.exception("Konnte Post-Meldung nicht senden")
