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
app.get("/api/ice-servers", async (req, res) => {
  // Try to get fresh credentials from Metered API if key is configured
  const meteredApiKey = process.env.METERED_API_KEY;
  if (meteredApiKey) {
    try {
      const r = await fetch(`https://novachat.metered.live/api/v1/turn/credentials?apiKey=${meteredApiKey}`);
      if (r.ok) {
        const servers = await r.json();
        return res.json({ iceServers: servers });
      }
    } catch {}
  }

  // Fallback: OpenRelay (free, no account, reliable) + Google STUN
  res.json({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      // OpenRelay — free TURN, no credentials needed, maintained by Metered
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:80?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
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
