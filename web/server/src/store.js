/**
 * Auto-selects Redis (if available) or in-memory store.
 */
import { REDIS_URL } from "./config.js";

let store = null;

async function tryRedis() {
  try {
    const Redis = (await import("ioredis")).default;
    const client = new Redis(REDIS_URL, {
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null, // don't retry
    });

    client.on("error", () => {}); // suppress during probe

    await client.connect();
    await client.ping();
    await client.quit();
    return true;
  } catch {
    return false;
  }
}

export async function initStore() {
  let redisAvailable = false;
  try {
    redisAvailable = await tryRedis();
  } catch {
    redisAvailable = false;
  }

  if (redisAvailable) {
    store = await import("./redis.js");
    console.log("✅ Using Redis store");
  } else {
    store = await import("./memstore.js");
    console.log("⚠️  Redis unavailable — using in-memory store");
  }
}

export function getStore() {
  return store;
}
