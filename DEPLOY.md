# Deployment Guide — NovaChat

Stack: **Vercel** (client) + **Render** (server, free tier) + **Upstash** (Redis)

- Client (already live): https://novachat-three.vercel.app
- Server: Render Web Service (free plan)
- Redis: Upstash free database (optional — the server falls back to an in-memory store)

---

## Step 1 — Upstash Redis (free, recommended)

1. Go to https://upstash.com → sign up free
2. Create a Redis database → pick a region close to your users
3. Copy the **Redis URL** — looks like `rediss://default:xxxx@xxx.upstash.io:6379`

> Redis keeps matchmaking state shared across instances. Without it the server
> still runs on a single-instance in-memory store (fine for small traffic).

---

## Step 2 — Render (server, free)

**Option A — Blueprint (one click, uses `render.yaml` in this repo)**

1. Go to https://dashboard.render.com → sign up with GitHub
2. **New → Blueprint** → select this repo
3. Render reads `render.yaml` and provisions the `novachat-server` service
4. When prompted, fill the `sync: false` secrets:
   - `REDIS_URL` → your Upstash URL (leave blank to use in-memory)
   - `GROQ_API_KEY` → optional (AI icebreakers/summaries)
   - `METERED_API_KEY` → optional (TURN relay for video calls)
5. Deploy. Copy the service URL, e.g. `https://novachat-server.onrender.com`

**Option B — Manual Web Service**

1. **New → Web Service** → connect this repo
2. Settings:
   - **Root Directory:** `web/server`
   - **Runtime:** Node
   - **Build Command:** `npm ci`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/api/health`
   - **Instance Type:** Free
3. Add environment variables:

```
NODE_ENV=production
CLIENT_URL=https://novachat-three.vercel.app
REDIS_URL=<your Upstash Redis URL>      # optional
JWT_SECRET=<openssl rand -hex 32>
GROQ_API_KEY=<optional>
METERED_API_KEY=<optional>
```

> `PORT` is injected automatically by Render — do not set it manually.

4. Deploy and copy your service URL: `https://<name>.onrender.com`

---

## Step 3 — Point the client at the server (Vercel)

The client reads a single variable, `VITE_API_URL` — the server origin with **no
trailing slash**. It is **not committed** (env-driven config); set it in Vercel:

1. Vercel → your project → **Settings → Environment Variables**
2. Add for **Production** (and Preview):
   `VITE_API_URL=https://<name>.onrender.com`
3. **Redeploy** so the new value is baked into the build.

> This one variable drives both REST (`/api/*`) and the Socket.IO connection —
> there is no separate `VITE_SOCKET_URL`.

---

## Step 4 — Keep the free server warm (UptimeRobot)

Render's free tier sleeps after ~15 min of inactivity. A free external ping keeps
it responsive:

1. https://uptimerobot.com → sign up free
2. Add monitor → HTTP(s)
3. URL: `https://<name>.onrender.com/api/health`
4. Interval: every 5 minutes

---

## SEO notes (already wired)

- `public/robots.txt` (allow + sitemap pointer) and `public/sitemap.xml`
- `vercel.json` rewrites never shadow `robots.txt`, `sitemap.xml`, `favicon.svg`,
  `manifest.json`, or `/assets/*`
- Canonical, Open Graph, Twitter cards, and the Google Search Console
  verification meta tag live in `web/client/index.html`

## Done. Your app is live.
