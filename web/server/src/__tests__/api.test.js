import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createClient } from 'redis-mock';
import { initStore, getStore } from '../src/store.js';
import { initSocket } from '../src/socket.js';
import app from '../src/index.js';

// Mock Redis
vi.mock('ioredis', () => ({
  default: vi.fn(() => createClient())
}));

describe('API Endpoints', () => {
  let server;
  let io;

  beforeEach(async () => {
    // Create test server
    server = createServer(app);
    io = new Server(server, {
      cors: { origin: '*' }
    });

    // Initialize store with mock Redis
    await initStore();
    initSocket(io);
  });

  afterEach(async () => {
    if (server) {
      server.close();
    }
    const store = getStore();
    await store.flushall();
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('checks');
    });
  });

  describe('GET /api/stats', () => {
    it('should return platform statistics', async () => {
      const response = await request(app)
        .get('/api/stats')
        .expect(200);

      expect(response.body).toHaveProperty('total_matches');
      expect(response.body).toHaveProperty('active_chats');
      expect(response.body).toHaveProperty('online');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/config', () => {
    it('should return public configuration', async () => {
      const response = await request(app)
        .get('/api/config')
        .expect(200);

      expect(response.body).toHaveProperty('NODE_ENV');
      expect(response.body).toHaveProperty('PORT');
      expect(response.body).toHaveProperty('RATE_LIMIT_MAX_REQUESTS');
      expect(response.body).not.toHaveProperty('JWT_SECRET'); // Should not expose secrets
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/unknown')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Not found');
    });
  });
});

describe('Validation Functions', () => {
  const {
    validateFindPayload,
    validateMessagePayload,
    validateImagePayload,
    validateUserIdPayload
  } = await import('../src/validation.js');

  describe('validateFindPayload', () => {
    it('should validate correct find payload', () => {
      const payload = {
        userId: 'test-user-123',
        gender: 'male',
        pref: 'female',
        interests: ['gaming', 'music'],
        languages: ['en'],
        vibes: ['chill']
      };

      const result = validateFindPayload(payload);
      expect(result.error).toBeUndefined();
      expect(result.data).toBeDefined();
    });

    it('should reject invalid userId', () => {
      const payload = {
        userId: 'short',
        gender: 'male'
      };

      const result = validateFindPayload(payload);
      expect(result.error).toBe('Invalid userId format');
    });

    it('should reject invalid gender', () => {
      const payload = {
        userId: 'valid-user-id-123',
        gender: 'invalid'
      };

      const result = validateFindPayload(payload);
      expect(result.error).toBe('Invalid gender');
    });
  });

  describe('validateMessagePayload', () => {
    it('should validate correct message payload', () => {
      const payload = {
        userId: 'test-user-123',
        text: 'Hello world!'
      };

      const result = validateMessagePayload(payload);
      expect(result.error).toBeUndefined();
      expect(result.data.text).toBe('Hello world!');
    });

    it('should reject empty message', () => {
      const payload = {
        userId: 'test-user-123',
        text: ''
      };

      const result = validateMessagePayload(payload);
      expect(result.error).toBe('Empty message');
    });
  });

  describe('validateImagePayload', () => {
    it('should validate correct image payload', () => {
      const payload = {
        userId: 'test-user-123',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        caption: 'Test image'
      };

      const result = validateImagePayload(payload);
      expect(result.error).toBeUndefined();
      expect(result.data.caption).toBe('Test image');
    });

    it('should reject invalid data URL', () => {
      const payload = {
        userId: 'test-user-123',
        dataUrl: 'not-a-data-url'
      };

      const result = validateImagePayload(payload);
      expect(result.error).toBe('Invalid image format');
    });
  });
});

describe('Store Functions', () => {
  let store;

  beforeEach(async () => {
    await initStore();
    store = getStore();
  });

  afterEach(async () => {
    await store.flushall();
  });

  describe('Statistics', () => {
    it('should increment and retrieve statistics', async () => {
      await store.incrementStat('total_matches');
      await store.incrementStat('total_matches');
      
      const count = await store.getStat('total_matches');
      expect(count).toBe(2);
    });

    it('should return 0 for non-existent stats', async () => {
      const count = await store.getStat('non_existent');
      expect(count).toBe(0);
    });
  });

  describe('User Management', () => {
    it('should save and retrieve user profile', async () => {
      const userId = 'test-user-123';
      const profile = {
        gender: 'male',
        pref: 'female',
        interests: ['gaming', 'music']
      };

      await store.saveProfile(userId, profile);
      const retrieved = await store.getProfile(userId);
      
      expect(retrieved).toEqual(profile);
    });

    it('should handle non-existent profiles', async () => {
      const profile = await store.getProfile('non-existent');
      expect(profile).toBeNull();
    });
  });

  describe('Matchmaking', () => {
    it('should enqueue and dequeue users', async () => {
      const userId = 'test-user-123';
      const gender = 'male';
      const pref = 'female';

      await store.enqueue(userId, gender, pref);
      const match = await store.dequeueMatch('other-user', pref, gender);
      
      expect(match).toBe(userId);
    });

    it('should return null when no match available', async () => {
      const match = await store.dequeueMatch('test-user', 'female', 'male');
      expect(match).toBeNull();
    });
  });
});
