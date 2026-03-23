from telegram import Update
from telegram.ext import ContextTypes
from bot.services.redis_client import get_stat

HELP_TEXT = """
👻 *AnonLink Bot — Commands*

/find — Find a random stranger to chat with
/next — Skip current stranger, find a new one
/stop — End current chat
/interests — Update your interests for better matching
/stats — See bot statistics
/report — Report current stranger (abuse/spam)
/help — Show this message

*What you can share:*
💬 Text • 📷 Photos • 🎥 Videos • 🎙 Voice messages
📹 Video notes • 🎵 Audio • 📄 Files • 😂 Stickers & GIFs

*Your privacy:* Nobody sees your Telegram ID or username. Ever.
"""

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(HELP_TEXT, parse_mode="Markdown")

async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    total = await get_stat("total_matches")
    active = await get_stat("active_chats")
    await update.message.reply_text(
        f"📊 *AnonLink Stats*\n\n"
        f"🔗 Total matches made: {total}\n"
        f"💬 Chats started: {active}",
        parse_mode="Markdown"
    )
