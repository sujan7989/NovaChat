import { io } from "socket.io-client";

const URL = import.meta.env.VITE_SOCKET_URL || "https://novachat-production-57d2.up.railway.app";

const socket = io(URL, { autoConnect: false });
export default socket;
