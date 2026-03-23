import { io } from "socket.io-client";

// In production, connect to the deployed server URL
// In dev, use Vite proxy (relative "/")
const URL = import.meta.env.VITE_SOCKET_URL || "/";

const socket = io(URL, { autoConnect: false });
export default socket;
