// Lucia Auth — Integration helper for beepack
// Points to the real library: https://github.com/lucia-auth/lucia
// Install the real package: npm install lucia

/**
 * Session utilities inspired by Lucia's minimalist approach.
 * Provides session creation, validation, and cleanup using Web Crypto API.
 */

const ENCODER = new TextEncoder();

/** Generate a cryptographically random session token. */
export function generateSessionToken(length = 32) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

/** Hash a session token for storage (SHA-256). */
export async function hashToken(token) {
  const data = ENCODER.encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Create a session object.
 * @param {string} userId
 * @param {number} [expiresInMs=604800000] - Default 7 days
 */
export async function createSession(userId, expiresInMs = 7 * 24 * 60 * 60 * 1000) {
  const token = generateSessionToken();
  const hashedToken = await hashToken(token);
  const expiresAt = new Date(Date.now() + expiresInMs);
  return { token, hashedToken, userId, expiresAt: expiresAt.toISOString(), fresh: true };
}

/**
 * Validate a session token against a stored hash.
 * @param {string} token - Raw session token
 * @param {string} storedHash - Stored hashed token
 * @param {string} expiresAt - ISO expiration date
 */
export async function validateSession(token, storedHash, expiresAt) {
  const hash = await hashToken(token);
  if (hash !== storedHash) return { valid: false, reason: "invalid_token" };
  if (new Date(expiresAt) < new Date()) return { valid: false, reason: "expired" };
  return { valid: true };
}
