import { createLogger } from "./logger.js";
import { getStore } from "./store.js";
import { getOnlineCount, getSocketStats } from "./socket.js";
import { HEALTH_CHECK_INTERVAL } from "./config.js";

const logger = createLogger("monitor");

class HealthMonitor {
  constructor() {
    this.isHealthy = true;
    this.lastHealthCheck = null;
    this.metrics = {
      uptime: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      onlineUsers: 0,
      activeChats: 0,
      totalMatches: 0,
      socketConnections: 0,
      errorRate: 0,
      lastError: null
    };
    this.errorCounts = new Map();
    this.requestCounts = new Map();
    this.intervalId = null;
  }

  start() {
    logger.info("Starting health monitoring...");
    this.intervalId = setInterval(() => {
      this.collectMetrics();
      this.checkHealth();
    }, HEALTH_CHECK_INTERVAL);
    
    // Initial collection
    this.collectMetrics();
    this.checkHealth();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info("Health monitoring stopped");
    }
  }

  async collectMetrics() {
    try {
      const store = getStore();
      const [activeChats, totalMatches, onlineUsers] = await Promise.all([
        store.getStat("active_chats"),
        store.getStat("total_matches"),
        Promise.resolve(getOnlineCount())
      ]);

      const socketStats = getSocketStats();
      
      this.metrics = {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        onlineUsers,
        activeChats: activeChats || 0,
        totalMatches: totalMatches || 0,
        socketConnections: socketStats.totalSockets,
        mappedUsers: socketStats.mappedUsers,
        errorRate: this.calculateErrorRate(),
        lastError: this.metrics.lastError,
        timestamp: Date.now()
      };

      this.lastHealthCheck = new Date();
    } catch (err) {
      logger.error(`Failed to collect metrics: ${err.message}`);
      this.metrics.lastError = err.message;
    }
  }

  async checkHealth() {
    const checks = {
      memory: this.checkMemory(),
      redis: await this.checkRedis(),
      sockets: this.checkSockets(),
      errors: this.checkErrorRate()
    };

    const allHealthy = Object.values(checks).every(check => check.status === 'ok');
    this.isHealthy = allHealthy;

    if (!allHealthy) {
      logger.warn("Health check failed", { checks });
    }

    return {
      status: allHealthy ? 'healthy' : 'unhealthy',
      checks,
      metrics: this.metrics
    };
  }

  checkMemory() {
    const usage = process.memoryUsage();
    const totalMemory = usage.heapTotal + usage.external;
    const maxMemory = 1024 * 1024 * 1024; // 1GB threshold
    const memoryPercent = (totalMemory / maxMemory) * 100;

    return {
      status: memoryPercent > 90 ? 'critical' : memoryPercent > 80 ? 'warning' : 'ok',
      usage,
      percent: memoryPercent
    };
  }

  async checkRedis() {
    try {
      const store = getStore();
      const start = Date.now();
      await store.ping();
      const responseTime = Date.now() - start;

      return {
        status: responseTime > 1000 ? 'warning' : 'ok',
        responseTime
      };
    } catch (err) {
      return {
        status: 'error',
        error: err.message
      };
    }
  }

  checkSockets() {
    const socketStats = getSocketStats();
    const disconnectRate = socketStats.totalSockets > 0 
      ? (socketStats.totalSockets - socketStats.mappedUsers) / socketStats.totalSockets 
      : 0;

    return {
      status: disconnectRate > 0.5 ? 'warning' : 'ok',
      ...socketStats,
      disconnectRate
    };
  }

  checkErrorRate() {
    const errorRate = this.calculateErrorRate();
    return {
      status: errorRate > 0.1 ? 'warning' : errorRate > 0.05 ? 'info' : 'ok',
      errorRate,
      totalErrors: Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0)
    };
  }

  calculateErrorRate() {
    const totalRequests = Array.from(this.requestCounts.values()).reduce((a, b) => a + b, 0);
    const totalErrors = Array.from(this.errorCounts.values()).reduce((a, b) => a + b, 0);
    return totalRequests > 0 ? totalErrors / totalRequests : 0;
  }

  recordRequest(endpoint, status) {
    const key = `${endpoint}:${status}`;
    this.requestCounts.set(key, (this.requestCounts.get(key) || 0) + 1);
    
    if (status >= 400) {
      this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);
      this.metrics.lastError = `${endpoint} returned ${status}`;
    }
  }

  recordError(error, context = {}) {
    const key = `${context.endpoint || 'unknown'}:${error.name || 'error'}`;
    this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);
    this.metrics.lastError = error.message;
    logger.error(`Recorded error: ${error.message}`, context);
  }

  getMetrics() {
    return {
      ...this.metrics,
      isHealthy: this.isHealthy,
      lastHealthCheck: this.lastHealthCheck
    };
  }

  getDetailedHealth() {
    return {
      status: this.isHealthy ? 'healthy' : 'unhealthy',
      timestamp: Date.now(),
      uptime: this.metrics.uptime,
      checks: {
        memory: this.checkMemory(),
        redis: this.checkRedis(),
        sockets: this.checkSockets(),
        errors: this.checkErrorRate()
      },
      metrics: this.metrics
    };
  }
}

// Singleton instance
const healthMonitor = new HealthMonitor();

export { healthMonitor };
export default healthMonitor;
