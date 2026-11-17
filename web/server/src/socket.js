import { findOrQueue, disconnectUser } from "./matchmaking.js";
import { getStore } from "./store.js";
import { Filter } from "bad-words";
import { generateIcebreaker, summarizeConversation } from "./ai.js";
import {
  REPORT_BAN_THRESHOLD,
  MAX_IMAGE_BASE64,
  MESSAGE_RATE_LIMIT,
  MESSAGE_RATE_WINDOW
} from "./config.js";
import {
  validateFindPayload,
  validateMessagePayload,
  validateImagePayload,
  validateTypingPayload,
  validateWebRTCPayload,
  validateUserIdPayload,
  validateVideoChatMessagePayload
} from "./validation.js";
import { createLogger } from "./logger.js";

const logger = createLogger("socket");
const filter = new Filter();

const socketToUser = new Map(); // socketId → userId
const userToSocket = new Map(); // userId → socketId
const userPrefs    = new Map(); // userId → { gender, pref, interests, languages, vibes }

function makeRateLimiter() {
  let count = 0;
  let windowStart = Date.now();
  return function check() {
    const now = Date.now();
    if (now - windowStart > MESSAGE_RATE_WINDOW) { count = 0; windowStart = now; }
    count++;
    return count <= MESSAGE_RATE_LIMIT;
  };
}

let _io = null;

export function getOnlineCount() {
  return _io ? _io.sockets.sockets.size : 0;
}

export function getSocketStats() {
  return {
    totalSockets: _io ? _io.sockets.sockets.size : 0,
    mappedUsers: userToSocket.size,
    socketToUserMappings: socketToUser.size
  };
}

function broadcastOnlineCount() {
  if (_io) _io.emit("online_count", { count: getOnlineCount() });
}

// ─────────────────────────────────────────────────────────────────────────────
// doMatch: emit matched to both users, increment stat.
// ─────────────────────────────────────────────────────────────────────────────
async function doMatch(io, socketA, socketB, shared, partnerVibesForA, partnerVibesForB) {
  generateIcebreaker(shared, partnerVibesForA).then(icebreaker => {
    io.to(socketA).emit("matched", { shared, partnerVibes: partnerVibesForA, icebreaker });
    io.to(socketB).emit("matched", { shared, icebreaker });
  }).catch(() => {
    io.to(socketA).emit("matched", { shared, partnerVibes: partnerVibesForA });
    io.to(socketB).emit("matched", { shared });
  });
  await getStore().incrementStat("active_chats");
}

// ─────────────────────────────────────────────────────────────────────────────
// autoRequeue: after a pair breaks, immediately try to match the freed user.
// If no match yet, enqueue them and emit "queued".
// This is the key fix for the N-person problem — no manual clicking needed.
// ─────────────────────────────────────────────────────────────────────────────
async function autoRequeue(io, userId) {
  const ps = userToSocket.get(userId);
  if (!ps) return; // user offline

  const prefs = userPrefs.get(userId);
  if (!prefs) {
    io.to(ps).emit("queued");
    return;
  }

  try {
    const match = await findOrQueue(
      userId, prefs.gender, prefs.pref,
      prefs.interests, prefs.languages, prefs.vibes
    );
    if (match) {
      const rps = userToSocket.get(match.partnerId);
      if (rps) {
        await doMatch(io, ps, rps, match.shared, match.partnerVibes, []);
        logger.info(`Auto-rematch: ${userId} <-> ${match.partnerId}`);
      } else {
        // matched user's socket gone — undo and try again
        await getStore().removePair(userId);
        await getStore().enqueue(userId, prefs.gender, prefs.pref, prefs.interests, prefs.languages, prefs.vibes);
        io.to(ps).emit("queued");
      }
    } else {
      // in queue now, waiting
      io.to(ps).emit("queued");
    }
  } catch (err) {
    logger.error(`autoRequeue error for ${userId}: ${err.message}`);
    io.to(ps).emit("queued");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// breakPair: disconnect a user, notify their partner, auto-requeue partner.
// ─────────────────────────────────────────────────────────────────────────────
async function breakPair(io, userId, { requeueSelf = false } = {}) {
  const partnerId = await disconnectUser(userId);
  if (partnerId) {
    const ps = userToSocket.get(partnerId);
    if (ps) io.to(ps).emit("stranger_left");
    await getStore().decrementStat("active_chats").catch(() => {});
    // Immediately re-queue the freed partner — no manual click needed
    await autoRequeue(io, partnerId);
    logger.info(`breakPair: ${userId} freed ${partnerId}`);
  }
  if (requeueSelf) {
    await autoRequeue(io, userId);
  }
  return partnerId;
}

// ─────────────────────────────────────────────────────────────────────────────
export function initSocket(io) {
  _io = io;

  io.on("connection", (socket) => {
    logger.info(`Connected: ${socket.id}`);
    const msgRateOk = makeRateLimiter();
    broadcastOnlineCount();

    // ── find ────────────────────────────────────────────────────────────────
    socket.on("find", async (payload) => {
      const v = validateFindPayload(payload);
      if (v.error) { socket.emit("error_msg", { msg: v.error, details: v.details }); return; }

      const { userId, gender, pref, interests, languages, vibes } = v.data;

      // Clean up stale socket mapping from previous connection
      const prevSocket = userToSocket.get(userId);
      if (prevSocket && prevSocket !== socket.id) {
        socketToUser.delete(prevSocket);
      }

      socketToUser.set(socket.id, userId);
      userToSocket.set(userId, socket.id);
      userPrefs.set(userId, { gender, pref, interests, languages, vibes });
      logger.info(`Find: ${userId} (${gender}, pref=${pref})`);

      try {
        // Clear stale session if any
        const stale = await getStore().getPartner(userId);
        if (stale) {
          await disconnectUser(userId);
          logger.info(`Cleared stale session for ${userId}`);
        }

        const match = await findOrQueue(userId, gender, pref, interests, languages, vibes);
        if (match) {
          const ps = userToSocket.get(match.partnerId);
          if (ps) {
            await doMatch(io, socket.id, ps, match.shared, match.partnerVibes, []);
            logger.info(`Matched: ${userId} <-> ${match.partnerId}`);
          } else {
            // Ghost partner — undo and retry
            await getStore().removePair(userId);
            await getStore().removeFromQueue(userId);
            const rematch = await findOrQueue(userId, gender, pref, interests, languages, vibes);
            if (rematch) {
              const rps = userToSocket.get(rematch.partnerId);
              if (rps) {
                await doMatch(io, socket.id, rps, rematch.shared, rematch.partnerVibes, []);
                logger.info(`Rematch: ${userId} <-> ${rematch.partnerId}`);
              } else {
                await getStore().removePair(userId);
                await getStore().enqueue(userId, gender, pref, interests, languages, vibes);
                socket.emit("queued");
              }
            } else {
              socket.emit("queued");
            }
          }
        } else {
          socket.emit("queued");
        }
      } catch (err) {
        logger.error(`find error: ${err.message}`);
        socket.emit("error_msg", { msg: "Failed to find match" });
      }
    });

    // ── message ─────────────────────────────────────────────────────────────
    socket.on("message", async (payload) => {
      if (!msgRateOk()) { socket.emit("rate_limited", { msg: "Slow down!" }); return; }
      const v = validateMessagePayload(payload);
      if (v.error) return;
      const { userId, text } = v.data;

      let cleanText = text;
      let wasProfane = false;
      try {
        if (filter.isProfane(text)) { wasProfane = true; cleanText = filter.clean(text); }
      } catch {}
      if (wasProfane) socket.emit("moderation_warning", { msg: "⚠️ Message filtered." });

      try {
        const partnerId = await getStore().getPartner(userId);
        if (!partnerId) return;
        const ps = userToSocket.get(partnerId);
        if (ps) {
          io.to(ps).emit("message", { text: cleanText, from: "stranger" });
          socket.emit("message_delivered", { text });
        }
      } catch (err) { logger.error(`message error: ${err.message}`); }
    });

    // ── image ────────────────────────────────────────────────────────────────
    socket.on("image", async (payload) => {
      if (!msgRateOk()) { socket.emit("rate_limited", { msg: "Slow down!" }); return; }
      const v = validateImagePayload(payload);
      if (v.error) { socket.emit("error_msg", { msg: v.error }); return; }
      const { userId, dataUrl, caption } = v.data;
      if (dataUrl.length > MAX_IMAGE_BASE64) { socket.emit("error_msg", { msg: "Image too large (max 5MB)." }); return; }
      try {
        const partnerId = await getStore().getPartner(userId);
        if (!partnerId) return;
        const ps = userToSocket.get(partnerId);
        if (ps) io.to(ps).emit("image", { dataUrl, caption, from: "stranger" });
      } catch (err) { logger.error(`image error: ${err.message}`); }
    });

    // ── typing ───────────────────────────────────────────────────────────────
    socket.on("typing", async (payload) => {
      const v = validateTypingPayload(payload);
      if (v.error) return;
      const { userId, isTyping } = v.data;
      try {
        const partnerId = await getStore().getPartner(userId);
        if (!partnerId) return;
        const ps = userToSocket.get(partnerId);
        if (ps) io.to(ps).emit("typing", { isTyping });
      } catch (err) { logger.error(`typing error: ${err.message}`); }
    });

    // ── videochat:message ────────────────────────────────────────────────────
    socket.on("videochat:message", async (payload) => {
      if (!msgRateOk()) return;
      const v = validateVideoChatMessagePayload(payload);
      if (v.error) return;
      const { userId, text } = v.data;
      try {
        const partnerId = await getStore().getPartner(userId);
        if (!partnerId) return;
        const ps = userToSocket.get(partnerId);
        if (ps) io.to(ps).emit("videochat:message", { text });
      } catch (err) { logger.error(`videochat:message error: ${err.message}`); }
    });

    // ── videochat:typing ─────────────────────────────────────────────────────
    socket.on("videochat:typing", async (payload) => {
      if (!payload?.userId) return;
      try {
        const partnerId = await getStore().getPartner(payload.userId);
        if (!partnerId) return;
        const ps = userToSocket.get(partnerId);
        if (ps) io.to(ps).emit("videochat:typing", { isTyping: !!payload.isTyping });
      } catch {}
    });

    // ── webrtc:offer ─────────────────────────────────────────────────────────
    socket.on("webrtc:offer", async (payload) => {
      const v = validateWebRTCPayload(payload);
      if (v.error) return;
      const { userId, offer } = v.data;
      try {
        const partnerId = await getStore().getPartner(userId);
        if (!partnerId) return;
        const ps = userToSocket.get(partnerId);
        if (ps) io.to(ps).emit("webrtc:offer", { offer });
      } catch (err) { logger.error(`webrtc:offer error: ${err.message}`); }
    });

    // ── webrtc:answer ────────────────────────────────────────────────────────
    socket.on("webrtc:answer", async (payload) => {
      const v = validateWebRTCPayload(payload);
      if (v.error) return;
      const { userId, answer } = v.data;
      try {
        const partnerId = await getStore().getPartner(userId);
        if (!partnerId) return;
        const ps = userToSocket.get(partnerId);
        if (ps) io.to(ps).emit("webrtc:answer", { answer });
      } catch (err) { logger.error(`webrtc:answer error: ${err.message}`); }
    });

    // ── webrtc:ice ───────────────────────────────────────────────────────────
    socket.on("webrtc:ice", async (payload) => {
      const v = validateWebRTCPayload(payload);
      if (v.error) return;
      const { userId, candidate } = v.data;
      try {
        const partnerId = await getStore().getPartner(userId);
        if (!partnerId) return;
        const ps = userToSocket.get(partnerId);
        if (ps) io.to(ps).emit("webrtc:ice", { candidate });
      } catch (err) { logger.error(`webrtc:ice error: ${err.message}`); }
    });

    // ── webrtc:end ───────────────────────────────────────────────────────────
    socket.on("webrtc:end", async (payload) => {
      const v = validateUserIdPayload(payload);
      if (v.error) return;
      const { userId } = v.data;
      try {
        const partnerId = await getStore().getPartner(userId);
        if (!partnerId) return;
        const ps = userToSocket.get(partnerId);
        if (ps) io.to(ps).emit("webrtc:end");
      } catch (err) { logger.error(`webrtc:end error: ${err.message}`); }
    });

    // ── next ─────────────────────────────────────────────────────────────────
    // User presses "Next stranger": break current pair, requeue BOTH users.
    socket.on("next", async (payload) => {
      const v = validateFindPayload(payload);
      if (v.error) { socket.emit("error_msg", { msg: v.error }); return; }
      const { userId, gender, pref, interests, languages, vibes } = v.data;

      // Update prefs in case they changed
      userPrefs.set(userId, { gender, pref, interests, languages, vibes });

      try {
        // Break pair — partner gets stranger_left + auto-requeue
        await breakPair(io, userId, { requeueSelf: false });

        // Now queue self
        const match = await findOrQueue(userId, gender, pref, interests, languages, vibes);
        if (match) {
          const ps = userToSocket.get(match.partnerId);
          if (ps) {
            await doMatch(io, socket.id, ps, match.shared, match.partnerVibes, []);
            logger.info(`Next match: ${userId} <-> ${match.partnerId}`);
          } else {
            await getStore().removePair(userId);
            await getStore().enqueue(userId, gender, pref, interests, languages, vibes);
            socket.emit("queued");
          }
        } else {
          socket.emit("queued");
        }
      } catch (err) {
        logger.error(`next error: ${err.message}`);
        socket.emit("error_msg", { msg: "Failed to find new match" });
      }
    });

    // ── stop ─────────────────────────────────────────────────────────────────
    // User leaves chat entirely — break pair, requeue partner, don't requeue self.
    socket.on("stop", async (payload) => {
      const v = validateUserIdPayload(payload);
      if (v.error) return;
      const { userId } = v.data;
      try {
        await breakPair(io, userId, { requeueSelf: false });
        socket.emit("stopped");
      } catch (err) { logger.error(`stop error: ${err.message}`); }
    });

    // ── report ───────────────────────────────────────────────────────────────
    socket.on("report", async (payload) => {
      const v = validateUserIdPayload(payload);
      if (v.error) return;
      const { userId } = v.data;
      try {
        const s = getStore();
        const partnerId = await s.getPartner(userId);
        if (!partnerId) { socket.emit("error_msg", { msg: "No active chat to report" }); return; }

        await disconnectUser(userId);
        const count = await s.addReport(partnerId);
        await s.decrementStat("active_chats").catch(() => {});
        socket.emit("reported_ok");

        const ps = userToSocket.get(partnerId);
        if (ps) {
          if (count >= REPORT_BAN_THRESHOLD) {
            io.to(ps).emit("banned");
            logger.warn(`${partnerId} banned after ${count} reports`);
          } else {
            io.to(ps).emit("stranger_left");
            await autoRequeue(io, partnerId);
          }
        }
        logger.info(`${userId} reported ${partnerId} (count: ${count})`);
      } catch (err) { logger.error(`report error: ${err.message}`); }
    });

    // ── submit_for_summary ───────────────────────────────────────────────────
    socket.on("submit_for_summary", async (payload) => {
      if (!payload?.userId || !Array.isArray(payload.messages)) return;
      try {
        const summary = await summarizeConversation(payload.messages);
        if (summary) socket.emit("chat_summary", { summary });
      } catch {}
    });

    // ── rate_stranger ────────────────────────────────────────────────────────
    socket.on("rate_stranger", async (payload) => {
      if (!payload || typeof payload !== "object") return;
      const { userId, stars } = payload;
      if (!userId || typeof stars !== "number" || stars < 1 || stars > 5) return;
      try {
        const recentPartner = await getStore().getRecentPartner(userId).catch(() => null);
        if (recentPartner) {
          await getStore().addRating(userId, recentPartner, Math.round(stars));
          socket.emit("rating_saved");
        }
      } catch (err) { logger.error(`rate_stranger error: ${err.message}`); }
    });

    // ── disconnect ───────────────────────────────────────────────────────────
    socket.on("disconnect", async (reason) => {
      const userId = socketToUser.get(socket.id);
      if (userId) {
        if (userToSocket.get(userId) === socket.id) {
          userToSocket.delete(userId);
          try {
            // Break pair and auto-requeue partner
            await breakPair(io, userId, { requeueSelf: false });
          } catch (err) {
            logger.error(`disconnect cleanup error: ${err.message}`);
          }
        }
        socketToUser.delete(socket.id);
        userPrefs.delete(userId);
      }
      logger.info(`Disconnected: ${socket.id} (${reason})`);
      broadcastOnlineCount();
    });

    socket.on("error", (err) => {
      logger.error(`Socket error ${socket.id}: ${err.message}`);
    });
  });

  // Periodic cleanup every 2 minutes — remove dead socket mappings
  setInterval(async () => {
    try {
      const s = getStore();
      for (const [userId, socketId] of userToSocket.entries()) {
        if (!io.sockets.sockets.has(socketId)) {
          logger.info(`Cleanup: ghost mapping for ${userId}`);
          userToSocket.delete(userId);
          socketToUser.delete(socketId);
          userPrefs.delete(userId);
          await s.removeFromQueue(userId).catch(() => {});
        }
      }
    } catch (err) {
      logger.error(`Cleanup error: ${err.message}`);
    }
  }, 120_000);
}
