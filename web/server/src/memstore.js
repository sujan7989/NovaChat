/**
 * In-memory store — drop-in fallback when Redis isn't available.
 */

const sessions = new Map();   // userId -> partnerId
const queue = [];             // [{userId, gender, pref, interests}]
const reports = new Map();    // userId -> count
const stats = new Map();      // key -> count

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
  queue.push({ userId: String(userId), gender, pref, interests: interests || [], languages: languages || [], vibes: vibes || [] });
}

/**
 * Mutual preference check:
 *   - I want to talk to someone of `myPref` gender (or "any")
 *   - They want to talk to someone of `theirPref` gender (or "any")
 * Both sides must be satisfied.
 */
function prefsMatch(myGender, myPref, theirGender, theirPref) {
  const iWantThem = myPref === "any" || myPref === theirGender;
  const theyWantMe = theirPref === "any" || theirPref === myGender;
  return iWantThem && theyWantMe;
}

export async function dequeueMatch(userId, myGender, myPref, myInterests, myLanguages) {
  for (let i = 0; i < queue.length; i++) {
    const candidate = queue[i];
    if (candidate.userId === String(userId)) continue;
    if (!prefsMatch(myGender, myPref, candidate.gender, candidate.pref)) continue;

    // Language filter: block only if BOTH sides have languages AND no overlap
    const myLangs = myLanguages || [];
    const theirLangs = candidate.languages || [];
    if (myLangs.length > 0 && theirLangs.length > 0) {
      const overlap = myLangs.some(l => theirLangs.includes(l));
      if (!overlap) continue;
    }

    queue.splice(i, 1);
    const shared = (myInterests || []).filter(x => (candidate.interests || []).includes(x));
    return { partnerId: candidate.userId, shared, partnerVibes: candidate.vibes || [] };
  }
  return null;
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
