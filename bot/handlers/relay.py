from telegram import Update
from telegram.ext import ContextTypes
from telegram.constants import ChatAction

from bot.services.redis_client import get_partner

async def relay_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Central relay — forwards any message type to the paired partner."""
    user_id = update.effective_user.id
    partner_id = await get_partner(user_id)

    if not partner_id:
        await update.message.reply_text("You're not connected. Use /find to meet a stranger.")
        return

    msg = update.message

    try:
        # Mirror typing action
        await context.bot.send_chat_action(partner_id, ChatAction.TYPING)

        if msg.text:
            await context.bot.send_message(partner_id, f"👤 {msg.text}")

        elif msg.photo:
            await context.bot.send_chat_action(partner_id, ChatAction.UPLOAD_PHOTO)
            await context.bot.send_photo(
                partner_id,
                msg.photo[-1].file_id,
                caption=f"👤 {msg.caption}" if msg.caption else None
            )

        elif msg.video:
            await context.bot.send_chat_action(partner_id, ChatAction.UPLOAD_VIDEO)
            await context.bot.send_video(
                partner_id,
                msg.video.file_id,
                caption=f"👤 {msg.caption}" if msg.caption else None
            )

        elif msg.video_note:
            await context.bot.send_chat_action(partner_id, ChatAction.UPLOAD_VIDEO_NOTE)
            await context.bot.send_video_note(partner_id, msg.video_note.file_id)

        elif msg.voice:
            await context.bot.send_chat_action(partner_id, ChatAction.UPLOAD_VOICE)
            await context.bot.send_voice(partner_id, msg.voice.file_id)

        elif msg.audio:
            await context.bot.send_chat_action(partner_id, ChatAction.UPLOAD_VOICE)
            await context.bot.send_audio(partner_id, msg.audio.file_id)

        elif msg.sticker:
            await context.bot.send_sticker(partner_id, msg.sticker.file_id)

        elif msg.animation:
            await context.bot.send_animation(
                partner_id,
                msg.animation.file_id,
                caption=f"👤 {msg.caption}" if msg.caption else None
            )

        elif msg.document:
            await context.bot.send_chat_action(partner_id, ChatAction.UPLOAD_DOCUMENT)
            await context.bot.send_document(
                partner_id,
                msg.document.file_id,
                caption=f"👤 {msg.caption}" if msg.caption else None
            )

        else:
            await update.message.reply_text("⚠️ This media type isn't supported yet.")

    except Exception as e:
        await update.message.reply_text("⚠️ Couldn't deliver your message. Your partner may have left.")
