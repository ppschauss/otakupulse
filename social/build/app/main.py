"""Einstiegspunkt: Application aufbauen, Handler registrieren, Long-Polling starten."""
import logging

from telegram import Update
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters,
)

from . import config, db, pg, settings, scheduler, runtime
from .handlers import commands, callbacks

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
# httpx loggt sonst jede Telegram-URL inkl. Bot-Token ins Docker-Log — leiser stellen.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("apscheduler").setLevel(logging.WARNING)
log = logging.getLogger("otakupulse-social")


async def on_startup(app: Application) -> None:
    await db.init()
    await pg.init()
    await settings.seed_defaults()
    runtime.set_bot(app.bot)
    await scheduler.setup()
    await commands.set_menu(app)
    mode = "TROCKENMODUS" if config.DRY_RUN else "LIVE"
    log.info("Startup fertig — %s, Kanäle: %s", mode, config.CHANNELS_ENABLED)


async def on_shutdown(app: Application) -> None:
    scheduler.shutdown()
    await pg.close()
    await db.close()
    log.info("Shutdown fertig.")


def main() -> None:
    app = (
        Application.builder()
        .token(config.SOCIAL_BOT_TOKEN)
        .post_init(on_startup)
        .post_shutdown(on_shutdown)
        .build()
    )

    app.add_handler(CommandHandler("start", commands.cmd_start))
    app.add_handler(CommandHandler("status", commands.cmd_status))
    app.add_handler(CommandHandler("batch", commands.cmd_batch))
    app.add_handler(CommandHandler("pause", commands.cmd_pause))
    app.add_handler(CommandHandler("resume", commands.cmd_resume))

    app.add_handler(CallbackQueryHandler(callbacks.on_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, callbacks.on_edit_text))

    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
