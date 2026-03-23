/**
 * Auto-selects Redis (if available) or in-memory store.
 */
import { REDIS_URL } from "./config.js";

let store;

async function tryRedis() {
  return new Promise(async (resolve) => {
    try {
      const Redis = (await import("ioredis")).default;
      const client = new Redis(REDIS_URL, {
        lazyConnect: true,
        connectTimeout: 1500,
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
      });

      // Suppress ioredis unhandled error events during probe
      client.on("error", () => {});

      const timer = setTimeout(() => {
        client.disconnect();
        resolve(false);
      }, 2000);

      try {
        await client.connect();
        await client.ping();
        clearTimeout(timer);
        client.disconnect();
        resolve(true);
      } catch {
        clearTimeout(timer);
        client.disconnect();
        resolve(false);
      }
    } catch {
      resolve(false);
    }
  });
}

export async function initStore() {
  const redisAvailable = await tryRedis();
  if (redisAvailable) {
    store = await import("./redis.js");
    console.log("✅ Using Redis store");
  } else {
    store = await import("./memstore.js");
    console.log("⚠️  Redis unavailable — using in-memory store (fine for local dev)");
  }
}

export function getStore() {
  return store;
}
