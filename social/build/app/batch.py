"""Ingest + täglicher Freigabe-Batch + Verfall + Nudge.

'Dranbleiben' trotz Freigabepflicht: ein Batch pro Tag zur festen Zeit, Ein-Tap-Freigabe,
News verfallen nach 48 h (Queue kann nicht zur Halde werden). Der Nudge kommt genau einmal.
"""
import logging
from datetime import timezone

from telegram.constants import ParseMode

from . import config, models, settings, runtime, compose, tagging, texts_de as T
from .sources import articles
from .channels import registry
from . import util
from .util import today_str, now_utc, parse_iso

log = logging.getLogger(__name__)

TUMBLR = "tumblr"


def _fuer_tumblr(item) -> bool:
    """Darf dieser Artikel auf den Tumblr-Blog? Kategorie-Filter plus Adult-Ausschluss."""
    return (item.category in articles.TUMBLR_CATEGORIES
            and not tagging.is_excluded(item.genres, item.is_hentai))


async def ingest(limit: int) -> int:
    """Neue Artikel holen, je aktiven Kanal einen Entwurf formulieren + einreihen.
    Gibt die Zahl der neu erzeugten Entwürfe zurück."""
    channels = registry.active_channel_names()
    if not channels:
        log.warning("Keine aktiven Kanäle (CHANNELS_ENABLED leer) — nichts zu formulieren.")
        return 0

    items = await articles.fetch_new(limit)
    # Genre-Häufigkeit einmal je Lauf (nur für Tumblr-Tags nötig). Der Tumblr-Pfad
    # degradiert: bei einem Fehler entfällt Tumblr in diesem Lauf, die anderen Kanäle laufen weiter.
    rarity: dict[str, int] | None = {}
    if TUMBLR in channels and items:
        try:
            rarity = await articles.genre_rarity()
        except Exception:
            log.warning("Genre-Häufigkeit nicht lesbar — kein Tumblr-Entwurf in diesem Lauf.",
                        exc_info=True)
            rarity = None
    day = today_str()
    created = 0
    for item in items:
        # Tumblr nimmt nur ausgewählte Kategorien und keine Adult-Titel; die anderen
        # Kanäle bekommen den Artikel unverändert.
        try:
            tumblr_ok = TUMBLR in channels and _fuer_tumblr(item)
        except Exception:
            log.exception("Tumblr-Prüfung fehlgeschlagen für %s — kein Tumblr-Entwurf", item.ref)
            tumblr_ok = False
        item_channels = [ch for ch in channels if ch != TUMBLR or tumblr_ok]
        # Tags sind Daten, kein Modelltext: aus den Rohdaten abgeleitet, vor dem Modellaufruf.
        # Scheitert das (oder fehlt rarity), entfällt nur der Tumblr-Entwurf dieses Artikels.
        tumblr_tags: list[str] | None = None
        if TUMBLR in item_channels and rarity is None:
            item_channels.remove(TUMBLR)  # Ursache ist oben schon als Warnung geloggt
        elif TUMBLR in item_channels:
            try:
                tumblr_tags = tagging.tags_for(
                    item.genres, item.anime_tags, item.series_title, rarity)
            except Exception:
                log.exception("Tag-Herleitung fehlgeschlagen für %s — kein Tumblr-Entwurf", item.ref)
                item_channels.remove(TUMBLR)
        if not item_channels:  # nur Tumblr aktiv und Artikel ausgeschlossen: nichts zu formulieren
            await models.mark_seen(item.kind, item.ref)
            continue
        try:
            texts = await compose.compose_for(item, item_channels)
        except Exception:
            log.exception("Formulierung fehlgeschlagen für %s", item.ref)
            continue
        for ch in item_channels:
            body = texts.get(ch)
            if not body:
                continue
            draft_id = await models.enqueue(
                batch_day=day, channel=ch, source_kind=item.kind, source_ref=item.ref,
                url=item.url, image_url=item.image_url, title=item.title,
                body=body, perishable=item.perishable,
                tags=tumblr_tags if ch == TUMBLR else None,
                category=item.category if ch == TUMBLR else None,
            )
            if ch == TUMBLR:
                # Tumblr überspringt die Telegram-Einzelfreigabe; der Poster dosiert (ein Post je Lauf).
                await models.approve(draft_id)
            created += 1
        await models.mark_seen(item.kind, item.ref)
    return created


async def run_daily() -> None:
    """Scheduler-Job: zuerst frisch ingesten, dann den Batch verschicken."""
    await expire_pass()
    await ingest(config.MAX_DRAFTS_PER_BATCH)
    await send_batch()
    await send_tumblr_summary()


async def send_batch() -> None:
    chat_id = await settings.approval_chat_id()
    if not chat_id or not runtime.bot:
        log.warning("Kein Freigabe-Chat gesetzt — Batch nicht versendet.")
        return
    day = today_str()
    pending = await models.pending_for_batch(day)

    await runtime.bot.send_message(
        chat_id=chat_id, text=T.batch_header(day, len(pending), config.dry_channels(), config.all_dry())
    )
    if not pending:
        return
    for idx, d in enumerate(pending, 1):
        await runtime.bot.send_message(
            chat_id=chat_id,
            text=T.draft_message(idx, len(pending), d),
            reply_markup=T.draft_keyboard(d["id"]),
            disable_web_page_preview=False,
        )
    await runtime.bot.send_message(
        chat_id=chat_id, text="——", reply_markup=T.batch_footer_keyboard(day)
    )
    await settings.set("last_batch_day", day)
    await settings.set("last_batch_nudged", "0")


SUMMARY_BIS_KEY = "tumblr_summary_bis"  # Ende des zuletzt gemeldeten Zeitraums (UTC-ISO)


async def _tumblr_bilanz() -> tuple[str, str]:
    """Text der Tumblr-Tagesmeldung und das Ende des darin abgedeckten Zeitraums.

    Zeitraum: seit der letzten erfolgreich gesendeten Meldung, beim allerersten Mal ab Beginn
    des lokalen Tages (dieselbe Grenze wie models.posted_today). Ein reiner 'heute'-Ausschnitt
    wäre hier falsch: der Batch läuft um 18 Uhr, die Posts des Ingests gehen erst danach raus
    und fielen sonst nie in eine Meldung.
    """
    jetzt = util.now_local()  # eine einzige Uhrablesung für Fensterende und Tagesbeginn
    von = await settings.get(SUMMARY_BIS_KEY) or models.tagesbeginn_utc(jetzt)
    # Nie rückwärts: bei zurückgestellter Uhr bleibt das Fenster leer statt negativ.
    bis = max(parse_iso(von), jetzt.astimezone(timezone.utc)).isoformat()
    posts = await models.posted_between(TUMBLR, von, bis)
    limit = await models.limit_discarded_between(TUMBLR, von, bis)
    unbekannt = await models.outcome_unknown_between(TUMBLR, von, bis)
    banner = T.dry_banner(config.dry_channels(), config.all_dry()) if config.is_dry(TUMBLR) else ""
    return (T.tumblr_tagesmeldung(posts, len(limit), unbekannt,
                                  blog=config.TUMBLR_BLOG_IDENTIFIER, banner=banner), bis)


async def tumblr_summary() -> str:
    """Tagesmeldung für den Tumblr-Kanal (nie leer); sendet nichts und merkt sich nichts."""
    return (await _tumblr_bilanz())[0]


async def send_tumblr_summary() -> None:
    """Tumblr-Tagesmeldung an den Freigabe-Chat; der Zeitraum rückt nur nach erfolgreichem Senden vor."""
    if TUMBLR not in config.CHANNELS_ENABLED:
        return
    chat_id = await settings.approval_chat_id()
    if not chat_id or not runtime.bot:
        return
    try:
        text, bis = await _tumblr_bilanz()
        await runtime.bot.send_message(chat_id=chat_id, text=text,
                                       disable_web_page_preview=True)
        await settings.set(SUMMARY_BIS_KEY, bis)
    except Exception:
        log.exception("Tumblr-Tagesmeldung nicht gesendet — der Zeitraum bleibt offen.")


async def expire_pass() -> int:
    n = await models.expire_due()
    if n:
        log.info("%d verderbliche Entwürfe verfallen.", n)
    return n


async def nudge_pass() -> None:
    """Höchstens ein Nudge pro Batch: wenn >24 h nach dem Batch noch etwas offen ist."""
    chat_id = await settings.approval_chat_id()
    if not chat_id or not runtime.bot:
        return
    if (await settings.get("last_batch_nudged")) == "1":
        return
    last_day = await settings.get("last_batch_day")
    if not last_day:
        return
    pending = await models.pending_for_batch(last_day)
    if not pending:
        return
    expiring = sum(1 for d in pending if d["perishable_at"]
                   and parse_iso(d["perishable_at"]).date() == now_utc().date())
    await runtime.bot.send_message(chat_id=chat_id, text=T.nudge(len(pending), expiring))
    await settings.set("last_batch_nudged", "1")
