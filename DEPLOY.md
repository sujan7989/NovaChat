# Deployment Guide — AnonLink

Stack: **Vercel** (client) + **Railway** (server) + **Upstash** (Redis)

---

## Step 1 — Upstash Redis (free)

1. Go to https://upstash.com → sign up free
2. Create a Redis database → choose region closest to you
3. Copy the **Redis URL** — looks like:
   `rediss://default:xxxx@xxx.upstash.io:6379`

---

## Step 2 — Railway (server)

1. Go to https://railway.app → sign up with GitHub
2. New Project → Deploy from GitHub repo
3. Select your repo → set **Root Directory** to `web/server`
4. Add these environment variables in Railway dashboard:

```
NODE_ENV=production
PORT=4000
REDIS_URL=<your Upstash Redis URL>
CLIENT_URL=https://<your-vercel-app>.vercel.app
JWT_SECRET=<generate with: openssl rand -hex 32>
```

5. Railway will auto-deploy. Copy your Railway URL:
   `https://your-app.up.railway.app`

---

## Step 3 — Vercel (client)

1. Go to https://vercel.com → sign up with GitHub
2. New Project → Import your repo
3. Set **Root Directory** to `web/client`
4. Add these environment variables in Vercel dashboard:

```
VITE_SOCKET_URL=https://your-app.up.railway.app
VITE_API_URL=https://your-app.up.railway.app
```

5. Deploy. Copy your Vercel URL.

---

## Step 4 — Update Railway CLIENT_URL

Go back to Railway → update `CLIENT_URL` to your actual Vercel URL.
Railway will auto-redeploy.

---

## Step 5 — UptimeRobot (keeps server alive, free)

1. Go to https://uptimerobot.com → sign up free
2. Add monitor → HTTP(s) type
3. URL: `https://your-app.up.railway.app/api/health`
4. Interval: every 5 minutes

This prevents Railway from sleeping.

---

## Done. Your app is live.
