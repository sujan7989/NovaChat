import { io } from "socket.io-client";

const URL = import.meta.env.VITE_SOCKET_URL || "https://novachat-production-57d2.up.railway.app";

// On mobile networks, WebSocket is often blocked — start with polling then upgrade
const isMobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

const socket = io(URL, {
  autoConnect: false,
  transports: isMobile ? ["polling", "websocket"] : ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 8000,
  timeout: 30000,
});

// Keep server alive — ping every 25 seconds
setInterval(() => {
  fetch(`${URL}/api/health`).catch(() => {});
}, 25000);

export default socket;
