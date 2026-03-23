import Redis from "ioredis";
import { REDIS_URL } from "./config.js";

const redis = new Redis(REDIS_URL);

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error", (err) => console.error("Redis error:", err));

// --- Pair management ---
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

// --- Queue management ---
export async function enqueue(userId, gender, pref, interests, languages, vibes) {
  const data = JSON.stringify({ userId, gender, pref, interests: interests || [], languages: languages || [], vibes: vibes || [] });
  await redis.rpush(`queue:${pref}`, data);
  await redis.rpush("queue:any", data);
}

export async function dequeueMatch(userId, myGender, myPref, myInterests, myLanguages) {
  const queues = myPref === "any"
    ? ["queue:any"]
    : [`queue:${myGender}`, "queue:any"];

  for (const q of queues) {
    const members = await redis.lrange(q, 0, -1);
    for (const raw of members) {
      const candidate = JSON.parse(raw);
      if (candidate.userId === userId) continue;

      // Mutual preference check
      const iWantThem = myPref === "any" || myPref === candidate.gender;
      const theyWantMe = candidate.pref === "any" || candidate.pref === myGender;
      if (!iWantThem || !theyWantMe) continue;

      // Language filter
      const myLangs = myLanguages || [];
      const theirLangs = candidate.languages || [];
      if (myLangs.length > 0 && theirLangs.length > 0) {
        const overlap = myLangs.some(l => theirLangs.includes(l));
        if (!overlap) continue;
      }

      // Remove from all queues
      await redis.lrem(`queue:${candidate.pref}`, 0, raw);
      await redis.lrem("queue:any", 0, raw);

      const shared = (myInterests || []).filter(i => (candidate.interests || []).includes(i));
      return { partnerId: candidate.userId, shared, partnerVibes: candidate.vibes || [] };
    }
  }
  return null;
}

export async function removeFromQueue(userId) {
  for (const pref of ["male", "female", "other", "any"]) {
    const members = await redis.lrange(`queue:${pref}`, 0, -1);
    for (const raw of members) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.userId === userId) {
          await redis.lrem(`queue:${pref}`, 0, raw);
        }
      } catch {}
    }
  }
}

// --- Reports ---
export async function addReport(userId) {
  return await redis.incr(`reports:${userId}`);
}

export async function getReportCount(userId) {
  const val = await redis.get(`reports:${userId}`);
  return parseInt(val) || 0;
}

// --- Stats ---
export async function incrementStat(key) {
  await redis.incr(`stat:${key}`);
}

export async function getStat(key) {
  const val = await redis.get(`stat:${key}`);
  return parseInt(val) || 0;
}

// Health check
export async function ping() {
  await redis.ping();
}

export default redis;
