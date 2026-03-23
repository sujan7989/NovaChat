from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes, ConversationHandler, CommandHandler, CallbackQueryHandler

from bot.services.redis_client import save_profile, get_profile

GENDER, PREF, INTERESTS = range(3)

INTERESTS_LIST = ["🎮 Gaming", "🎵 Music", "🎬 Movies", "💻 Tech", "📚 Books", "✈️ Travel", "🍕 Food", "😂 Memes"]

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    profile = await get_profile(user_id)

    if profile:
        await update.message.reply_text(
            "👋 Welcome back! Use /find to meet a stranger, /interests to update your interests, or /help for all commands."
        )
        return ConversationHandler.END

    await update.message.reply_text(
        "👻 *Welcome to AnonLink Bot!*\n\nChat anonymously with strangers. No names. No numbers. Just vibes.\n\nLet's set up your profile first.",
        parse_mode="Markdown"
    )
    keyboard = [
        [InlineKeyboardButton("👨 Male", callback_data="gender_male"),
         InlineKeyboardButton("👩 Female", callback_data="gender_female")],
        [InlineKeyboardButton("🌈 Other", callback_data="gender_other")]
    ]
    await update.message.reply_text("What's your gender?", reply_markup=InlineKeyboardMarkup(keyboard))
    return GENDER

async def gender_chosen(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    gender = query.data.replace("gender_", "")
    context.user_data["gender"] = gender

    keyboard = [
        [InlineKeyboardButton("👨 Male", callback_data="pref_male"),
         InlineKeyboardButton("👩 Female", callback_data="pref_female")],
        [InlineKeyboardButton("🌈 Any", callback_data="pref_any")]
    ]
    await query.edit_message_text("Who do you want to talk to?", reply_markup=InlineKeyboardMarkup(keyboard))
    return PREF

async def pref_chosen(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    pref = query.data.replace("pref_", "")
    context.user_data["pref"] = pref
    context.user_data["interests"] = []

    keyboard = _interests_keyboard([])
    await query.edit_message_text(
        "Pick your interests (optional, helps find better matches). Tap to select, then tap ✅ Done.",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return INTERESTS

async def interests_toggle(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    if query.data == "interests_done":
        return await _save_and_finish(update, context)

    interest = query.data.replace("interest_", "")
    selected = context.user_data.get("interests", [])

    if interest in selected:
        selected.remove(interest)
    else:
        selected.append(interest)
    context.user_data["interests"] = selected

    keyboard = _interests_keyboard(selected)
    await query.edit_message_reply_markup(reply_markup=InlineKeyboardMarkup(keyboard))
    return INTERESTS

async def _save_and_finish(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    gender = context.user_data["gender"]
    pref = context.user_data["pref"]
    interests = context.user_data.get("interests", [])

    await save_profile(user_id, gender, pref, interests)

    await update.callback_query.edit_message_text(
        "✅ Profile saved!\n\nUse /find to start chatting with a stranger.\nUse /help to see all commands."
    )
    return ConversationHandler.END

def _interests_keyboard(selected: list):
    rows = []
    for i in range(0, len(INTERESTS_LIST), 2):
        row = []
        for item in INTERESTS_LIST[i:i+2]:
            label = ("✅ " if item in selected else "") + item
            row.append(InlineKeyboardButton(label, callback_data=f"interest_{item}"))
        rows.append(row)
    rows.append([InlineKeyboardButton("✅ Done", callback_data="interests_done")])
    return rows

async def update_interests(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    profile = await get_profile(user_id)
    if not profile:
        await update.message.reply_text("Please /start first to set up your profile.")
        return ConversationHandler.END

    context.user_data["gender"] = profile["gender"]
    context.user_data["pref"] = profile["pref"]
    context.user_data["interests"] = profile.get("interests", [])

    keyboard = _interests_keyboard(context.user_data["interests"])
    await update.message.reply_text(
        "Update your interests:", reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return INTERESTS

def get_setup_conversation():
    return ConversationHandler(
        entry_points=[CommandHandler("start", start)],
        states={
            GENDER: [CallbackQueryHandler(gender_chosen, pattern="^gender_")],
            PREF: [CallbackQueryHandler(pref_chosen, pattern="^pref_")],
            INTERESTS: [
                CallbackQueryHandler(interests_toggle, pattern="^interest_"),
                CallbackQueryHandler(_save_and_finish, pattern="^interests_done$"),
            ],
        },
        fallbacks=[CommandHandler("start", start)],
        per_message=False
    )

def get_interests_conversation():
    return ConversationHandler(
        entry_points=[CommandHandler("interests", update_interests)],
        states={
            INTERESTS: [
                CallbackQueryHandler(interests_toggle, pattern="^interest_"),
                CallbackQueryHandler(_save_and_finish, pattern="^interests_done$"),
            ],
        },
        fallbacks=[],
        per_message=False
    )
