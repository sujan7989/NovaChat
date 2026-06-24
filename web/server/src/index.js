import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { initStore, getStore } from "./store.js";
import { initSocket, getOnlineCount } from "./socket.js";
import { createLogger } from "./logger.js";
import { getPublicConfig } from "./config.js";
import healthMonitor from "./monitoring.js";

const logger = createLogger("server");
const PORT = process.env.PORT || 4000;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 6 * 1024 * 1024,
  pingTimeout: 20000,    // 20s — detect dead connections faster
  pingInterval: 15000,   // ping every 15s
  connectTimeout: 30000,
  transports: ["websocket", "polling"],
});

// CORS must be first — ensures headers on ALL responses including errors
app.use(cors({ origin: "*", methods: ["GET", "POST", "OPTIONS"] }));
app.options("*", cors({ origin: "*" }));
// helmet with relaxed CSP so Socket.IO and the SPA still work
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: "1mb" }));

// Rate limiting for public API endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", apiLimiter);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: Date.now() });
});

// Public config endpoint — exposes non-secret config for clients/tests
app.get("/api/config", (req, res) => {
  res.json(getPublicConfig());
});

// ICE servers endpoint — provides STUN + TURN config to clients
app.get("/api/ice-servers", async (req, res) => {
  // Use env var only — no hardcoded fallback key
  const meteredApiKey = process.env.METERED_API_KEY;
  if (meteredApiKey) {
    try {
      const r = await fetch(`https://novachat-app.metered.live/api/v1/turn/credentials?apiKey=${meteredApiKey}`);
      if (r.ok) {
        const servers = await r.json();
        return res.json({ iceServers: servers });
      }
    } catch {}
  }

  // Fallback to free open relay TURN servers
  res.json({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
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

// 404 handler for unknown API routes
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

process.on("SIGTERM", () => {
  healthMonitor.stop();
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  healthMonitor.stop();
  httpServer.close(() => process.exit(0));
});

// Prevent unhandled promise rejections from crashing the server
process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
});
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught exception: ${err.message}`);
});

async function boot() {
  try {
    await initStore();
    initSocket(io);
    healthMonitor.start();
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (err) {
    logger.error(`Failed to start: ${err.message}`);
    process.exit(1);
  }
}

boot();

export default app;
