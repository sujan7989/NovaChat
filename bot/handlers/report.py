from telegram import Update
from telegram.ext import ContextTypes

from bot.services.redis_client import get_partner, remove_pair, add_report, get_report_count
from bot.config import REPORT_BAN_THRESHOLD

async def report_stranger(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    partner_id = await get_partner(user_id)

    if not partner_id:
        await update.message.reply_text("You're not in a chat. Nothing to report.")
        return

    # Disconnect both
    await remove_pair(user_id)

    # Increment report count on the reported user
    report_count = await add_report(partner_id)

    await update.message.reply_text(
        "✅ Reported and disconnected. Thank you for keeping the community safe.\nUse /find to meet someone new."
    )

    try:
        await context.bot.send_message(
            partner_id,
            "⚠️ You've been reported and disconnected. Repeated violations will result in a ban."
        )
    except Exception:
        pass

    if report_count >= REPORT_BAN_THRESHOLD:
        # TODO: persist ban to DB for permanent enforcement
        # For now, we just notify — extend with DB ban check in relay
        pass
