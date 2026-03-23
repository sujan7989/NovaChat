import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Server } from 'socket.io';
import { createClient } from 'redis-mock';
import { createServer } from 'http';
import { initStore, getStore } from '../src/store.js';
import { initSocket, getOnlineCount } from '../src/socket.js';

describe('Socket Integration', () => {
  let server;
  let io;
  let clientSocket;
  let store;

  beforeEach(async () => {
    // Mock Redis
    vi.mock('ioredis', () => ({
      default: vi.fn(() => createClient())
    }));

    // Setup test server
    server = createServer();
    io = new Server(server, {
      cors: { origin: '*' }
    });

    await initStore();
    store = getStore();
    initSocket(io);

    // Start server
    await new Promise((resolve) => {
      server.listen(0, resolve);
    });
  });

  afterEach(async () => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
    if (server) {
      server.close();
    }
    await store.flushall();
  });

  describe('Connection Handling', () => {
    it('should handle client connection', (done) => {
      clientSocket = new ClientSocket(`http://localhost:${server.address().port}`);
      
      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });
    });

    it('should emit online count on connection', (done) => {
      clientSocket = new ClientSocket(`http://localhost:${server.address().port}`);
      
      clientSocket.on('online_count', (data) => {
        expect(data).toHaveProperty('count');
        expect(data.count).toBe(1);
        done();
      });
    });
  });

  describe('Matchmaking', () => {
    let client1, client2;

    beforeEach(() => {
      client1 = new ClientSocket(`http://localhost:${server.address().port}`);
      client2 = new ClientSocket(`http://localhost:${server.address().port}`);
    });

    afterEach(() => {
      client1?.disconnect();
      client2?.disconnect();
    });

    it('should match two users', (done) => {
      let matchedCount = 0;
      const expectedMatches = 2;

      function checkComplete() {
        matchedCount++;
        if (matchedCount === expectedMatches) {
          done();
        }
      }

      client1.on('matched', (data) => {
        expect(data).toHaveProperty('shared');
        checkComplete();
      });

      client2.on('matched', (data) => {
        expect(data).toHaveProperty('shared');
        checkComplete();
      });

      // Connect both clients and find matches
      setTimeout(() => {
        client1.emit('find', {
          userId: 'user-1',
          gender: 'male',
          pref: 'female',
          interests: ['gaming'],
          languages: ['en'],
          vibes: ['chill']
        });

        client2.emit('find', {
          userId: 'user-2',
          gender: 'female',
          pref: 'male',
          interests: ['gaming'],
          languages: ['en'],
          vibes: ['chill']
        });
      }, 100);
    });

    it('should handle next request', (done) => {
      client1.on('matched', () => {
        // User 1 requests next
        client1.emit('next', {
          userId: 'user-1',
          gender: 'male',
          pref: 'female',
          interests: ['gaming'],
          languages: ['en'],
          vibes: ['chill']
        });
      });

      client2.on('stranger_left', () => {
        done();
      });

      // Initial match
      setTimeout(() => {
        client1.emit('find', {
          userId: 'user-1',
          gender: 'male',
          pref: 'female',
          interests: ['gaming'],
          languages: ['en'],
          vibes: ['chill']
        });

        client2.emit('find', {
          userId: 'user-2',
          gender: 'female',
          pref: 'male',
          interests: ['gaming'],
          languages: ['en'],
          vibes: ['chill']
        });
      }, 100);
    });
  });

  describe('Messaging', () => {
    let client1, client2;

    beforeEach(() => {
      client1 = new ClientSocket(`http://localhost:${server.address().port}`);
      client2 = new ClientSocket(`http://localhost:${server.address().port}`);
    });

    afterEach(() => {
      client1?.disconnect();
      client2?.disconnect();
    });

    it('should relay messages between matched users', (done) => {
      client1.on('matched', () => {
        client1.emit('message', {
          userId: 'user-1',
          text: 'Hello from user 1'
        });
      });

      client2.on('message', (data) => {
        expect(data.text).toBe('Hello from user 1');
        expect(data.from).toBe('stranger');
        done();
      });

      // Match users first
      setTimeout(() => {
        client1.emit('find', {
          userId: 'user-1',
          gender: 'male',
          pref: 'female',
          interests: ['gaming'],
          languages: ['en'],
          vibes: ['chill']
        });

        client2.emit('find', {
          userId: 'user-2',
          gender: 'female',
          pref: 'male',
          interests: ['gaming'],
          languages: ['en'],
          vibes: ['chill']
        });
      }, 100);
    });

    it('should handle typing indicators', (done) => {
      client1.on('matched', () => {
        client1.emit('typing', {
          userId: 'user-1',
          isTyping: true
        });
      });

      client2.on('typing', (data) => {
        expect(data.isTyping).toBe(true);
        done();
      });

      // Match users first
      setTimeout(() => {
        client1.emit('find', {
          userId: 'user-1',
          gender: 'male',
          pref: 'female',
          interests: ['gaming'],
          languages: ['en'],
          vibes: ['chill']
        });

        client2.emit('find', {
          userId: 'user-2',
          gender: 'female',
          pref: 'male',
          interests: ['gaming'],
          languages: ['en'],
          vibes: ['chill']
        });
      }, 100);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid payloads', (done) => {
      clientSocket = new ClientSocket(`http://localhost:${server.address().port}`);
      
      clientSocket.on('error_msg', (data) => {
        expect(data).toHaveProperty('msg');
        done();
      });

      setTimeout(() => {
        clientSocket.emit('find', {
          userId: 'invalid', // Too short
          gender: 'invalid-gender'
        });
      }, 100);
    });

    it('should handle rate limiting', (done) => {
      clientSocket = new ClientSocket(`http://localhost:${server.address().port}`);
      
      let rateLimitedCount = 0;
      
      clientSocket.on('rate_limited', () => {
        rateLimitedCount++;
        if (rateLimitedCount > 0) {
          done();
        }
      });

      // Send multiple messages quickly to trigger rate limit
      setTimeout(() => {
        for (let i = 0; i < 25; i++) {
          clientSocket.emit('message', {
            userId: 'test-user-123',
            text: `Message ${i}`
          });
        }
      }, 100);
    });
  });
});

// Mock Socket.IO client for testing
class ClientSocket {
  constructor(url) {
    this.connected = false;
    this.events = {};
    this.id = 'test-client-' + Math.random();
    
    // Simulate connection
    setTimeout(() => {
      this.connected = true;
      this.emit('connect');
    }, 50);
  }

  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }

  emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach(callback => callback(data));
    }
  }

  disconnect() {
    this.connected = false;
    this.emit('disconnect');
  }
}
