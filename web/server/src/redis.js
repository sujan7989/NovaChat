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
  if (partner) await redis.del(`session:${partner}`);
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
    ts:        Date.now(), // timestamp for stale cleanup
  });
  await redis.rpush("queue:all", data);
  // Auto-expire queue entries after 5 minutes to prevent ghost users
  await redis.expire("queue:all", 300);
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

  let bestRaw   = null;
  let bestScore = -Infinity;

  for (const raw of members) {
    let c;
    try { c = JSON.parse(raw); } catch { continue; }
    if (c.userId === userId) continue;

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
