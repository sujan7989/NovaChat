import { findOrQueue, disconnectUser } from "./matchmaking.js";
import { getStore } from "./store.js";
import {
  REPORT_BAN_THRESHOLD,
  MAX_MESSAGE_SIZE,
  MAX_IMAGE_BASE64,
  MAX_CAPTION_LENGTH,
  MESSAGE_RATE_LIMIT,
  MESSAGE_RATE_WINDOW,
  isValidUserId,
  isValidDataUrl,
  sanitizeString
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

const socketToUser = new Map();
const userToSocket = new Map();

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
let onlineChatters = new Set(); // Track users actually chatting

export function getOnlineCount() {
  return onlineChatters.size; // Only count users actually chatting
}

export function getSocketStats() {
  return {
    totalSockets: _io ? _io.sockets.sockets.size : 0,
    mappedUsers: userToSocket.size,
    socketToUserMappings: socketToUser.size
  };
}

export function initSocket(io) {
  _io = io;
  io.on("connection", (socket) => {
    logger.info(`Connected: ${socket.id} from ${socket.handshake.address}`);
    const msgRateOk = makeRateLimiter();

    socket.emit("online_count", { count: onlineChatters.size });
    socket.broadcast.emit("online_count", { count: onlineChatters.size });

    socket.on("find", async (payload) => {
      const validation = validateFindPayload(payload);
      if (validation.error) {
        logger.warn(`Invalid find payload from ${socket.id}: ${validation.error}`);
        socket.emit("error_msg", { msg: validation.error, details: validation.details });
        return;
      }

      const { userId, gender, pref, interests, languages, vibes } = validation.data;

      // Add user to online chatters when they start finding a match
      onlineChatters.add(userId);
      socketToUser.set(socket.id, userId);
      userToSocket.set(userId, socket.id);
      logger.info(`Find request: ${userId} (gender=${gender}, pref=${pref})`);

      try {
        const match = await findOrQueue(userId, gender, pref, interests, languages, vibes);
        if (match) {
          const partnerSocket = userToSocket.get(match.partnerId);
          if (partnerSocket) {
            socket.emit("matched", { shared: match.shared, partnerVibes: match.partnerVibes });
            io.to(partnerSocket).emit("matched", { shared: match.shared });
            await getStore().incrementStat("active_chats");
            logger.info(`Match created: ${userId} <-> ${match.partnerId}`);
          } else {
            await getStore().removePair(userId);
            await getStore().enqueue(userId, gender, pref, interests, languages, vibes);
            socket.emit("queued");
            logger.warn(`Partner socket not found for ${match.partnerId}, requeued ${userId}`);
          }
        } else {
          socket.emit("queued");
        }
      } catch (err) {
        logger.error(`Error in find handler: ${err.message}`);
        socket.emit("error_msg", { msg: "Failed to find match" });
      }
    });

    socket.on("message", async (payload) => {
      if (!msgRateOk()) {
        socket.emit("rate_limited", { msg: "Slow down!" });
        return;
      }

      const validation = validateMessagePayload(payload);
      if (validation.error) {
        logger.warn(`Invalid message payload from ${socket.id}: ${validation.error}`);
        return;
      }

      const { userId, text } = validation.data;

      try {
        const partnerId = await getStore().getPartner(userId);
        if (!partnerId) return;

        const ps = userToSocket.get(partnerId);
        if (ps) io.to(ps).emit("message", { text, from: "stranger" });
      } catch (err) {
        logger.error(`Error in message handler: ${err.message}`);
      }
    });

    socket.on("image", async (payload) => {
      if (!msgRateOk()) {
        socket.emit("rate_limited", { msg: "Slow down!" });
        return;
      }

      const validation = validateImagePayload(payload);
      if (validation.error) {
        logger.warn(`Invalid image payload from ${socket.id}: ${validation.error}`);
        socket.emit("error_msg", { msg: validation.error, details: validation.details });
        return;
      }

      const { userId, dataUrl, caption } = validation.data;

      if (dataUrl.length > MAX_IMAGE_BASE64) {
        socket.emit("error_msg", { msg: "Image too large (max 5MB)." });
        return;
      }

      try {
        const partnerId = await getStore().getPartner(userId);
        if (!partnerId) return;

        const ps = userToSocket.get(partnerId);
        if (ps) io.to(ps).emit("image", { dataUrl, caption, from: "stranger" });
      } catch (err) {
        logger.error(`Error in image handler: ${err.message}`);
      }
    });

    socket.on("typing", async (payload) => {
      const validation = validateTypingPayload(payload);
      if (validation.error) return;

      const { userId, isTyping } = validation.data;

      try {
        const partnerId = await getStore().getPartner(userId);
        if (!partnerId) return;

        const ps = userToSocket.get(partnerId);
        if (ps) io.to(ps).emit("typing", { isTyping });
      } catch (err) {
        logger.error(`Error in typing handler: ${err.message}`);
      }
    });

    socket.on("videochat:message", async (payload) => {
      if (!msgRateOk()) return;

      const validation = validateVideoChatMessagePayload(payload);
      if (validation.error) return;

      const { userId, text } = validation.data;

      try {
        const partnerId = await getStore().getPartner(userId);
        if (!partnerId) return;

        const ps = userToSocket.get(partnerId);
        if (ps) io.to(ps).emit("videochat:message", { text });
      } catch (err) {
        logger.error(`Error in videochat message handler: ${err.message}`);
      }
    });

    socket.on("webrtc:offer", async (payload) => {
      const validation = validateWebRTCPayload(payload);
      if (validation.error) return;

      const { userId, offer } = validation.data;

      try {
        const partnerId = await getStore().getPartner(userId);
        if (!partnerId) return;

        const ps = userToSocket.get(partnerId);
        if (ps) io.to(ps).emit("webrtc:offer", { offer });
      } catch (err) {
        logger.error(`Error in webrtc offer handler: ${err.message}`);
      }
    });

    socket.on("webrtc:answer", async (payload) => {
      const validation = validateWebRTCPayload(payload);
      if (validation.error) return;

      const { userId, answer } = validation.data;

      try {
        const partnerId = await getStore().getPartner(userId);
        if (!partnerId) return;

        const ps = userToSocket.get(partnerId);
        if (ps) io.to(ps).emit("webrtc:answer", { answer });
      } catch (err) {
        logger.error(`Error in webrtc answer handler: ${err.message}`);
      }
    });

    socket.on("webrtc:ice", async (payload) => {
      const validation = validateWebRTCPayload(payload);
      if (validation.error) return;

      const { userId, candidate } = validation.data;

      try {
        const partnerId = await getStore().getPartner(userId);
        if (!partnerId) return;

        const ps = userToSocket.get(partnerId);
        if (ps) io.to(ps).emit("webrtc:ice", { candidate });
      } catch (err) {
        logger.error(`Error in webrtc ice handler: ${err.message}`);
      }
    });

    socket.on("webrtc:end", async (payload) => {
      const validation = validateUserIdPayload(payload);
      if (validation.error) return;

      const { userId } = validation.data;

      try {
        const partnerId = await getStore().getPartner(userId);
        if (!partnerId) return;

        const ps = userToSocket.get(partnerId);
        if (ps) io.to(ps).emit("webrtc:end");
      } catch (err) {
        logger.error(`Error in webrtc end handler: ${err.message}`);
      }
    });

    socket.on("next", async (payload) => {
      const validation = validateFindPayload(payload);
      if (validation.error) {
        logger.warn(`Invalid next payload from ${socket.id}: ${validation.error}`);
        socket.emit("error_msg", { msg: validation.error });
        return;
      }

      const { userId, gender, pref, interests, languages, vibes } = validation.data;

      try {
        const partnerId = await disconnectUser(userId);
        if (partnerId) {
          const ps = userToSocket.get(partnerId);
          if (ps) io.to(ps).emit("stranger_left");
          logger.info(`User ${userId} skipped, notified ${partnerId}`);
        }

        const match = await findOrQueue(userId, gender, pref, interests, languages, vibes);
        if (match) {
          const ps = userToSocket.get(match.partnerId);
          if (ps) {
            socket.emit("matched", { shared: match.shared, partnerVibes: match.partnerVibes });
            io.to(ps).emit("matched", { shared: match.shared });
          }
        } else {
          socket.emit("queued");
        }
      } catch (err) {
        logger.error(`Error in next handler: ${err.message}`);
        socket.emit("error_msg", { msg: "Failed to find new match" });
      }
    });

    socket.on("stop", async (payload) => {
      const validation = validateUserIdPayload(payload);
      if (validation.error) {
        logger.warn(`Invalid stop payload from ${socket.id}: ${validation.error}`);
        return;
      }

      const { userId } = validation.data;

      try {
        const partnerId = await disconnectUser(userId);
        if (partnerId) {
          const ps = userToSocket.get(partnerId);
          if (ps) io.to(ps).emit("stranger_left");
          logger.info(`User ${userId} stopped chat with ${partnerId}`);
        }
        // Remove user from online chatters when they stop chatting
        onlineChatters.delete(userId);
        socket.emit("stopped");
      } catch (err) {
        logger.error(`Error in stop handler: ${err.message}`);
      }
    });

    socket.on("report", async (payload) => {
      const validation = validateUserIdPayload(payload);
      if (validation.error) {
        logger.warn(`Invalid report payload from ${socket.id}: ${validation.error}`);
        return;
      }

      const { userId } = validation.data;

      try {
        const s = getStore();
        const partnerId = await s.getPartner(userId);
        if (!partnerId) {
          socket.emit("error_msg", { msg: "No active chat to report" });
          return;
        }

        await disconnectUser(userId);
        const count = await s.addReport(partnerId);
        socket.emit("reported_ok");

        const ps = userToSocket.get(partnerId);
        if (ps) {
          io.to(ps).emit("stranger_left");
          if (count >= REPORT_BAN_THRESHOLD) {
            io.to(ps).emit("banned");
            logger.warn(`User ${partnerId} banned after ${count} reports`);
          }
        }

        logger.info(`User ${userId} reported ${partnerId} (report count: ${count})`);
      } catch (err) {
        logger.error(`Error in report handler: ${err.message}`);
      }
    });

    socket.on("disconnect", async (reason) => {
      const userId = socketToUser.get(socket.id);
      if (userId) {
        // Remove user from online chatters when they disconnect
        onlineChatters.delete(userId);
        
        try {
          const partnerId = await disconnectUser(userId);
          if (partnerId) {
            const ps = userToSocket.get(partnerId);
            if (ps) io.to(ps).emit("stranger_left");
          }
        } catch (err) {
          logger.error(`Error during disconnect cleanup: ${err.message}`);
        }

        socketToUser.delete(socket.id);
        userToSocket.delete(userId);
      }
      logger.info(`Disconnected: ${socket.id} (reason: ${reason})`);
      io.emit("online_count", { count: onlineChatters.size });
    });

    socket.on("error", (err) => {
      logger.error(`Socket error for ${socket.id}: ${err.message}`);
    });
  });
}
