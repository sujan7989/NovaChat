# NovaChat server — Node 20 (ESM, Express + Socket.IO)
# Used by Northflank (always-on free tier) and any Docker host.
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies from the lockfile only.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Application source.
COPY src ./src

# The platform injects PORT; the server reads process.env.PORT (default 4000).
EXPOSE 4000

CMD ["node", "src/index.js"]
