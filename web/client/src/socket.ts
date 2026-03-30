import { io } from "socket.io-client";

const URL = import.meta.env.VITE_SOCKET_URL || "https://novachat-production-57d2.up.railway.app";

// On mobile networks, WebSocket is often blocked — start with polling then upgrade
const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

const socket = io(URL, {
  autoConnect: false,
  transports: isMobile ? ["polling", "websocket"] : ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
  timeout: 20000,
});

// Keep server alive — ping every 25 seconds
setInterval(() => {
  fetch(`${URL}/api/health`).catch(() => {});
}, 25000);

// On mobile, browser may kill the socket when tab goes to background.
// Reconnect as soon as the tab becomes visible again.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !socket.connected) {
    socket.connect();
  }
});

export default socket;
