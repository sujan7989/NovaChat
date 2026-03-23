import { isValidUserId, isValidGender, isValidPref, isValidInterests, isValidVibes, isValidLanguages, sanitizeString, isValidDataUrl, MAX_CAPTION_LENGTH, getPublicConfig } from "./config.js";
import { getStore } from "./store.js";

/**
 * Validates socket event payload for 'find' and 'next' events
 * @param {Object} payload - The event payload
 * @returns {Object|null} - Validated data or null if invalid
 */
export function validateFindPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { error: "Invalid payload format" };
  }

  const { userId, gender, pref, interests, languages, vibes } = payload;

  // Validate userId
  if (!userId) {
    return { error: "Missing userId" };
  }
  if (!isValidUserId(userId)) {
    return { error: "Invalid userId format", details: "Must be 8-64 alphanumeric characters" };
  }

  // Validate gender
  if (gender && !isValidGender(gender)) {
    return { error: "Invalid gender", details: "Must be 'male', 'female', or 'other'" };
  }

  // Validate preference
  if (pref && !isValidPref(pref)) {
    return { error: "Invalid preference", details: "Must be 'male', 'female', or 'any'" };
  }

  // Validate interests
  if (interests !== undefined && !isValidInterests(interests)) {
    return { error: "Invalid interests", details: "Max 10 interests, 50 chars each" };
  }

  // Validate languages
  if (languages !== undefined && !isValidLanguages(languages)) {
    return { error: "Invalid languages", details: "Max 5 language codes" };
  }

  // Validate vibes
  if (vibes !== undefined && !isValidVibes(vibes)) {
    return { error: "Invalid vibes", details: "Max 5 vibes, 30 chars each" };
  }

  return {
    data: {
      userId,
      gender: gender || "other",
      pref: pref || "any",
      interests: interests || [],
      languages: languages || [],
      vibes: vibes || [],
    }
  };
}

/**
 * Validates message payload
 * @param {Object} payload - The message payload
 * @returns {Object|null} - Validated data or error
 */
export function validateMessagePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { error: "Invalid payload format" };
  }

  const { userId, text } = payload;

  if (!userId) {
    return { error: "Missing userId" };
  }
  if (!isValidUserId(userId)) {
    return { error: "Invalid userId" };
  }

  if (typeof text !== "string") {
    return { error: "Invalid text", details: "Must be a string" };
  }

  const sanitized = sanitizeString(text);
  if (!sanitized) {
    return { error: "Empty message" };
  }

  return { data: { userId, text: sanitized } };
}

/**
 * Validates image payload
 * @param {Object} payload - The image payload
 * @returns {Object|null} - Validated data or error
 */
export function validateImagePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { error: "Invalid payload format" };
  }

  const { userId, dataUrl, caption } = payload;

  if (!userId) {
    return { error: "Missing userId" };
  }
  if (!isValidUserId(userId)) {
    return { error: "Invalid userId" };
  }

  if (!dataUrl || typeof dataUrl !== "string") {
    return { error: "Missing or invalid dataUrl" };
  }

  if (!isValidDataUrl(dataUrl)) {
    return { error: "Invalid image format", details: "Must be a valid image data URL" };
  }

  let sanitizedCaption;
  if (caption !== undefined) {
    if (typeof caption !== "string") {
      return { error: "Invalid caption", details: "Must be a string" };
    }
    sanitizedCaption = sanitizeString(caption, MAX_CAPTION_LENGTH);
  }

  return { data: { userId, dataUrl, caption: sanitizedCaption } };
}

/**
 * Validates typing indicator payload
 * @param {Object} payload - The typing payload
 * @returns {Object|null} - Validated data or error
 */
export function validateTypingPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { error: "Invalid payload format" };
  }

  const { userId, isTyping } = payload;

  if (!userId) {
    return { error: "Missing userId" };
  }
  if (!isValidUserId(userId)) {
    return { error: "Invalid userId" };
  }

  return { data: { userId, isTyping: !!isTyping } };
}

/**
 * Validates WebRTC signaling payloads
 * @param {Object} payload - The WebRTC payload
 * @returns {Object|null} - Validated data or error
 */
export function validateWebRTCPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { error: "Invalid payload format" };
  }

  const { userId, offer, answer, candidate } = payload;

  if (!userId) {
    return { error: "Missing userId" };
  }
  if (!isValidUserId(userId)) {
    return { error: "Invalid userId" };
  }

  // Validate that at least one of offer, answer, or candidate is present
  if (!offer && !answer && candidate === undefined) {
    return { error: "Missing WebRTC data", details: "Must include offer, answer, or candidate" };
  }

  return { data: { userId, offer, answer, candidate } };
}

/**
 * Validates simple userId-only payload (for stop, report, disconnect)
 * @param {Object} payload - The payload
 * @returns {Object|null} - Validated data or error
 */
export function validateUserIdPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { error: "Invalid payload format" };
  }

  const { userId } = payload;

  if (!userId) {
    return { error: "Missing userId" };
  }
  if (!isValidUserId(userId)) {
    return { error: "Invalid userId" };
  }

  return { data: { userId } };
}

/**
 * Validates videochat message payload
 * @param {Object} payload - The videochat message payload
 * @returns {Object|null} - Validated data or error
 */
export function validateVideoChatMessagePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { error: "Invalid payload format" };
  }

  const { userId, text } = payload;

  if (!userId) {
    return { error: "Missing userId" };
  }
  if (!isValidUserId(userId)) {
    return { error: "Invalid userId" };
  }

  if (typeof text !== "string") {
    return { error: "Invalid text" };
  }

  const sanitized = sanitizeString(text, 500); // Video chat allows slightly longer
  if (!sanitized) {
    return { error: "Empty message" };
  }

  return { data: { userId, text: sanitized } };
}
