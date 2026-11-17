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
  pingTimeout: 25000,    // Increased to 25s for better video call stability on slow networks
  pingInterval: 10000,   // Reduced to 10s for faster dead connection detection
  connectTimeout: 45000, // Increased to 45s for slower mobile networks
  transports: ["websocket", "polling"],
  // Allow more connections per IP for better video call support
  allowUpgrades: true,
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

// ICE servers endpoint — provides STUN + TURN config to clients.
// Priority: Metered (METERED_API_KEY) → Xirsys (XIRSYS_IDENT) → free public fallback.
// The free fallback uses multiple providers so if one is down others cover it.
const ICE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — short cache so config changes apply fast
let iceCache = { at: 0, servers: null };

// Real Metered TURN credentials — used when no managed API key is set.
// These are static credentials from the novachat-2026 Metered workspace.
const FREE_ICE_FALLBACK = [
  { urls: "stun:stun.relay.metered.ca:80" },
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "turn:global.relay.metered.ca:80",                 username: "93c7303126b0252c421f26df", credential: "o0dyuZ/1paS5QxsR" },
  { urls: "turn:global.relay.metered.ca:80?transport=tcp",   username: "93c7303126b0252c421f26df", credential: "o0dyuZ/1paS5QxsR" },
  { urls: "turn:global.relay.metered.ca:443",                username: "93c7303126b0252c421f26df", credential: "o0dyuZ/1paS5QxsR" },
  { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: "93c7303126b0252c421f26df", credential: "o0dyuZ/1paS5QxsR" },
];

async function fetchMeteredIceServers() {
  const apiKey = process.env.METERED_API_KEY;
  if (!apiKey) return null;
  const appName = process.env.METERED_APP_NAME || "novachat-2026";
  // Do NOT pass a region — use global anycast which auto-routes to nearest server.
  // A fixed region (e.g. india) pins all traffic to one datacenter which can fail.
  const url = `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const servers = await r.json();
    return Array.isArray(servers) && servers.length ? servers : null;
  } catch {
    return null;
  }
}

async function fetchXirsysIceServers() {
  const ident  = process.env.XIRSYS_IDENT;
  const secret = process.env.XIRSYS_SECRET;
  const channel = process.env.XIRSYS_CHANNEL || "novachat";
  if (!ident || !secret) return null;
  try {
    const auth = Buffer.from(`${ident}:${secret}`).toString("base64");
    const r = await fetch(`https://global.xirsys.net/_turn/${channel}`, {
      method: "PUT",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ format: "urls" }),
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data?.v?.iceServers ?? null;
  } catch {
    return null;
  }
}

app.get("/api/ice-servers", async (req, res) => {
  if (iceCache.servers && Date.now() - iceCache.at < ICE_CACHE_TTL_MS) {
    return res.json({ iceServers: iceCache.servers });
  }

  const metered = await fetchMeteredIceServers();
  if (metered) {
    iceCache = { at: Date.now(), servers: metered };
    logger.info("ICE: serving Metered managed credentials");
    return res.json({ iceServers: metered });
  }

  const xirsys = await fetchXirsysIceServers();
  if (xirsys) {
    iceCache = { at: Date.now(), servers: xirsys };
    logger.info("ICE: serving Xirsys credentials");
    return res.json({ iceServers: xirsys });
  }

  logger.info("ICE: serving free public fallback servers");
  res.json({ iceServers: FREE_ICE_FALLBACK });
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

    // Keep-alive self-ping — prevents Render free tier from spinning down.
    // Pings /api/health every 14 minutes; harmless on paid plans.
    const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.CLIENT_URL?.replace(/\/+$/, "").replace("vercel.app", "onrender.com");
    if (process.env.NODE_ENV === "production" && selfUrl) {
      setInterval(async () => {
        try {
          const target = selfUrl.includes("onrender.com")
            ? selfUrl
            : `http://localhost:${PORT}`;
          await fetch(`${target}/api/health`);
          logger.info("Keep-alive ping sent");
        } catch {
          /* ignore */
        }
      }, 14 * 60 * 1000); // 14 minutes
    }
  } catch (err) {
    logger.error(`Failed to start: ${err.message}`);
    process.exit(1);
  }
}

boot();

export default app;
