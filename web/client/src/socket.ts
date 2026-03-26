import { io } from "socket.io-client";

const URL = import.meta.env.VITE_SOCKET_URL || "https://novachat-production-57d2.up.railway.app";

const socket = io(URL, {
  autoConnect: false,
  transports: ["websocket", "polling"], // fallback to polling on bad networks
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

export default socket;
