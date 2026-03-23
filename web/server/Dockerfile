FROM node:20-alpine

WORKDIR /app

COPY web/server/package*.json ./
RUN npm ci --omit=dev

COPY web/server/src/ ./src/

EXPOSE 4000

CMD ["node", "src/index.js"]
