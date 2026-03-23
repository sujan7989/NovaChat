# NovaChat Web Platform

[![CI/CD](https://github.com/yourusername/novachat/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/novachat/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

> **Modern anonymous chat platform with real-time messaging, video calls, and intelligent matching.**

[Live Demo](https://novachat-demo.com) | [API Docs](https://api.novachat-demo.com/docs) | [Report Bug](https://github.com/yourusername/novachat/issues)

---

## Features

- **Real-time Anonymous Chat** - Instant text messaging with strangers
- **Video Chat (WebRTC)** - Secure peer-to-peer video calling
- **Interest-Based Matching** - Match with users who share similar interests
- **Gender Preferences** - Filter matches by gender preference
- **Typing Indicators** - See when your match is typing
- **Image Sharing** - Share images securely (5MB limit, validated)
- **Rate Limiting** - Protection against spam and abuse
- **Reporting System** - Auto-ban users after multiple reports
- **Responsive Design** - Works on desktop and mobile

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Socket.io-client |
| **Backend** | Node.js, Express, Socket.io |
| **Database** | Redis (state management & statistics) |
| **Containerization** | Docker, Docker Compose |
| **Testing** | Vitest, Supertest |
| **CI/CD** | GitHub Actions |
| **Documentation** | OpenAPI/Swagger |

---

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- Redis server (local or cloud)
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/novachat.git
cd novachat/web

# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### Environment Setup

Create `.env` files:

**Server** (`server/.env`):
```env
PORT=4000
REDIS_URL=redis://localhost:6379
CLIENT_URL=http://localhost:5173
NODE_ENV=development

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60

# Socket Limits
MAX_MESSAGE_SIZE=500
MAX_IMAGE_SIZE=5242880
MAX_IMAGE_BASE64=7200000
MESSAGE_RATE_LIMIT=20
MESSAGE_RATE_WINDOW=10000

# Security
BCRYPT_ROUNDS=12
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# Ban Threshold
REPORT_BAN_THRESHOLD=3
```

**Client** (`client/.env`):
```env
VITE_API_URL=http://localhost:4000
VITE_SOCKET_URL=http://localhost:4000
```

### Development

```bash
# Start Redis (if using Docker)
docker run -d -p 6379:6379 redis:7-alpine

# Terminal 1 - Start Server
cd server
npm run dev

# Terminal 2 - Start Client
cd client
npm run dev
```

### Docker (Production)

```bash
cd web
docker-compose up --build
```

---

## Architecture

```
┌─────────────┐      WebSocket       ┌─────────────┐
│   Client    │ ◄──────────────────► │   Server    │
│  (React)    │                      │  (Node.js)  │
└─────────────┘                      └──────┬──────┘
                                            │
                                     ┌──────▼──────┐
                                     │    Redis    │
                                     │   (State)   │
                                     └─────────────┘
```

---

## API Documentation

### REST Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/stats` | Platform statistics |

### Socket.io Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `find` | Client → Server | Join matchmaking queue |
| `matched` | Server → Client | Successfully matched |
| `message` | Bidirectional | Text message |
| `image` | Bidirectional | Image message |
| `typing` | Bidirectional | Typing indicator |
| `webrtc:offer` | Bidirectional | WebRTC offer |
| `webrtc:answer` | Bidirectional | WebRTC answer |
| `webrtc:ice` | Bidirectional | ICE candidate |
| `next` | Client → Server | Find new match |
| `stop` | Client → Server | End current chat |
| `report` | Client → Server | Report current user |

**Full API documentation**: `/api/docs` (when server is running)

---

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- src/__tests__/socket.test.js
```

---

## Deployment

### Environment Variables (Production)

```env
NODE_ENV=production
PORT=4000
REDIS_URL=redis://your-redis-host:6379
CLIENT_URL=https://your-domain.com

# Security (Required in production)
JWT_SECRET=strong-random-secret-min-32-chars
BCRYPT_ROUNDS=12

# Monitoring
SENTRY_DSN=your-sentry-dsn
LOG_LEVEL=info
```

### Docker Compose

```yaml
version: '3.8'
services:
  redis:
    image: redis:7-alpine
    restart: always
  server:
    build: ./server
    restart: always
    env_file: ./server/.env
  client:
    build: ./client
    restart: always
```

---

## Security Features

- ✅ Helmet.js security headers
- ✅ CORS configuration
- ✅ Rate limiting (API & Socket)
- ✅ Input sanitization (XSS prevention)
- ✅ Image validation (type & size)
- ✅ WebRTC encryption (DTLS-SRTP)
- ✅ Report & auto-ban system
- ✅ No persistent message storage

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

---

## Contact

- **Email**: support@anonlink.com
- **Twitter**: [@anonlink](https://twitter.com/anonlink)
- **Discord**: [Join Server](https://discord.gg/anonlink)

---

<p align="center">Built with privacy in mind.</p>
