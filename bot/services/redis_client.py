import redis.asyncio as aioredis
from bot.config import REDIS_URL

_redis = None

async def get_redis():
    global _redis
    if _redis is None:
        _redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
    return _redis

# --- Session keys ---
def session_key(user_id):      return f"session:{user_id}"
def queue_key(gender_pref):    return f"queue:{gender_pref}"
def profile_key(user_id):      return f"profile:{user_id}"
def report_key(user_id):       return f"reports:{user_id}"

# --- Active pair ---
async def set_pair(user_a: int, user_b: int):
    r = await get_redis()
    await r.set(session_key(user_a), user_b)
    await r.set(session_key(user_b), user_a)

async def get_partner(user_id: int):
    r = await get_redis()
    val = await r.get(session_key(user_id))
    return int(val) if val else None

async def remove_pair(user_id: int):
    r = await get_redis()
    partner_id = await get_partner(user_id)
    await r.delete(session_key(user_id))
    if partner_id:
        await r.delete(session_key(partner_id))
    return partner_id

# --- Queue ---
async def enqueue(user_id: int, pref: str):
    r = await get_redis()
    await r.rpush(queue_key(pref), user_id)

async def dequeue_match(user_id: int, pref: str, my_gender: str):
    """Find a user in queue whose pref matches my_gender and I match their pref."""
    r = await get_redis()
    # Check queues: exact pref match + "any"
    for q in [queue_key(my_gender), queue_key("any")]:
        members = await r.lrange(q, 0, -1)
        for candidate in members:
            candidate = int(candidate)
            if candidate == user_id:
                continue
            # Check candidate's pref matches my gender
            profile = await get_profile(candidate)
            if profile and (profile.get("pref") in (pref, "any") or pref == "any"):
                await r.lrem(q, 1, candidate)
                return candidate
    return None

async def remove_from_queue(user_id: int):
    r = await get_redis()
    for pref in ["male", "female", "other", "any"]:
        await r.lrem(queue_key(pref), 0, user_id)

# --- Profile ---
async def save_profile(user_id: int, gender: str, pref: str, interests: list):
    r = await get_redis()
    await r.hset(profile_key(user_id), mapping={
        "gender": gender,
        "pref": pref,
        "interests": ",".join(interests)
    })

async def get_profile(user_id: int):
    r = await get_redis()
    data = await r.hgetall(profile_key(user_id))
    if data and "interests" in data:
        data["interests"] = data["interests"].split(",") if data["interests"] else []
    return data or None

# --- Reports ---
async def add_report(user_id: int):
    r = await get_redis()
    count = await r.incr(report_key(user_id))
    return count

async def get_report_count(user_id: int):
    r = await get_redis()
    val = await r.get(report_key(user_id))
    return int(val) if val else 0

# --- Stats ---
async def increment_stat(key: str):
    r = await get_redis()
    await r.incr(f"stat:{key}")

async def get_stat(key: str):
    r = await get_redis()
    val = await r.get(f"stat:{key}")
    return int(val) if val else 0
