import dotenv from "dotenv";
dotenv.config();

// Environment validation helper
function requireEnv(key, defaultValue = undefined) {
  const value = process.env[key] || defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parseIntEnv(key, defaultValue) {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Invalid integer value for ${key}: ${value}`);
  }
  return parsed;
}

// Server configuration
export const PORT = parseIntEnv("PORT", 4000);
export const NODE_ENV = process.env.NODE_ENV || "development";
export const IS_PRODUCTION = NODE_ENV === "production";

// Database
export const REDIS_URL = requireEnv("REDIS_URL", "redis://localhost:6379");

// CORS / Client
export const CLIENT_URL = requireEnv("CLIENT_URL", "http://localhost:5173");

// JWT / Security
export const JWT_SECRET = requireEnv("JWT_SECRET", IS_PRODUCTION ? undefined : "dev-secret-change-in-production");
export const BCRYPT_ROUNDS = parseIntEnv("BCRYPT_ROUNDS", 12);

// Rate Limiting - API
export const RATE_LIMIT_WINDOW_MS = parseIntEnv("RATE_LIMIT_WINDOW_MS", 60 * 1000);
export const RATE_LIMIT_MAX_REQUESTS = parseIntEnv("RATE_LIMIT_MAX_REQUESTS", 60);

// Rate Limiting - Socket Messages
export const MESSAGE_RATE_LIMIT = parseIntEnv("MESSAGE_RATE_LIMIT", 20);
export const MESSAGE_RATE_WINDOW = parseIntEnv("MESSAGE_RATE_WINDOW", 10 * 1000);

// Size Limits
export const MAX_MESSAGE_SIZE = parseIntEnv("MAX_MESSAGE_SIZE", 500);
export const MAX_IMAGE_SIZE = parseIntEnv("MAX_IMAGE_SIZE", 5 * 1024 * 1024);
export const MAX_IMAGE_BASE64 = Math.ceil(MAX_IMAGE_SIZE * 1.37);
export const MAX_CAPTION_LENGTH = parseIntEnv("MAX_CAPTION_LENGTH", 200);
export const MAX_HTTP_BUFFER_SIZE = parseIntEnv("MAX_HTTP_BUFFER_SIZE", 6 * 1024 * 1024);

// User ID Validation
export const USER_ID_MIN_LENGTH = 8;
export const USER_ID_MAX_LENGTH = 64;
export const USER_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

// Interest / Language Limits
export const MAX_INTERESTS = parseIntEnv("MAX_INTERESTS", 10);
export const MAX_INTEREST_LENGTH = parseIntEnv("MAX_INTEREST_LENGTH", 50);
export const MAX_LANGUAGES = parseIntEnv("MAX_LANGUAGES", 5);
export const MAX_VIBES = parseIntEnv("MAX_VIBES", 5);
export const MAX_VIBE_LENGTH = parseIntEnv("MAX_VIBE_LENGTH", 30);

// Ban Threshold
export const REPORT_BAN_THRESHOLD = parseIntEnv("REPORT_BAN_THRESHOLD", 3);

// Timing
export const SHUTDOWN_TIMEOUT = parseIntEnv("SHUTDOWN_TIMEOUT", 8000);
export const HEALTH_CHECK_INTERVAL = parseIntEnv("HEALTH_CHECK_INTERVAL", 30000);

// Validation helper functions
export function isValidUserId(userId) {
  if (typeof userId !== "string") return false;
  if (userId.length < USER_ID_MIN_LENGTH) return false;
  if (userId.length > USER_ID_MAX_LENGTH) return false;
  return USER_ID_PATTERN.test(userId);
}

export function isValidGender(gender) {
  return ["male", "female", "other"].includes(gender);
}

export function isValidPref(pref) {
  return ["male", "female", "any"].includes(pref);
}

export function isValidInterest(interest) {
  if (typeof interest !== "string") return false;
  return interest.length > 0 && interest.length <= MAX_INTEREST_LENGTH;
}

export function isValidInterests(interests) {
  if (!Array.isArray(interests)) return false;
  if (interests.length > MAX_INTERESTS) return false;
  return interests.every(isValidInterest);
}

export function isValidVibe(vibe) {
  if (typeof vibe !== "string") return false;
  return vibe.length > 0 && vibe.length <= MAX_VIBE_LENGTH;
}

export function isValidVibes(vibes) {
  if (!Array.isArray(vibes)) return false;
  if (vibes.length > MAX_VIBES) return false;
  return vibes.every(isValidVibe);
}

export function isValidLanguage(lang) {
  if (typeof lang !== "string") return false;
  // Accept ISO codes (2-5 chars) AND full language names up to 30 chars
  return lang.length >= 2 && lang.length <= 30 && /^[a-zA-Z\s\-]+$/.test(lang);
}

export function isValidLanguages(languages) {
  if (!Array.isArray(languages)) return false;
  if (languages.length > MAX_LANGUAGES) return false;
  return languages.every(isValidLanguage);
}

export function sanitizeString(str, maxLength = MAX_MESSAGE_SIZE) {
  if (typeof str !== "string") return "";
  return str
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim()
    .slice(0, maxLength);
}

export function isValidDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return false;
  return dataUrl.startsWith("data:image/") && dataUrl.includes(";base64,");
}

// Config summary for logging (excluding secrets)
export function getPublicConfig() {
  return {
    NODE_ENV,
    PORT,
    CLIENT_URL,
    RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX_REQUESTS,
    MAX_MESSAGE_SIZE,
    MAX_IMAGE_SIZE,
    MESSAGE_RATE_LIMIT,
    MESSAGE_RATE_WINDOW,
    REPORT_BAN_THRESHOLD,
    MAX_INTERESTS,
    MAX_LANGUAGES,
    MAX_VIBES,
  };
}
