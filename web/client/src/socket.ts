import { io } from "socket.io-client";

/**
 * Backend origin. VITE_BACKEND_URL takes precedence over the legacy VITE_API_URL.
 *  - Production: see .env.production for the deployed API origin.
 *  - Development: leave unset — the Vite dev server proxies /api and /socket.io
 *    to the local backend, so same-origin works and no URL is hardcoded.
 */
export const API_URL: string | undefined =
  import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || undefined;

const socket = io(API_URL, {
  autoConnect: true,
  // Polling first (works everywhere), then upgrade to WebSocket.
  transports: ["polling", "websocket"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000, // Increased from 600ms for better stability on slow networks
  reconnectionDelayMax: 10000, // Increased from 4000ms to handle longer network outages
  timeout: 30000, // Increased from 20000ms for slower mobile networks
});

// #region debug-point C:socket-transport
const reportSocketDebug = (hypothesisId: string, msg: string, data: Record<string, unknown> = {}) => {
  if (typeof window === "undefined" || !["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
  void fetch("http://127.0.0.1:7777/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "socket-connection-issue", runId: "post-fix", hypothesisId, location: "web/client/src/socket.ts", msg: `[DEBUG] ${msg}`, data, ts: Date.now() }) }).catch(() => {});
};
socket.io.on("open", () => {
  const engine = socket.io.engine;
  reportSocketDebug("C", "engine opened", { transport: engine?.transport.name });
  engine?.on("upgrade", (transport) => reportSocketDebug("C", "socket transport upgraded", { transport: transport.name }));
});
socket.on("connect", () => reportSocketDebug("C", "socket connected", { transport: socket.io.engine?.transport.name }));
socket.on("connect_error", (error) => reportSocketDebug("C", "socket connect_error", { name: error.name, message: error.message }));
socket.on("disconnect", (reason) => reportSocketDebug("C", "socket disconnected", { reason }));
socket.io.on("reconnect_attempt", (attempt) => reportSocketDebug("C", "socket reconnect attempt", { attempt }));
socket.onAnyOutgoing((event) => { if (event === "find") reportSocketDebug("D", "matchmaking find emitted"); });
socket.on("queued", () => reportSocketDebug("D", "matchmaking queued"));
socket.on("matched", () => reportSocketDebug("D", "matchmaking matched"));
socket.on("error_msg", (error: { msg?: string }) => reportSocketDebug("D", "server rejected matchmaking event", { message: error.msg }));
// #endregion

// Reconnect promptly when a backgrounded tab becomes visible again (mobile).
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !socket.connected) {
      socket.connect();
    }
  });
}

/** Absolute URL for a REST endpoint served by the backend. */
export function apiUrl(path: string): string {
  return API_URL ? `${API_URL}${path}` : path;
}

export default socket;
