import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import swaggerUi from 'swagger-ui-express';
import swaggerDef from './swaggerDef.js';
import {
  PORT,
  CLIENT_URL,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  MAX_HTTP_BUFFER_SIZE,
  getPublicConfig,
  IS_PRODUCTION,
  SHUTDOWN_TIMEOUT
} from "./config.js";
import { initStore, getStore } from "./store.js";
import { initSocket, getOnlineCount, getSocketStats } from "./socket.js";
import { createLogger, requestLogger } from "./logger.js";
import healthMonitor from "./monitoring.js";

const logger = createLogger("server");

// CSRF protection middleware
function csrfProtection(req, res, next) {
  // Skip CSRF for GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for API docs and health endpoints
  if (req.path.startsWith('/api/docs') || req.path === '/api/health') {
    return next();
  }

  // Check Origin header for state-changing requests
  const origin = req.get('Origin');
  const referer = req.get('Referer');
  
  if (origin && !origin.includes(new URL(CLIENT_URL).hostname)) {
    logger.warn(`CSRF protection: Invalid origin ${origin} for ${req.method} ${req.path}`);
    return res.status(403).json({ error: 'Invalid origin' });
  }

  if (referer && !referer.includes(new URL(CLIENT_URL).hostname)) {
    logger.warn(`CSRF protection: Invalid referer ${referer} for ${req.method} ${req.path}`);
    return res.status(403).json({ error: 'Invalid referer' });
  }

  next();
}

async function validateStartup() {
  const checks = [];
  const errors = [];

  // Check Redis connection
  try {
    const store = getStore();
    // Only check Redis if store has ping method (Redis store)
    if (typeof store.ping === 'function') {
      await store.ping();
      checks.push({ name: "Redis", status: "ok" });
    } else {
      checks.push({ name: "Redis", status: "warning", error: "Using in-memory store" });
    }
  } catch (err) {
    if (IS_PRODUCTION) {
      checks.push({ name: "Redis", status: "error", error: err.message });
      errors.push(`Redis connection failed: ${err.message}`);
    } else {
      checks.push({ name: "Redis", status: "warning", error: "Redis unavailable, using in-memory store" });
    }
  }

  // Check required environment variables
  const requiredVars = [
    { name: "REDIS_URL", required: false }, // Has default
    { name: "CLIENT_URL", required: false }, // Has default
    { name: "JWT_SECRET", required: IS_PRODUCTION },
    { name: "BCRYPT_ROUNDS", required: false }, // Has default
  ];

  for (const { name, required } of requiredVars) {
    if (!process.env[name]) {
      if (required) {
        errors.push(`Missing required environment variable: ${name}`);
        checks.push({ name: `ENV ${name}`, status: "error", error: "Missing" });
      } else {
        checks.push({ name: `ENV ${name}`, status: "warning", error: "Using default" });
      }
    } else {
      checks.push({ name: `ENV ${name}`, status: "ok" });
    }
  }

  // Validate numeric environment variables
  const numericVars = [
    { name: "PORT", min: 1, max: 65535, default: 4000 },
    { name: "RATE_LIMIT_WINDOW_MS", min: 1000, max: 3600000, default: 60000 },
    { name: "RATE_LIMIT_MAX_REQUESTS", min: 1, max: 10000, default: 60 },
    { name: "MESSAGE_RATE_LIMIT", min: 1, max: 1000, default: 20 },
    { name: "MAX_MESSAGE_SIZE", min: 10, max: 10000, default: 500 },
    { name: "MAX_IMAGE_SIZE", min: 1024, max: 10485760, default: 5242880 },
    { name: "REPORT_BAN_THRESHOLD", min: 1, max: 100, default: 3 },
  ];

  for (const { name, min, max, default: defaultValue } of numericVars) {
    const value = process.env[name];
    if (!value) {
      checks.push({ name: `CONFIG ${name}`, status: "ok", value: defaultValue });
      continue;
    }

    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < min || parsed > max) {
      errors.push(`Invalid ${name}: must be between ${min} and ${max}`);
      checks.push({ name: `CONFIG ${name}`, status: "error", error: `Invalid: ${value}` });
    } else {
      checks.push({ name: `CONFIG ${name}`, status: "ok", value: parsed });
    }
  }

  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  if (majorVersion < 18) {
    errors.push(`Node.js version ${nodeVersion} is too old. Minimum required: v18.0.0`);
    checks.push({ name: "Node.js", status: "error", error: `Version ${nodeVersion} < v18.0.0` });
  } else {
    checks.push({ name: "Node.js", status: "ok", value: nodeVersion });
  }

  // Check available memory
  const memoryUsage = process.memoryUsage();
  const totalMemory = memoryUsage.heapTotal + memoryUsage.external;
  const maxMemory = 1024 * 1024 * 1024; // 1GB
  if (totalMemory > maxMemory) {
    checks.push({ name: "Memory", status: "warning", error: "High memory usage" });
  } else {
    checks.push({ name: "Memory", status: "ok", value: `${Math.round(totalMemory / 1024 / 1024)}MB` });
  }

  // Validate client URL format
  if (process.env.CLIENT_URL) {
    try {
      new URL(process.env.CLIENT_URL);
      checks.push({ name: "CLIENT_URL", status: "ok", value: process.env.CLIENT_URL });
    } catch (err) {
      errors.push(`Invalid CLIENT_URL format: ${err.message}`);
      checks.push({ name: "CLIENT_URL", status: "error", error: "Invalid URL format" });
    }
  }

  // Check if running in production with proper security
  if (IS_PRODUCTION) {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      errors.push("Production environment requires JWT_SECRET with at least 32 characters");
      checks.push({ name: "Security", status: "error", error: "Weak JWT secret" });
    } else {
      checks.push({ name: "Security", status: "ok" });
    }
  }

  if (errors.length > 0) {
    const errorSummary = errors.join('; ');
    throw new Error(`Startup validation failed: ${errorSummary}`);
  }

  return checks;
}

// ── Express Setup ─────────────────────────────────────────────────────────────
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_URL, methods: ["GET", "POST"], credentials: true },
  maxHttpBufferSize: MAX_HTTP_BUFFER_SIZE,
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", CLIENT_URL, 'ws:', 'wss:'],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: IS_PRODUCTION ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: IS_PRODUCTION ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: false,
  ieNoOpen: true,
  xssFilter: true,
}));

app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["X-Total-Count"],
  maxAge: 86400, // 24 hours
}));

app.use(express.json({ 
  limit: "1mb",
  strict: true,
  type: ['application/json', 'application/vnd.api+json']
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: "1mb",
  parameterLimit: 1000
}));

// Apply CSRF protection for state-changing requests
if (IS_PRODUCTION) {
  app.use(csrfProtection);
}

app.use(requestLogger((req, res, next) => {
  healthMonitor.recordRequest(req.path, res.statusCode);
  next();
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit exceeded for ${req.ip}`);
    res.status(429).json(options.message);
  }
});
app.use("/api", apiLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
/**
 * @swagger
 * /health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Get server health status
 *     description: Returns the current health status of the server and its dependencies
 *     responses:
 *       200:
 *         description: Health status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *       503:
 *         description: Service unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get("/api/health", async (req, res) => {
  try {
    const health = await healthMonitor.getDetailedHealth();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (err) {
    logger.error(`Health check failed: ${err.message}`);
    res.status(503).json({ status: "unhealthy", error: err.message });
  }
});

/**
 * @swagger
 * /stats:
 *   get:
 *     tags:
 *       - Stats
 *     summary: Get platform statistics
 *     description: Returns current platform statistics including matches and online users
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StatsResponse'
 *       500:
 *         description: Failed to retrieve statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get("/api/stats", async (req, res) => {
  try {
    const metrics = healthMonitor.getMetrics();
    const s = getStore();
    const [total, active, online] = await Promise.all([
      s.getStat("total_matches"),
      s.getStat("active_chats"),
      Promise.resolve(getOnlineCount())
    ]);

    res.json({
      total_matches: total || 0,
      active_chats: active || 0,
      online: online || 0,
      timestamp: Date.now(),
      metrics: {
        uptime: metrics.uptime,
        memoryUsage: metrics.memoryUsage,
        socketConnections: metrics.socketConnections,
        errorRate: metrics.errorRate
      }
    });
  } catch (err) {
    logger.error(`Stats endpoint error: ${err.message}`);
    res.status(500).json({ error: "Stats unavailable" });
  }
});

/**
 * @swagger
 * /config:
 *   get:
 *     tags:
 *       - Config
 *     summary: Get public configuration
 *     description: Returns public configuration settings (excludes sensitive data)
 *     responses:
 *       200:
 *         description: Configuration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ConfigResponse'
 */
app.get("/api/config", (req, res) => {
  res.json(getPublicConfig());
});

// ── API Documentation ─────────────────────────────────────────────────────────
app.use('/api/docs', swaggerUi.serve);
app.get('/api/docs', swaggerUi.setup(swaggerDef, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'NovaChat API Documentation'
}));

app.get('/api/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerDef.definition);
});

// ── Error Handling ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  healthMonitor.recordError(err, { endpoint: req.path, method: req.method });
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({
    error: IS_PRODUCTION ? "Internal server error" : err.message,
    ...(IS_PRODUCTION ? {} : { stack: err.stack })
  });
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully...`);
  
  healthMonitor.stop();

  httpServer.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });

  setTimeout(() => {
    logger.error(`Forced exit after ${SHUTDOWN_TIMEOUT}ms timeout`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("uncaughtException", (err) => {
  logger.error(`Uncaught exception: ${err.message}`, { stack: err.stack });
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error(`Unhandled rejection at: ${promise}`, { reason });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  try {
    logger.info("Starting NovaChat server...", getPublicConfig());

    await initStore();
    const checks = await validateStartup();
    logger.info("Startup validation passed", { checks });

    initSocket(io);
    healthMonitor.start();

    httpServer.listen(PORT, () => {
      logger.info(`NovaChat server running on http://localhost:${PORT}`);
      logger.info(`Client expected at: ${CLIENT_URL}`);
      logger.info(`API docs available at http://localhost:${PORT}/api/docs`);
    });
  } catch (err) {
    logger.error(`Failed to start NovaChat server: ${err.message}`);
    process.exit(1);
  }
}

boot();
