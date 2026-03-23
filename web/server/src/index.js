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
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/api/stats", async (req, res) => {
  try {
    const s = getStore();
    const [total, active] = await Promise.all([
      s.getStat("total_matches"),
      s.getStat("active_chats"),
    ]);
    res.json({
      total_matches: total || 0,
      active_chats: active || 0,
      online: getOnlineCount(),
      timestamp: Date.now(),
    });
  } catch (err) {
    logger.error(`Stats error: ${err.message}`);
    res.status(500).json({ error: "Stats unavailable" });
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
