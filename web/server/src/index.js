import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { initStore, getStore } from "./store.js";
import { initSocket, getOnlineCount } from "./socket.js";
import { createLogger } from "./logger.js";

const logger = createLogger("server");
const PORT = process.env.PORT || 4000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 6 * 1024 * 1024,
  pingTimeout: 120000,   // 2 min — handles mobile network switches
  pingInterval: 30000,   // ping every 30s
  connectTimeout: 45000,
  transports: ["websocket", "polling"],
});

// CORS must be first — ensures headers on ALL responses including errors
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));
app.options("*", cors({ origin: "*" }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// ICE servers endpoint — provides STUN + TURN config to clients
app.get("/api/ice-servers", (req, res) => {
  res.json({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
      // Metered TURN
      {
        urls: "turn:a.relay.metered.ca:80",
        username: "cc70a4c28c13a5c8d3535194",
        credential: "9HU0i9bnPbBhNr2O",
      },
      {
        urls: "turn:a.relay.metered.ca:80?transport=tcp",
        username: "cc70a4c28c13a5c8d3535194",
        credential: "9HU0i9bnPbBhNr2O",
      },
      {
        urls: "turn:a.relay.metered.ca:443",
        username: "cc70a4c28c13a5c8d3535194",
        credential: "9HU0i9bnPbBhNr2O",
      },
      {
        urls: "turn:a.relay.metered.ca:443?transport=tcp",
        username: "cc70a4c28c13a5c8d3535194",
        credential: "9HU0i9bnPbBhNr2O",
      },
      // Backup TURN - numb.viagenie.ca (free, no auth)
      {
        urls: "turn:numb.viagenie.ca",
        username: "webrtc@live.com",
        credential: "muazkh",
      },
    ],
  });
});

app.get("/api/stats", async (req, res) => {
  try {
    const s = getStore();
    if (!s) {
      return res.json({ total_matches: 0, active_chats: 0, online: getOnlineCount(), timestamp: Date.now() });
    }
    const [total, active] = await Promise.all([
      s.getStat("total_matches").catch(() => 0),
      s.getStat("active_chats").catch(() => 0),
    ]);
    res.json({
      total_matches: total || 0,
      active_chats: active || 0,
      online: getOnlineCount(),
      timestamp: Date.now(),
    });
  } catch (err) {
    logger.error(`Stats error: ${err.message}`);
    res.json({ total_matches: 0, active_chats: 0, online: getOnlineCount(), timestamp: Date.now() });
  }
});

process.on("SIGTERM", () => { httpServer.close(() => process.exit(0)); });
process.on("SIGINT", () => { httpServer.close(() => process.exit(0)); });

async function boot() {
  try {
    await initStore();
    initSocket(io);
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (err) {
    logger.error(`Failed to start: ${err.message}`);
    process.exit(1);
  }
}

boot();
