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
  reconnectionDelay: 600,
  reconnectionDelayMax: 4000,
  timeout: 20000,
});

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
