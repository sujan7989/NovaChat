import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';

// Force in-memory store by making ioredis throw on connect
vi.mock('ioredis', () => {
  return {
    default: vi.fn(() => {
      throw new Error('Redis not available in tests');
    }),
  };
});

let app;
let validateFindPayload, validateMessagePayload, validateImagePayload, validateUserIdPayload;
let initStore, getStore;

beforeAll(async () => {
  const appModule = await import('../index.js');
  app = appModule.default;

  const validationModule = await import('../validation.js');
  validateFindPayload = validationModule.validateFindPayload;
  validateMessagePayload = validationModule.validateMessagePayload;
  validateImagePayload = validationModule.validateImagePayload;
  validateUserIdPayload = validationModule.validateUserIdPayload;

  const storeModule = await import('../store.js');
  initStore = storeModule.initStore;
  getStore = storeModule.getStore;
});

describe('API Endpoints', () => {
  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/health').expect(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/stats', () => {
    it('should return platform statistics', async () => {
      const response = await request(app).get('/api/stats').expect(200);
      expect(response.body).toHaveProperty('total_matches');
      expect(response.body).toHaveProperty('active_chats');
      expect(response.body).toHaveProperty('online');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/config', () => {
    it('should return public configuration without secrets', async () => {
      const response = await request(app).get('/api/config').expect(200);
      expect(response.body).toHaveProperty('NODE_ENV');
      expect(response.body).toHaveProperty('PORT');
      expect(response.body).toHaveProperty('RATE_LIMIT_MAX_REQUESTS');
      expect(response.body).not.toHaveProperty('JWT_SECRET');
    });
  });

  describe('GET /api/ice-servers', () => {
    it('should return ICE server list', async () => {
      const response = await request(app).get('/api/ice-servers').expect(200);
      expect(response.body).toHaveProperty('iceServers');
      expect(Array.isArray(response.body.iceServers)).toBe(true);
      expect(response.body.iceServers.length).toBeGreaterThan(0);
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/api/unknown-route-xyz').expect(404);
      expect(response.body).toHaveProperty('error', 'Not found');
    });
  });
});

describe('Validation Functions', () => {
  describe('validateFindPayload', () => {
    it('should validate correct find payload', () => {
      const result = validateFindPayload({
        userId: 'test-user-123',
        gender: 'male',
        pref: 'female',
        interests: ['gaming', 'music'],
        languages: ['english'],
        vibes: ['chill'],
      });
      expect(result.error).toBeUndefined();
      expect(result.data.userId).toBe('test-user-123');
    });

    it('should reject userId that is too short', () => {
      const result = validateFindPayload({ userId: 'short' });
      expect(result.error).toBeDefined();
    });

    it('should reject invalid gender', () => {
      const result = validateFindPayload({ userId: 'valid-user-id-123', gender: 'invalid' });
      expect(result.error).toBe('Invalid gender');
    });

    it('should reject invalid preference', () => {
      const result = validateFindPayload({ userId: 'valid-user-id-123', pref: 'invalid' });
      expect(result.error).toBe('Invalid preference');
    });

    it('should use defaults for missing optional fields', () => {
      const result = validateFindPayload({ userId: 'valid-user-id-123' });
      expect(result.error).toBeUndefined();
      expect(result.data.gender).toBe('other');
      expect(result.data.pref).toBe('any');
      expect(result.data.interests).toEqual([]);
    });
  });

  describe('validateMessagePayload', () => {
    it('should validate correct message payload', () => {
      const result = validateMessagePayload({ userId: 'test-user-123', text: 'Hello world!' });
      expect(result.error).toBeUndefined();
      expect(result.data.text).toBe('Hello world!');
    });

    it('should reject empty message', () => {
      const result = validateMessagePayload({ userId: 'test-user-123', text: '' });
      expect(result.error).toBe('Empty message');
    });

    it('should reject missing userId', () => {
      const result = validateMessagePayload({ text: 'Hello' });
      expect(result.error).toBeDefined();
    });
  });

  describe('validateImagePayload', () => {
    it('should validate correct image payload', () => {
      const result = validateImagePayload({
        userId: 'test-user-123',
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        caption: 'Test image',
      });
      expect(result.error).toBeUndefined();
      expect(result.data.caption).toBe('Test image');
    });

    it('should reject invalid data URL', () => {
      const result = validateImagePayload({ userId: 'test-user-123', dataUrl: 'not-a-data-url' });
      expect(result.error).toBe('Invalid image format');
    });
  });

  describe('validateUserIdPayload', () => {
    it('should validate correct userId payload', () => {
      const result = validateUserIdPayload({ userId: 'valid-user-id-123' });
      expect(result.error).toBeUndefined();
      expect(result.data.userId).toBe('valid-user-id-123');
    });

    it('should reject missing userId', () => {
      const result = validateUserIdPayload({});
      expect(result.error).toBeDefined();
    });
  });
});

describe('Store Functions (in-memory)', () => {
  it('should increment and retrieve statistics', async () => {
    const store = getStore();
    await store.incrementStat('test_stat_api');
    await store.incrementStat('test_stat_api');
    const count = await store.getStat('test_stat_api');
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('should return 0 for non-existent stats', async () => {
    const store = getStore();
    const count = await store.getStat('non_existent_stat_xyz');
    expect(count).toBe(0);
  });

  it('should set and get a pair', async () => {
    const store = getStore();
    await store.setPair('userA-api-001', 'userB-api-001');
    const partner = await store.getPartner('userA-api-001');
    expect(partner).toBe('userB-api-001');
  });

  it('should remove a pair and return the partner', async () => {
    const store = getStore();
    await store.setPair('userC-api-001', 'userD-api-001');
    const removed = await store.removePair('userC-api-001');
    expect(removed).toBe('userD-api-001');
    const partner = await store.getPartner('userC-api-001');
    expect(partner).toBeNull();
  });

  it('should enqueue and dequeue users for matching', async () => {
    const store = getStore();
    await store.enqueue('enqueue-api-001', 'male', 'female', ['gaming'], ['english'], ['chill']);
    const match = await store.dequeueMatch('enqueue-api-002', 'female', 'male', ['gaming'], ['english'], ['chill']);
    expect(match).not.toBeNull();
    expect(match.partnerId).toBe('enqueue-api-001');
  });

  it('should return null when no match available', async () => {
    const store = getStore();
    const match = await store.dequeueMatch('solo-api-xyz', 'female', 'male', [], [], []);
    expect(match).toBeNull();
  });

  it('should handle reports', async () => {
    const store = getStore();
    const count = await store.addReport('reported-api-001');
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
