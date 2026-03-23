import { NODE_ENV } from "./config.js";

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const CURRENT_LEVEL = NODE_ENV === "production" ? LOG_LEVELS.INFO : LOG_LEVELS.DEBUG;

function formatTimestamp() {
  return new Date().toISOString();
}

function formatMessage(level, namespace, message, meta = {}) {
  const timestamp = formatTimestamp();
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] [${level}] [${namespace}] ${message}${metaStr}`;
}

class Logger {
  constructor(namespace) {
    this.namespace = namespace;
  }

  debug(message, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
      console.debug(formatMessage("DEBUG", this.namespace, message, meta));
    }
  }

  info(message, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.INFO) {
      console.info(formatMessage("INFO", this.namespace, message, meta));
    }
  }

  warn(message, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.WARN) {
      console.warn(formatMessage("WARN", this.namespace, message, meta));
    }
  }

  error(message, meta) {
    if (CURRENT_LEVEL <= LOG_LEVELS.ERROR) {
      console.error(formatMessage("ERROR", this.namespace, message, meta));
    }
  }
}

export function createLogger(namespace) {
  return new Logger(namespace);
}

export function requestLogger(namespace = "http") {
  const logger = createLogger(namespace);
  return (req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`, {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get("user-agent")
      });
    });
    next();
  };
}
