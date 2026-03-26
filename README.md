# 👻 NovaChat — Anonymous Chat Platform

> Meet strangers. No account. No name. Just connections.

**Live:** [novachat-three.vercel.app](https://novachat-three.vercel.app)

---

## What is NovaChat?

NovaChat is a modern anonymous chat platform where you can instantly connect with strangers worldwide. No sign-up, no identity — just open the app and start chatting. Supports text, images, and live video calls.

---

## Features

| Feature | Description |
|---|---|
| 💬 Text Chat | Real-time anonymous messaging |
| 🖼️ Image Sharing | Send photos directly in chat |
| 🔴 Live Video | WebRTC peer-to-peer video calls |
| 🎯 Smart Matching | Match by interests, language, vibe |
| 🤖 AI Icebreaker | AI generates opening questions on match |
| 📝 Chat Summary | AI summarizes your conversation after it ends |
| ⭐ Anonymous Rating | Rate strangers after each chat |
| 🛡️ AI Moderation | Bad-words filter blocks toxic messages |
| ✓✓ Delivered Status | See when your message is delivered |
| 🔔 Sound Alerts | Audio ping on new message |
| 🚩 Report System | Report + auto-ban abusive users |

---

## System Architecture

```
User (Browser)
      │
      ▼
┌─────────────────────┐
│  Frontend           │  React 19 + TypeScript + Vite
│  Vercel CDN         │  Tailwind CSS v4
└────────┬────────────┘
         │ WebSocket (Socket.IO)
         ▼
┌─────────────────────┐
│  Backend Server     │  Node.js + Express
│  Railway            │  Socket.IO
└────────┬────────────┘
         │
    ┌────┴─────────────────────────┐
    │                              │
    ▼                              ▼
┌──────────────┐         ┌──────────────────┐
│  Matchmaking │         │  WebRTC Signaling │
│  Queue       │         │  Offer/Answer/ICE │
│              │         └──────────────────┘
│  Score by:   │
│  - Gender    │         ┌──────────────────┐
│  - Language  │         │  AI Service      │
│  - Interests │         │  Groq (llama3)   │
│  - Vibe      │         │  - Icebreakers   │
└──────┬───────┘         │  - Summaries     │
       │                 └──────────────────┘
       ▼
┌─────────────────────┐
│  Redis (Upstash)    │  Sessions, Queue,
│                     │  Stats, Ratings
└─────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Backend | Node.js, Express, Socket.IO |
| Database | Redis (Upstash) + in-memory fallback |
| AI | Groq API (llama3-8b-8192) |
| Video | WebRTC (STUN servers) |
| Hosting | Vercel (client) + Railway (server) |

---

## Project Structure

```
novachat/
├── web/
│   ├── client/                 # React frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Landing.tsx     # Home page
│   │   │   │   ├── Setup.tsx       # Preference setup (4 steps)
│   │   │   │   ├── Chat.tsx        # Main chat interface
│   │   │   │   └── VideoCall.tsx   # WebRTC video UI
│   │   │   ├── useWebRTC.ts        # WebRTC hook
│   │   │   ├── socket.ts           # Socket.IO client
│   │   │   └── types.ts            # TypeScript types
│   │   └── vercel.json
│   │
│   └── server/                 # Node.js backend
│       └── src/
│           ├── index.js            # Express server
│           ├── socket.js           # Socket.IO handlers
│           ├── matchmaking.js      # Match logic
│           ├── ai.js               # Groq AI (icebreaker + summary)
│           ├── redis.js            # Redis store
│           ├── memstore.js         # In-memory fallback
│           ├── config.js           # Environment config
│           └── validation.js       # Input validation
```

---

## Local Development

### Prerequisites
- Node.js 18+
- Redis (or use in-memory fallback)

### Server
```bash
cd web/server
cp .env.example .env
# Fill in REDIS_URL, GROQ_API_KEY
node src/index.js
```

### Client
```bash
cd web/client
cp .env .env.local
# Set VITE_API_URL=http://localhost:4000
npm run dev
```

Open `http://localhost:5173`

---

## Environment Variables

### Server (`web/server/.env`)
```
PORT=4000
REDIS_URL=your_upstash_redis_url
JWT_SECRET=your_secret
GROQ_API_KEY=your_groq_api_key
CLIENT_URL=https://novachat-three.vercel.app
NODE_ENV=production
```

### Client (`web/client/.env.production`)
```
VITE_API_URL=https://novachat-production-57d2.up.railway.app
```

---

## How Matching Works

1. User sets preferences (gender, interests, language, vibe)
2. Server scores all queued users against each other
3. Best scoring pair gets matched instantly
4. If no perfect match — connects to anyone (never blocks forever)

**Scoring:**
- Language overlap → +10 points
- Each shared interest → +3 points
- Vibe overlap → +4 points
- Gender pref satisfied → required (if specific)

---

## Deployment

- **Client** → Push to GitHub → Vercel auto-deploys
- **Server** → Push to GitHub → Railway auto-deploys

---

## Built by

A student project — built with ❤️ using modern web technologies.
