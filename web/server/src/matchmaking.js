import { getStore } from "./store.js";

export async function findOrQueue(userId, gender, pref, interests, languages, vibes) {
  const s = getStore();
  const existing = await s.getPartner(userId);
  if (existing) return null;

  const match = await s.dequeueMatch(userId, gender, pref, interests, languages);
  if (match) {
    await s.setPair(userId, match.partnerId);
    await s.incrementStat("total_matches");
    return match;
  }

  await s.enqueue(userId, gender, pref, interests, languages, vibes);
  return null;
}

export async function disconnectUser(userId) {
  const s = getStore();
  const partner = await s.removePair(userId);
  await s.removeFromQueue(userId);
  return partner;
}
