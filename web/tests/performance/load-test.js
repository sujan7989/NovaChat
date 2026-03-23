import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '2m', target: 100 }, // Ramp up to 100 users
    { duration: '5m', target: 100 }, // Stay at 100 users
    { duration: '2m', target: 200 }, // Ramp up to 200 users
    { duration: '5m', target: 200 }, // Stay at 200 users
    { duration: '2m', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'],    // Error rate under 1%
    errors: ['rate<0.01'],             // Custom error rate under 1%
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

export function setup() {
  // Health check before starting
  const response = http.get(`${BASE_URL}/api/health`);
  check(response, {
    'health check passed': (r) => r.status === 200,
  });
}

export default function () {
  // Test health endpoint
  let response = http.get(`${BASE_URL}/api/health`, {
    tags: { endpoint: 'health' }
  });
  
  let healthOk = check(response, {
    'health status is 200': (r) => r.status === 200,
    'health response time < 200ms': (r) => r.timings.duration < 200,
  });
  
  errorRate.add(!healthOk);

  // Test stats endpoint
  response = http.get(`${BASE_URL}/api/stats`, {
    tags: { endpoint: 'stats' }
  });
  
  let statsOk = check(response, {
    'stats status is 200': (r) => r.status === 200,
    'stats has required fields': (r) => {
      const body = JSON.parse(r.body);
      return body.hasOwnProperty('total_matches') && 
             body.hasOwnProperty('active_chats') && 
             body.hasOwnProperty('online');
    },
  });
  
  errorRate.add(!statsOk);

  // Test config endpoint
  response = http.get(`${BASE_URL}/api/config`, {
    tags: { endpoint: 'config' }
  });
  
  let configOk = check(response, {
    'config status is 200': (r) => r.status === 200,
    'config excludes secrets': (r) => {
      const body = JSON.parse(r.body);
      return !body.hasOwnProperty('JWT_SECRET') && !body.hasOwnProperty('REDIS_URL');
    },
  });
  
  errorRate.add(!configOk);

  sleep(1);
}

export function teardown() {
  console.log('Performance test completed');
}
