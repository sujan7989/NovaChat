from bot.services.redis_client import (
    enqueue, dequeue_match, remove_from_queue,
    set_pair, get_profile, increment_stat
)

INTEREST_BONUS = 2  # shared interests boost match priority

async def find_or_queue(user_id: int) -> int | None:
    """Try to find a match. If none, enqueue user. Returns partner_id or None."""
    profile = await get_profile(user_id)
    if not profile:
        return None

    gender = profile.get("gender", "other")
    pref = profile.get("pref", "any")
    my_interests = set(profile.get("interests", []))

    partner_id = await dequeue_match(user_id, pref, gender)

    if partner_id:
        await set_pair(user_id, partner_id)
        await increment_stat("total_matches")
        return partner_id

    # No match found — add to queue
    await enqueue(user_id, gender)
    return None

async def cancel_search(user_id: int):
    await remove_from_queue(user_id)
