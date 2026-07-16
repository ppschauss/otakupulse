"""APScheduler-Setup. Jobs sind rein derivativ (deterministische IDs, replace_existing).

- daily_batch: fester Zeitpunkt (Default 18:00) → ingest + Batch verschicken
- post_pass: alle 2 Min → freigegebene Entwürfe posten
- expire_pass: stündlich → verderbliche Entwürfe verfallen
- nudge_pass: stündlich → einmaliger Nudge bei liegengebliebener Queue
"""
import logging
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from . import config, batch, poster

log = logging.getLogger(__name__)

scheduler: AsyncIOScheduler | None = None


async def setup() -> None:
    global scheduler
    tz = ZoneInfo(config.TZ)
    scheduler = AsyncIOScheduler(timezone=tz)

    scheduler.add_job(
        batch.run_daily,
        CronTrigger(hour=config.BATCH_HOUR, minute=config.BATCH_MINUTE, timezone=tz),
        id="daily_batch", replace_existing=True, misfire_grace_time=3600,
        coalesce=True, max_instances=1,
    )
    scheduler.add_job(
        poster.run_post_pass,
        IntervalTrigger(minutes=2, timezone=tz),
        id="post_pass", replace_existing=True,
        coalesce=True, max_instances=1, misfire_grace_time=120,
    )
    scheduler.add_job(
        batch.expire_pass,
        IntervalTrigger(hours=1, timezone=tz),
        id="expire_pass", replace_existing=True, coalesce=True, max_instances=1,
    )
    scheduler.add_job(
        batch.nudge_pass,
        IntervalTrigger(hours=1, timezone=tz),
        id="nudge_pass", replace_existing=True, coalesce=True, max_instances=1,
    )
    scheduler.start()
    log.info("Scheduler gestartet (Batch %02d:%02d %s).",
             config.BATCH_HOUR, config.BATCH_MINUTE, config.TZ)


def shutdown() -> None:
    if scheduler is not None:
        scheduler.shutdown(wait=False)
