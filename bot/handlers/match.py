from telegram import Update
from telegram.ext import ContextTypes

from bot.services.matchmaking import find_or_queue, cancel_search
from bot.services.redis_client import get_partner, remove_pair, get_profile, increment_stat

async def find_stranger(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id

    profile = await get_profile(user_id)
    if not profile:
        await update.message.reply_text("Please /start first to set up your profile.")
        return

    # Already in a chat
    existing = await get_partner(user_id)
    if existing:
        await update.message.reply_text("You're already in a chat. Use /next to find someone new or /stop to end.")
        return

    await update.message.reply_text("🔍 Searching for a stranger...")

    partner_id = await find_or_queue(user_id)

    if partner_id:
        await _notify_match(context, user_id, partner_id)
    else:
        await update.message.reply_text("⏳ You're in the queue. Hang tight, finding someone for you...")

async def next_stranger(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id

    partner_id = await remove_pair(user_id)
    await cancel_search(user_id)

    if partner_id:
        try:
            await context.bot.send_message(partner_id, "👻 Stranger disconnected. Use /find to meet someone new.")
        except Exception:
            pass

    await update.message.reply_text("🔍 Finding a new stranger...")

    profile = await get_profile(user_id)
    if not profile:
        await update.message.reply_text("Please /start first.")
        return

    new_partner = await find_or_queue(user_id)
    if new_partner:
        await _notify_match(context, user_id, new_partner)
    else:
        await update.message.reply_text("⏳ In queue, looking for someone...")

async def stop_chat(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id

    partner_id = await remove_pair(user_id)
    await cancel_search(user_id)

    if partner_id:
        try:
            await context.bot.send_message(partner_id, "👻 Stranger has left the chat. Use /find to meet someone new.")
        except Exception:
            pass
        await update.message.reply_text("Chat ended. Use /find to start a new one.")
    else:
        await update.message.reply_text("You're not in a chat. Use /find to start one.")

async def _notify_match(context, user_a: int, user_b: int):
    profile_a = await get_profile(user_a)
    profile_b = await get_profile(user_b)

    interests_a = set(profile_a.get("interests", []))
    interests_b = set(profile_b.get("interests", []))
    shared = interests_a & interests_b

    shared_text = f"\n🎯 Shared interests: {', '.join(shared)}" if shared else ""

    msg = f"🎉 You're connected to a stranger! Say hi 👋{shared_text}\n\nUse /next to skip or /stop to end."

    await context.bot.send_message(user_a, msg)
    await context.bot.send_message(user_b, msg)
    await increment_stat("active_chats")
