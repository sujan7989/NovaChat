import Redis from "ioredis";
import { REDIS_URL } from "./config.js";

const redis = new Redis(REDIS_URL);

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error", (err) => console.error("Redis error:", err));

export async function setPair(userA, userB) {
  await redis.set(`session:${userA}`, userB);
  await redis.set(`session:${userB}`, userA);
}

export async function getPartner(userId) {
  return await redis.get(`session:${userId}`);
}

export async function removePair(userId) {
  const partner = await redis.get(`session:${userId}`);
  await redis.del(`session:${userId}`);
  if (partner) {
    await redis.del(`session:${partner}`);
    // Remember recent partner for rating (expires in 10 mins)
    await redis.set(`recent:${userId}`, partner, "EX", 600);
    await redis.set(`recent:${partner}`, userId, "EX", 600);
  }
  return partner;
}

export async function enqueue(userId, gender, pref, interests, languages, vibes) {
  // Remove any existing entry for this user first
  await removeFromQueue(userId);
  const data = JSON.stringify({
    userId,
    gender:    gender    || "other",
    pref:      pref      || "any",
    interests: interests || [],
    languages: languages || [],
    vibes:     vibes     || [],
    ts:        Date.now(), // timestamp — stale entries are filtered during dequeue
  });
  await redis.rpush("queue:all", data);
  // NOTE: do NOT set expire on queue:all — it's a shared list and a TTL would
  // silently evict everyone currently waiting if nobody joins for 5 minutes.
  // Stale-entry cleanup is handled by checking `ts` during dequeueMatch.
}

function hasOverlap(a, b) {
  if (!a.length || !b.length) return false;
  return a.some(x => b.includes(x));
}

export async function dequeueMatch(userId, myGender, myPref, myInterests, myLanguages, myVibes) {
  const myLangs = myLanguages || [];
  const myInts  = myInterests || [];
  const myVbs   = myVibes     || [];

  const members = await redis.lrange("queue:all", 0, -1);
  const now = Date.now();

  let bestRaw   = null;
  let bestScore = -Infinity;
  const staleEntries = [];

  for (const raw of members) {
    let c;
    try { c = JSON.parse(raw); } catch { continue; }
    if (c.userId === userId) continue;

    // Remove stale entries (older than 5 minutes) — collect to delete in batch
    if (c.ts && now - c.ts > 300_000) {
      staleEntries.push(raw);
      continue;
    }

    // Gender pref — hard rule only when specific pref set
    const myPrefSpecific    = myPref !== "any";
    const theirPrefSpecific = c.pref !== "any";

    if (myPrefSpecific    && myPref !== c.gender)  continue;
    if (theirPrefSpecific && c.pref !== myGender)  continue;

    let score = 1; // base: gender compatible

    const langOverlap = hasOverlap(myLangs, c.languages);
    if (langOverlap) score += 10;
    else if (myLangs.length > 0 && c.languages.length > 0) score -= 5;

    const sharedCount = myInts.filter(x => c.interests.includes(x)).length;
    score += sharedCount * 3;

    if (hasOverlap(myVbs, c.vibes)) score += 4;

    if (score > bestScore) {
      bestScore = score;
      bestRaw   = raw;
    }
  }

  // Purge stale entries in the background
  if (staleEntries.length > 0) {
    Promise.all(staleEntries.map(e => redis.lrem("queue:all", 1, e))).catch(() => {});
  }

  if (!bestRaw) return null;

  const chosen = JSON.parse(bestRaw);

  // Remove chosen from queue
  await redis.lrem("queue:all", 1, bestRaw);

  const shared = myInts.filter(x => chosen.interests.includes(x));
  return { partnerId: chosen.userId, shared, partnerVibes: chosen.vibes || [] };
}

export async function removeFromQueue(userId) {
  const members = await redis.lrange("queue:all", 0, -1);
  for (const raw of members) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.userId === userId) {
        await redis.lrem("queue:all", 0, raw);
      }
    } catch {}
  }
}

export async function addReport(userId) {
  return await redis.incr(`reports:${userId}`);
}

export async function getReportCount(userId) {
  const val = await redis.get(`reports:${userId}`);
  return parseInt(val) || 0;
}

export async function incrementStat(key) {
  await redis.incr(`stat:${key}`);
}

export async function getStat(key) {
  const val = await redis.get(`stat:${key}`);
  return parseInt(val) || 0;
}

export async function decrementStat(key) {
  const cur = await redis.get(`stat:${key}`);
  if (cur && parseInt(cur) > 0) await redis.decr(`stat:${key}`);
}

export async function ping() {
  await redis.ping();
}

export default redis;

// ── Rating system ──────────────────────────────────────────────────────────
export async function addRating(fromUserId, toUserId, stars) {
  await redis.lpush(`ratings:${toUserId}`, JSON.stringify({ stars, ts: Date.now() }));
  await redis.ltrim(`ratings:${toUserId}`, 0, 99); // keep last 100 ratings
}

export async function getAverageRating(userId) {
  const items = await redis.lrange(`ratings:${userId}`, 0, -1);
  if (!items.length) return null;
  const total = items.reduce((sum, raw) => {
    try { return sum + JSON.parse(raw).stars; } catch { return sum; }
  }, 0);
  return total / items.length;
}

export async function getRecentPartner(userId) {
  return await redis.get(`recent:${userId}`);
}
