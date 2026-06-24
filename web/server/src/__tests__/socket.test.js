import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import { createServer } from 'http';

// Force in-memory store by making ioredis throw on connect
vi.mock('ioredis', () => {
  return {
    default: vi.fn(() => {
      throw new Error('Redis not available in tests');
    }),
  };
});

const { initStore } = await import('../store.js');
const { initSocket } = await import('../socket.js');

describe('Socket Integration', () => {
  let httpServer;
  let io;
  let port;

  beforeEach(async () => {
    await initStore();
    httpServer = createServer();
    io = new Server(httpServer, { cors: { origin: '*' } });
    initSocket(io);

    await new Promise((resolve) => {
      httpServer.listen(0, () => {
        port = httpServer.address().port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    io.close();
    await new Promise((resolve) => httpServer.close(resolve));
  });

  function makeClient(opts = {}) {
    return ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      ...opts,
    });
  }

  function waitFor(socket, event, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Timeout waiting for "${event}"`)), timeout);
      socket.once(event, (data) => { clearTimeout(t); resolve(data); });
    });
  }

  describe('Connection Handling', () => {
    it('should handle client connection', async () => {
      const client = makeClient();
      await waitFor(client, 'connect');
      expect(client.connected).toBe(true);
      client.disconnect();
    });

    it('should emit online_count on connection', async () => {
      const client = makeClient();
      const data = await waitFor(client, 'online_count');
      expect(data).toHaveProperty('count');
      expect(data.count).toBeGreaterThanOrEqual(1);
      client.disconnect();
    });
  });

  describe('Matchmaking', () => {
    it('should queue a user when no match is available', async () => {
      const client = makeClient();
      await waitFor(client, 'connect');

      client.emit('find', {
        userId: 'solo-user-abc123',
        gender: 'male',
        pref: 'female',
        interests: ['gaming'],
        languages: ['english'],
        vibes: ['chill'],
      });

      const data = await waitFor(client, 'queued');
      expect(data).toBeUndefined(); // queued emits no payload
      client.disconnect();
    });

    it('should match two compatible users', async () => {
      const client1 = makeClient();
      const client2 = makeClient();

      await Promise.all([waitFor(client1, 'connect'), waitFor(client2, 'connect')]);

      const match1Promise = waitFor(client1, 'matched');
      const match2Promise = waitFor(client2, 'matched');

      client1.emit('find', {
        userId: 'match-user-aaa111',
        gender: 'male',
        pref: 'female',
        interests: ['gaming'],
        languages: ['english'],
        vibes: ['chill'],
      });

      client2.emit('find', {
        userId: 'match-user-bbb222',
        gender: 'female',
        pref: 'male',
        interests: ['gaming'],
        languages: ['english'],
        vibes: ['chill'],
      });

      const [match1, match2] = await Promise.all([match1Promise, match2Promise]);
      expect(match1).toHaveProperty('shared');
      expect(match2).toHaveProperty('shared');

      client1.disconnect();
      client2.disconnect();
    });
  });

  describe('Messaging', () => {
    it('should relay messages between matched users', async () => {
      const client1 = makeClient();
      const client2 = makeClient();

      await Promise.all([waitFor(client1, 'connect'), waitFor(client2, 'connect')]);

      // Match them first
      const match1Promise = waitFor(client1, 'matched');
      const match2Promise = waitFor(client2, 'matched');

      client1.emit('find', {
        userId: 'msg-user-aaa111',
        gender: 'male',
        pref: 'female',
        interests: ['music'],
        languages: ['english'],
        vibes: [],
      });
      client2.emit('find', {
        userId: 'msg-user-bbb222',
        gender: 'female',
        pref: 'male',
        interests: ['music'],
        languages: ['english'],
        vibes: [],
      });

      await Promise.all([match1Promise, match2Promise]);

      // Now send a message
      const msgPromise = waitFor(client2, 'message');
      client1.emit('message', { userId: 'msg-user-aaa111', text: 'Hello from user 1' });

      const msg = await msgPromise;
      expect(msg.text).toBe('Hello from user 1');
      expect(msg.from).toBe('stranger');

      client1.disconnect();
      client2.disconnect();
    });

    it('should relay typing indicators', async () => {
      const client1 = makeClient();
      const client2 = makeClient();

      await Promise.all([waitFor(client1, 'connect'), waitFor(client2, 'connect')]);

      const match1Promise = waitFor(client1, 'matched');
      const match2Promise = waitFor(client2, 'matched');

      client1.emit('find', {
        userId: 'typ-user-aaa111',
        gender: 'male',
        pref: 'female',
        interests: [],
        languages: [],
        vibes: [],
      });
      client2.emit('find', {
        userId: 'typ-user-bbb222',
        gender: 'female',
        pref: 'male',
        interests: [],
        languages: [],
        vibes: [],
      });

      await Promise.all([match1Promise, match2Promise]);

      const typingPromise = waitFor(client2, 'typing');
      client1.emit('typing', { userId: 'typ-user-aaa111', isTyping: true });

      const typing = await typingPromise;
      expect(typing.isTyping).toBe(true);

      client1.disconnect();
      client2.disconnect();
    });
  });

  describe('Error Handling', () => {
    it('should return error_msg for invalid find payload', async () => {
      const client = makeClient();
      await waitFor(client, 'connect');

      const errPromise = waitFor(client, 'error_msg');
      client.emit('find', { userId: 'bad', gender: 'invalid-gender' });

      const err = await errPromise;
      expect(err).toHaveProperty('msg');
      client.disconnect();
    });

    it('should rate-limit rapid messages', async () => {
      const client = makeClient();
      await waitFor(client, 'connect');

      const rateLimitPromise = waitFor(client, 'rate_limited', 5000);

      // Send 25 messages rapidly to trigger rate limit (limit is 20 per 10s)
      for (let i = 0; i < 25; i++) {
        client.emit('message', { userId: 'rate-user-abc123', text: `Message ${i}` });
      }

      const data = await rateLimitPromise;
      expect(data).toHaveProperty('msg');
      client.disconnect();
    });
  });

  describe('Disconnect Handling', () => {
    it('should notify partner when user disconnects', async () => {
      const client1 = makeClient();
      const client2 = makeClient();

      await Promise.all([waitFor(client1, 'connect'), waitFor(client2, 'connect')]);

      const match1Promise = waitFor(client1, 'matched');
      const match2Promise = waitFor(client2, 'matched');

      client1.emit('find', {
        userId: 'disc-user-aaa111',
        gender: 'male',
        pref: 'female',
        interests: [],
        languages: [],
        vibes: [],
      });
      client2.emit('find', {
        userId: 'disc-user-bbb222',
        gender: 'female',
        pref: 'male',
        interests: [],
        languages: [],
        vibes: [],
      });

      await Promise.all([match1Promise, match2Promise]);

      const leftPromise = waitFor(client2, 'stranger_left');
      client1.disconnect();

      await leftPromise; // client2 should be notified
      client2.disconnect();
    });
  });
});
