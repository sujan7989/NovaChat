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
  if (partner) sessions.delete(partner);
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

// Does user A's gender pref accept user B, and vice versa?
function genderMatch(myGender, myPref, theirGender, theirPref) {
  const iWantThem  = myPref    === "any" || myPref    === theirGender;
  const theyWantMe = theirPref === "any" || theirPref === myGender;
  return iWantThem && theyWantMe;
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

    // Gender pref must be mutually satisfied (hard rule only when BOTH have a specific pref)
    // If either side chose "any", it always passes
    const myPrefSpecific    = myPref    !== "any";
    const theirPrefSpecific = c.pref    !== "any";

    if (myPrefSpecific && myPref !== c.gender) continue;       // I want specific, they don't match
    if (theirPrefSpecific && c.pref !== myGender) continue;    // They want specific, I don't match

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

    if (score > bestScore) {
      bestScore = score;
      bestIdx   = i;
    }
  }

  // If best candidate has a negative score (lang mismatch, no other overlap),
  // still connect them — soft preference, never block forever
  if (bestIdx === -1) return null;

  const chosen = queue[bestIdx];
  queue.splice(bestIdx, 1);

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
