import logging
import ssl
import certifi
from telegram.ext import (
    ApplicationBuilder, CommandHandler, MessageHandler,
    filters
)
from telegram.request import HTTPXRequest
from bot.config import BOT_TOKEN
from bot.handlers.start import get_setup_conversation, get_interests_conversation
from bot.handlers.match import find_stranger, next_stranger, stop_chat
from bot.handlers.relay import relay_message
from bot.handlers.report import report_stranger
from bot.handlers.help import help_command, stats_command

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)

def main():
    request = HTTPXRequest(
        connection_pool_size=8,
        http_version="1.1",
    )
    app = (
        ApplicationBuilder()
        .token(BOT_TOKEN)
        .request(request)
        .build()
    )

    # Onboarding conversation (/start)
    app.add_handler(get_setup_conversation())

    # Interests update conversation (/interests)
    app.add_handler(get_interests_conversation())

    # Core commands
    app.add_handler(CommandHandler("find", find_stranger))
    app.add_handler(CommandHandler("next", next_stranger))
    app.add_handler(CommandHandler("stop", stop_chat))
    app.add_handler(CommandHandler("report", report_stranger))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("stats", stats_command))

    # Relay — catches ALL message types not handled above
    app.add_handler(MessageHandler(
        filters.ALL & ~filters.COMMAND,
        relay_message
    ))

    print("🤖 AnonLink Bot is running...")
    app.run_polling()

if __name__ == "__main__":
    main()
