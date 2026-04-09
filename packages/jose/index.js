// jose — JWT/JWK/JWS/JWE Integration helper for beepack
// Points to the real library: https://github.com/panva/jose
// Install the real package: npm install jose

/**
 * JWT utilities using the Web Crypto API, inspired by the jose library.
 * Handles signing, verifying, and decoding JWTs with HMAC-SHA256.
 */

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

function base64url(data) {
  if (typeof data === "string") data = ENCODER.encode(data);
  return btoa(String.fromCharCode(...new Uint8Array(data)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function getKey(secret) {
  return crypto.subtle.importKey("raw", ENCODER.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/**
 * Sign a JWT payload.
 * @param {object} payload - Claims (sub, iat, exp auto-set)
 * @param {string} secret - HMAC secret
 * @param {number} [expiresInSec=3600] - Expiration in seconds
 */
export async function signJWT(payload, secret, expiresInSec = 3600) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const claims = { iat: now, exp: now + expiresInSec, ...payload };
  const body = base64url(JSON.stringify(claims));
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, ENCODER.encode(`${header}.${body}`));
  return `${header}.${body}.${base64url(sig)}`;
}

/**
 * Verify and decode a JWT.
 * @param {string} token - JWT string
 * @param {string} secret - HMAC secret
 * @returns {Promise<{valid: boolean, payload?: object, error?: string}>}
 */
export async function verifyJWT(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, error: "malformed_token" };
  const key = await getKey(secret);
  const valid = await crypto.subtle.verify("HMAC", key, base64urlDecode(parts[2]), ENCODER.encode(`${parts[0]}.${parts[1]}`));
  if (!valid) return { valid: false, error: "invalid_signature" };
  const payload = JSON.parse(DECODER.decode(base64urlDecode(parts[1])));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return { valid: false, error: "expired" };
  return { valid: true, payload };
}

/** Decode a JWT without verification (for debugging). */
export function decodeJWT(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  return {
    header: JSON.parse(DECODER.decode(base64urlDecode(parts[0]))),
    payload: JSON.parse(DECODER.decode(base64urlDecode(parts[1]))),
  };
}
