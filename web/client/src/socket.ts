import { io } from "socket.io-client";

const URL = import.meta.env.VITE_SOCKET_URL || "https://novachat-production-57d2.up.railway.app";

const socket = io(URL, {
  autoConnect: true,          // connect immediately on load
  transports: ["polling", "websocket"], // start with polling (works on all networks), upgrade to WS
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
  timeout: 20000,
  upgrade: true,              // upgrade from polling to websocket when possible
});

// Keep Railway server alive — ping every 20 seconds
setInterval(() => {
  fetch(`${URL}/api/health`).catch(() => {});
}, 20000);

// Reconnect when tab becomes visible again (mobile backgrounding)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !socket.connected) {
    socket.connect();
  }
});

export default socket;
