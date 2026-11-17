/**
 * In-memory store — drop-in fallback when Redis isn't available.
 *
 * Matching priority (soft preferences — always fallback to random):
 *   Tier 1: gender pref match + language overlap + interest/vibe overlap
 *   Tier 2: gender pref match + language overlap
 *   Tier 3: gender pref match only
 *   Tier 4: anyone in queue (random fallback)
 */

const sessions = new Map();
const queue    = [];
const reports  = new Map();
const stats    = new Map();
const recentPartners = new Map();

export async function setPair(userA, userB) {
  sessions.set(String(userA), String(userB));
  sessions.set(String(userB), String(userA));
}

export async function getPartner(userId) {
  return sessions.get(String(userId)) || null;
}

export async function removePair(userId) {
  const partner = sessions.get(String(userId));
  sessions.delete(String(userId));
  if (partner) {
    sessions.delete(partner);
    // Remember recent partner for rating
    recentPartners.set(String(userId), partner);
    recentPartners.set(partner, String(userId));
  }
  return partner || null;
}

export async function enqueue(userId, gender, pref, interests, languages, vibes) {
  const already = queue.findIndex(e => e.userId === String(userId));
  if (already !== -1) queue.splice(already, 1);
  queue.push({
    userId:    String(userId),
    gender:    gender    || "other",
    pref:      pref      || "any",
    interests: interests || [],
    languages: languages || [],
    vibes:     vibes     || [],
    ts:        Date.now(),
  });
}

function hasOverlap(a, b) {
  if (!a.length || !b.length) return false;
  return a.some(x => b.includes(x));
}

export async function dequeueMatch(userId, myGender, myPref, myInterests, myLanguages, myVibes) {
  const me = String(userId);
  const myLangs  = myLanguages || [];
  const myInts   = myInterests || [];
  const myVbs    = myVibes     || [];

  console.log("[DEBUG] dequeueMatch called:", { userId, myGender, myPref, queueLength: queue.length, queue: queue.map(q => ({ userId: q.userId, gender: q.gender, pref: q.pref })) });

  // Remove stale entries (older than 5 minutes)
  const now = Date.now();
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].ts && now - queue[i].ts > 300000) queue.splice(i, 1);
  }

  // Score each candidate — higher = better match
  let bestIdx   = -1;
  let bestScore = -1;

  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    if (c.userId === me) continue;

    console.log("[DEBUG] Checking candidate:", { candidate: c.userId, candidateGender: c.gender, candidatePref: c.pref, myGender, myPref });

    // Gender pref matching logic:
    // - If I want "any", I match with anyone
    // - If I want specific (male/female), they must match my preference
    // - If they want "any", they match with anyone
    // - If they want specific (male/female), I must match their preference
    const myPrefSpecific    = myPref    !== "any";
    const theirPrefSpecific = c.pref    !== "any";

    // Check if I'm compatible with them based on my preference
    if (myPrefSpecific && myPref !== c.gender) {
      console.log("[DEBUG] Skipped: my pref specific and doesn't match candidate gender");
      continue;  // I want specific, they don't match
    }

    // Check if they're compatible with me based on their preference
    if (theirPrefSpecific && c.pref !== myGender) {
      console.log("[DEBUG] Skipped: their pref specific and I don't match their preference");
      continue;  // They want specific, I don't match
    }

    let score = 1; // base: gender pref compatible

    // Language overlap bonus
    const langOverlap = hasOverlap(myLangs, c.languages);
    if (langOverlap) score += 10;
    else if (myLangs.length > 0 && c.languages.length > 0) score -= 5; // both have langs but no overlap — penalise

    // Interest overlap bonus
    const sharedInterests = myInts.filter(x => c.interests.includes(x));
    score += sharedInterests.length * 3;

    // Vibe overlap bonus
    const vibeOverlap = hasOverlap(myVbs, c.vibes);
    if (vibeOverlap) score += 4;

    console.log("[DEBUG] Candidate score:", { candidate: c.userId, score });

    if (score > bestScore) {
      bestScore = score;
      bestIdx   = i;
    }
  }

  // If no match found in queue, return null
  if (bestIdx === -1) {
    console.log("[DEBUG] No match found in queue");
    return null;
  }

  const chosen = queue[bestIdx];
  queue.splice(bestIdx, 1);

  console.log("[DEBUG] Match found:", { partnerId: chosen.userId, partnerGender: chosen.gender, partnerPref: chosen.pref });

  const shared = myInts.filter(x => chosen.interests.includes(x));
  return { partnerId: chosen.userId, shared, partnerVibes: chosen.vibes || [] };
}

export async function removeFromQueue(userId) {
  const idx = queue.findIndex(e => e.userId === String(userId));
  if (idx !== -1) queue.splice(idx, 1);
}

export async function addReport(userId) {
  const count = (reports.get(String(userId)) || 0) + 1;
  reports.set(String(userId), count);
  return count;
}

export async function getReportCount(userId) {
  return reports.get(String(userId)) || 0;
}

export async function incrementStat(key) {
  stats.set(key, (stats.get(key) || 0) + 1);
}

export async function getStat(key) {
  return stats.get(key) || 0;
}

export async function decrementStat(key) {
  const cur = stats.get(key) || 0;
  if (cur > 0) stats.set(key, cur - 1);
}

export async function ping() {
  // In-memory store is always available
  return true;
}

/** No resources to release for the in-memory store. */
export async function close() {
  return true;
}

// ── Rating system ──────────────────────────────────────────────────────────
const ratings = [];

export async function addRating(fromUserId, toUserId, stars) {
  ratings.push({ fromUserId, toUserId, stars, ts: Date.now() });
  // Keep only last 1000 ratings in memory
  if (ratings.length > 1000) ratings.shift();
}

export async function getAverageRating(userId) {
  const userRatings = ratings.filter(r => r.toUserId === userId);
  if (!userRatings.length) return null;
  return userRatings.reduce((sum, r) => sum + r.stars, 0) / userRatings.length;
}

export async function getRecentPartner(userId) {
  return recentPartners.get(String(userId)) || null;
}
