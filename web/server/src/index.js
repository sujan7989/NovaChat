import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { initStore, getStore, closeStore } from "./store.js";
import { initSocket, getOnlineCount } from "./socket.js";
import { createLogger } from "./logger.js";
import { getPublicConfig, SHUTDOWN_TIMEOUT } from "./config.js";
import healthMonitor from "./monitoring.js";

const logger = createLogger("server");
const PORT = process.env.PORT || 4000;

const app = express();
// Behind a reverse proxy (Railway / Vercel / nginx) — trust the first hop so
// req.ip and rate limiting use the real client address instead of the proxy's.
app.set("trust proxy", 1);

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

// Health check — registered before the rate limiter so platform probes
// (Railway / UptimeRobot) are never throttled.
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), timestamp: Date.now() });
});

// Rate limiting for public API endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api/", apiLimiter);

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

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received — graceful shutdown started`);
  healthMonitor.stop();

  // Hard deadline — never hang a deploy/restart.
  const forceExit = setTimeout(() => {
    logger.error("Shutdown timed out — forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);
  forceExit.unref();

  try {
    // Close Socket.IO (and the underlying HTTP server) — waits for active
    // connections to finish.
    await new Promise((resolve) => io.close(() => resolve()));
    await closeStore();
    clearTimeout(forceExit);
    logger.info("Shutdown complete");
    process.exit(0);
  } catch (err) {
    logger.error(`Shutdown error: ${err.message}`);
    process.exit(1);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Prevent unhandled promise rejections from crashing the server
process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled rejection: ${reason}`);
});
// An uncaught exception leaves the process in an undefined state — log it and
// shut down cleanly so the platform can restart a fresh instance.
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught exception: ${err.message}`);
  shutdown("uncaughtException");
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
