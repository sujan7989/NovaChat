# 👻 NovaChat — Anonymous Chat Platform

> Meet strangers. No account. No name. Just connections.

**Live:** [novachat-three.vercel.app](https://novachat-three.vercel.app)

---

## What is NovaChat?

NovaChat is a modern anonymous chat platform where you can instantly connect with strangers worldwide. No sign-up, no identity — just open the app and start chatting. Supports text, images, and live video calls with smart AI-powered features.

---

## Features

| Feature | Description |
|---|---|
| 💬 Text Chat | Real-time anonymous messaging with delivered status |
| 🖼️ Image Sharing | Send photos directly in chat (camera on mobile) |
| 🔴 Live Video | WebRTC peer-to-peer video calls with TURN relay |
| 🎯 Smart Matching | Match by interests, language, vibe with scoring system |
| 🤖 AI Icebreaker | Groq AI generates opening questions on match |
| 📝 Chat Summary | AI summarizes your conversation after it ends |
| ⭐ Anonymous Rating | Rate strangers after each chat (1-5 stars) |
| 🛡️ AI Moderation | Bad-words filter blocks toxic messages |
| ✓✓ Delivered Status | See when your message is delivered |
| 🔔 Sound Alerts | Audio ping on new message |
| 🚩 Report System | Report + auto-ban abusive users |
| 📱 Mobile Ready | Works on both mobile and desktop |

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
         │ Polling fallback for mobile networks
         ▼
┌─────────────────────┐
│  Backend Server     │  Node.js + Express
│  Railway            │  Socket.IO
└────────┬────────────┘
         │
    ┌────┴──────────────────────────────┐
    │                                   │
    ▼                                   ▼
┌──────────────────┐         ┌──────────────────────┐
│  Matchmaking     │         │  WebRTC Signaling     │
│  Queue           │         │  Offer/Answer/ICE     │
│                  │         │  TURN: Metered.ca     │
│  Score by:       │         └──────────────────────┘
│  - Gender pref   │
│  - Language      │         ┌──────────────────────┐
│  - Interests     │         │  AI Service           │
│  - Vibe          │         │  Groq (llama3-8b)     │
└──────┬───────────┘         │  - Icebreakers        │
       │                     │  - Chat Summaries     │
       ▼                     └──────────────────────┘
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
| Video | WebRTC + Metered.ca TURN servers |
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
│   │   │   ├── useWebRTC.ts        # WebRTC hook with TURN
│   │   │   ├── socket.ts           # Socket.IO client
│   │   │   └── types.ts            # TypeScript types
│   │   └── vercel.json
│   │
│   └── server/                 # Node.js backend
│       └── src/
│           ├── index.js            # Express server + ICE endpoint
│           ├── socket.js           # Socket.IO handlers + moderation
│           ├── matchmaking.js      # Smart match logic
│           ├── ai.js               # Groq AI (icebreaker + summary)
│           ├── redis.js            # Redis store
│           ├── memstore.js         # In-memory fallback
│           ├── config.js           # Environment config
│           └── validation.js       # Input validation
```

---

## How Matching Works

1. User sets preferences (gender, interests, language, vibe)
2. Server scores all queued users against each other
3. Best scoring pair gets matched instantly
4. If no perfect match — connects to anyone (never blocks forever)

**Scoring system:**
- Language overlap → +10 points
- Each shared interest → +3 points
- Vibe overlap → +4 points
- Gender pref satisfied → required (if specific)

---

## Capacity (Current Free Tier)

| Service | Limit |
|---|---|
| Vercel (frontend) | Unlimited |
| Railway (backend) | ~50-100 concurrent users |
| Upstash Redis | 10,000 commands/day |
| Metered TURN | 500MB/month video relay |

---

## Local Development

### Server
```bash
cd web/server
cp .env.example .env
# Fill in: REDIS_URL, GROQ_API_KEY, JWT_SECRET
node src/index.js
```

### Client
```bash
cd web/client
npm run dev
# Set VITE_API_URL=http://localhost:4000 in .env
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

## Deployment

- **Client** → Push to GitHub → Vercel auto-deploys
- **Server** → Push to GitHub → Railway auto-deploys

---

## Built by

A student project built with ❤️ using modern web technologies.
