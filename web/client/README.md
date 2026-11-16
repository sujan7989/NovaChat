# NovaChat — Client

React 19 + TypeScript + Vite + Tailwind CSS v4 front-end for NovaChat, an
anonymous chat platform with text, image, and live video (WebRTC) chat.

Live: [novachat-three.vercel.app](https://novachat-three.vercel.app)

## Requirements

- Node.js 20+

## Local development

```bash
npm install
cp .env.example .env   # leave VITE_API_URL unset to use the dev proxy
npm run dev
```

The Vite dev server proxies `/api` and `/socket.io` to the backend at
`http://localhost:4000` (see `vite.config.ts`), so run the server first:

```bash
cd ../server && npm install && npm run dev
```

Open http://localhost:5173.

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start the Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) and build for production into `dist/` |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview the production build locally |

## Configuration

The client reads a single environment variable:

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend origin used for REST calls and the Socket.IO connection. Unset in development (same-origin dev proxy). Set to your deployed server URL in production (see `.env.production`). |

## Project structure

```
src/
├── components/
│   ├── Landing.tsx     # Marketing / landing screen
│   ├── Setup.tsx       # 4-step preference setup
│   ├── Chat.tsx        # Main text-chat experience
│   ├── VideoCall.tsx   # WebRTC video-call overlay
│   └── ui.tsx          # Shared design-system primitives
├── lib.ts              # Small shared helpers (cx)
├── socket.ts           # Socket.IO client + env-driven API origin
├── useWebRTC.ts        # Peer connection / TURN / signaling hook
├── types.ts            # Shared TypeScript types
├── index.css           # Tailwind v4 theme tokens + base styles
├── App.tsx             # App shell, error boundary, routing
└── main.tsx            # Entry point
```
