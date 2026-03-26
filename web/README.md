# NovaChat — Anonymous Chat Platform

Live: [novachat-three.vercel.app](https://novachat-three.vercel.app)

## System Architecture

```
User (Browser)
    │
    ▼
Frontend (React + Vite) ── Vercel
    │  WebSocket (Socket.IO)
    ▼
Server (Node.js + Express) ── Railway
    │
    ├── Matchmaking Queue
    │       │
    │       ├── Score by: gender pref, language, interests, vibe
    │       └── Pair best match → create session
    │
    ├── Chat Relay
    │       ├── Text messages (moderated)
    │       ├── Image sharing
    │       ├── Typing indicators
    │       └── Delivered status
    │
    ├── WebRTC Signaling
    │       ├── Offer / Answer relay
    │       └── ICE candidate exchange
    │
    └── Redis (Upstash) ── Session store, queue, stats, ratings
```

## Features

- Anonymous text + image chat
- Live video calls (WebRTC)
- Smart matching (interests, language, vibe)
- AI content moderation (bad-words filter)
- Message delivered status (✓✓)
- Anonymous stranger rating (⭐)
- Gender preference matching
- Rate limiting + ban system

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Backend | Node.js, Express, Socket.IO |
| Database | Redis (Upstash) with in-memory fallback |
| Hosting | Vercel (client) + Railway (server) |
| Video | WebRTC (STUN servers) |

## Local Development

```bash
# Server
cd web/server
cp .env.example .env
node src/index.js

# Client
cd web/client
cp .env.example .env
npm run dev
```
