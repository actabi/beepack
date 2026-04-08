// JWT Auth — Access + Refresh Token Pair
// Zero dependencies. Uses native Web Crypto API (Node >= 18 / all modern runtimes).
// Algorithm pinned to HMAC-SHA256. Returns null on all errors — never throws to callers.

const enc = new TextEncoder();

// Secure defaults
const DEFAULT_ACCESS_TTL_SEC = 15 * 60;        // 15 minutes
const DEFAULT_REFRESH_TTL_SEC = 7 * 24 * 3600; // 7 days
const ALGORITHM = "HS256";
const CRYPTO_ALGORITHM = { name: "HMAC", hash: "SHA-256" };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Base64url-encode a Uint8Array or ArrayBuffer.
 * @param {Uint8Array|ArrayBuffer} buf
 * @returns {string}
 */
function b64urlEncode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = "";
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Base64url-decode a string to Uint8Array. Returns null on bad input.
 * @param {string} str
 * @returns {Uint8Array|null}
 */
function b64urlDecode(str) {
  try {
    const padded = str.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Import a raw HMAC-SHA256 signing key from a secret string.
 * @param {string} secret
 * @returns {Promise<CryptoKey>}
 */
async function importKey(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), CRYPTO_ALGORITHM, false, ["sign", "verify"]);
}

/**
 * Generate a cryptographically random URL-safe token (hex string).
 * @param {number} [bytes=32]
 * @returns {string}
 */
function randomToken(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Current Unix timestamp in seconds.
 * @returns {number}
 */
function nowSec() {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// JWT primitives
// ---------------------------------------------------------------------------

/**
 * Sign and encode a JWT with HMAC-SHA256. Algorithm is always pinned to HS256.
 *
 * @param {object} payload - Claims to include (sub, aud, exp, iat will be set/enforced)
 * @param {string} secret - HMAC signing secret
 * @returns {Promise<string>} Signed JWT string
 */
async function encodeJwt(payload, secret) {
  const header = b64urlEncode(enc.encode(JSON.stringify({ alg: ALGORITHM, typ: "JWT" })));
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${header}.${body}`;
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
  return `${signingInput}.${b64urlEncode(sig)}`;
}

/**
 * Decode and verify a JWT. Enforces algorithm pinning (HS256 only), expiry,
 * and optionally audience. Returns null for any validation failure.
 *
 * @param {string} token - JWT string
 * @param {string} secret - HMAC signing secret
 * @param {object} [options]
 * @param {string} [options.audience] - Required audience claim (aud)
 * @returns {Promise<object|null>} Verified payload, or null on any failure
 */
async function decodeJwt(token, secret, options = {}) {
  if (typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [rawHeader, rawBody, rawSig] = parts;

  // Decode header and pin algorithm — reject anything that isn't HS256
  const headerBytes = b64urlDecode(rawHeader);
  if (!headerBytes) return null;
  let header;
  try {
    header = JSON.parse(new TextDecoder().decode(headerBytes));
  } catch {
    return null;
  }
  if (header.alg !== ALGORITHM) {
    console.error(`[jwt-auth] Algorithm mismatch: expected ${ALGORITHM}, got ${header.alg}`);
    return null;
  }

  // Verify signature
  const sigBytes = b64urlDecode(rawSig);
  if (!sigBytes) return null;
  const key = await importKey(secret);
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(`${rawHeader}.${rawBody}`));
  if (!valid) {
    console.error("[jwt-auth] Signature verification failed");
    return null;
  }

  // Decode payload
  const bodyBytes = b64urlDecode(rawBody);
  if (!bodyBytes) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return null;
  }

  // Enforce expiry — tokens without exp are rejected
  if (typeof payload.exp !== "number") {
    console.error("[jwt-auth] Token missing exp claim — rejecting");
    return null;
  }
  if (nowSec() > payload.exp) {
    console.error("[jwt-auth] Token expired");
    return null;
  }

  // Enforce audience if required
  if (options.audience) {
    const aud = payload.aud;
    const audList = Array.isArray(aud) ? aud : [aud];
    if (!audList.includes(options.audience)) {
      console.error(`[jwt-auth] Audience mismatch: expected "${options.audience}", got ${JSON.stringify(aud)}`);
      return null;
    }
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * @typedef {object} TokenPair
 * @property {string} accessToken  - Short-lived JWT for API access
 * @property {string} refreshToken - Opaque long-lived token for rotation
 * @property {number} accessExpiresAt  - Unix timestamp (seconds) the access token expires
 * @property {number} refreshExpiresAt - Unix timestamp (seconds) the refresh token expires
 * @property {string} family - Refresh token family ID (tracks rotation lineage)
 */

/**
 * Generate an access + refresh token pair.
 *
 * The access token is a signed JWT (HMAC-SHA256). The refresh token is an
 * opaque 32-byte random hex string bound to a family ID so replay attacks
 * can be detected during rotation.
 *
 * @param {object} claims - Custom payload claims to embed in the access token
 * @param {string} claims.sub - Subject identifier (user ID, required)
 * @param {string} [claims.aud] - Audience (recommended; enforced on verify if set)
 * @param {string} secret - HMAC signing secret (use process.env.JWT_SECRET)
 * @param {object} [options]
 * @param {number} [options.accessTtlSec=900]   - Access token TTL in seconds (default 15 min)
 * @param {number} [options.refreshTtlSec=604800] - Refresh token TTL in seconds (default 7 days)
 * @param {string} [options.family] - Existing family ID to continue (omit to start a new family)
 * @returns {Promise<TokenPair|null>}
 */
export async function generateTokenPair(claims, secret, options = {}) {
  if (!claims?.sub) {
    console.error("[jwt-auth] generateTokenPair: claims.sub is required");
    return null;
  }
  if (!secret) {
    console.error("[jwt-auth] generateTokenPair: secret is required (set JWT_SECRET)");
    return null;
  }

  try {
    const now = nowSec();
    const accessTtl = options.accessTtlSec ?? DEFAULT_ACCESS_TTL_SEC;
    const refreshTtl = options.refreshTtlSec ?? DEFAULT_REFRESH_TTL_SEC;
    const family = options.family ?? randomToken(16);

    const accessPayload = {
      ...claims,
      iat: now,
      exp: now + accessTtl,
      type: "access",
    };

    const accessToken = await encodeJwt(accessPayload, secret);
    const refreshToken = randomToken(32);
    const accessExpiresAt = now + accessTtl;
    const refreshExpiresAt = now + refreshTtl;

    return { accessToken, refreshToken, accessExpiresAt, refreshExpiresAt, family };
  } catch (err) {
    console.error(`[jwt-auth] generateTokenPair failed: ${err.message}`);
    return null;
  }
}

/**
 * Verify an access token JWT.
 *
 * Enforces algorithm pinning (HS256), expiry, and optionally audience.
 * Returns null for any invalid token — callers must treat null as unauthorized.
 *
 * @param {string} token - JWT access token string
 * @param {string} secret - HMAC signing secret
 * @param {object} [options]
 * @param {string} [options.audience] - Expected audience claim value
 * @returns {Promise<object|null>} Verified payload claims, or null
 */
export async function verifyAccessToken(token, secret, options = {}) {
  if (!secret) {
    console.error("[jwt-auth] verifyAccessToken: secret is required (set JWT_SECRET)");
    return null;
  }
  try {
    const payload = await decodeJwt(token, secret, options);
    if (!payload) return null;
    if (payload.type !== "access") {
      console.error("[jwt-auth] verifyAccessToken: token type is not 'access'");
      return null;
    }
    return payload;
  } catch (err) {
    console.error(`[jwt-auth] verifyAccessToken failed: ${err.message}`);
    return null;
  }
}

/**
 * @typedef {object} RefreshRecord
 * @property {string} token  - The current valid refresh token value
 * @property {string} family - Family ID this token belongs to
 * @property {number} expiresAt - Unix timestamp (seconds) the refresh token expires
 */

/**
 * Rotate a refresh token, issuing a new access + refresh token pair.
 *
 * Implements refresh token family tracking: if the presented token does not
 * match the stored token for the family, the entire family is considered
 * compromised (replay attack detected) and rotation is refused. Callers must
 * invalidate all tokens in the family when null is returned with reason "replay".
 *
 * @param {object} params
 * @param {string} params.refreshToken - The refresh token presented by the client
 * @param {RefreshRecord} params.stored - Token record retrieved from your store
 * @param {object} params.claims - Claims to embed in the new access token (must include sub)
 * @param {string} params.secret - HMAC signing secret
 * @param {object} [params.options] - Same options as generateTokenPair
 * @param {(token: string, family: string) => Promise<boolean>} [params.isBlacklisted]
 *   Optional async hook. Return true if the token (or family) is blacklisted.
 * @returns {Promise<{pair: TokenPair, invalidate: string}|{pair: null, reason: string}|null>}
 *   On success: `{ pair: TokenPair, invalidate: <old refresh token> }`
 *   On replay:  `{ pair: null, reason: "replay" }` — caller must revoke the whole family
 *   On other failure: null
 */
export async function rotateRefreshToken(params) {
  const { refreshToken, stored, claims, secret, options = {}, isBlacklisted } = params;

  if (!refreshToken || !stored || !claims?.sub || !secret) {
    console.error("[jwt-auth] rotateRefreshToken: missing required params");
    return null;
  }

  try {
    // Blacklist check
    if (typeof isBlacklisted === "function") {
      const blocked = await isBlacklisted(refreshToken, stored.family);
      if (blocked) {
        console.error(`[jwt-auth] rotateRefreshToken: token or family is blacklisted (family=${stored.family})`);
        return null;
      }
    }

    // Replay detection — token must match exactly what is stored for this family
    if (refreshToken !== stored.token) {
      console.error(`[jwt-auth] rotateRefreshToken: replay detected — token mismatch for family ${stored.family}`);
      return { pair: null, reason: "replay" };
    }

    // Expiry check on the refresh token itself
    if (nowSec() > stored.expiresAt) {
      console.error(`[jwt-auth] rotateRefreshToken: refresh token expired (family=${stored.family})`);
      return null;
    }

    // Issue new pair, continuing the same family
    const pair = await generateTokenPair(claims, secret, { ...options, family: stored.family });
    if (!pair) return null;

    return { pair, invalidate: refreshToken };
  } catch (err) {
    console.error(`[jwt-auth] rotateRefreshToken failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// HTTP-only cookie helpers
// ---------------------------------------------------------------------------

/**
 * @typedef {object} CookieOptions
 * @property {string}  [name="access_token"]  - Cookie name for access token
 * @property {string}  [refreshName="refresh_token"] - Cookie name for refresh token
 * @property {string}  [path="/"]             - Cookie path
 * @property {string}  [sameSite="Strict"]    - SameSite policy ("Strict"|"Lax"|"None")
 * @property {boolean} [secure=true]          - Set Secure flag (disable only in dev HTTP)
 * @property {string}  [domain]               - Cookie domain (omit for current origin)
 */

/**
 * Build Set-Cookie header strings for an access + refresh token pair.
 *
 * Both cookies are HttpOnly and (by default) Secure, Strict SameSite.
 * Access token cookie TTL mirrors the token expiry. Refresh token cookie
 * TTL mirrors the refresh expiry.
 *
 * @param {TokenPair} pair - Token pair from generateTokenPair or rotateRefreshToken
 * @param {CookieOptions} [opts]
 * @returns {{ accessCookie: string, refreshCookie: string }}
 */
export function buildCookies(pair, opts = {}) {
  const {
    name = "access_token",
    refreshName = "refresh_token",
    path = "/",
    sameSite = "Strict",
    secure = true,
    domain,
  } = opts;

  const now = nowSec();
  const accessMaxAge = Math.max(0, pair.accessExpiresAt - now);
  const refreshMaxAge = Math.max(0, pair.refreshExpiresAt - now);

  const base = [
    `HttpOnly`,
    `Path=${path}`,
    `SameSite=${sameSite}`,
    secure ? "Secure" : null,
    domain ? `Domain=${domain}` : null,
  ].filter(Boolean).join("; ");

  const accessCookie = `${name}=${pair.accessToken}; Max-Age=${accessMaxAge}; ${base}`;
  const refreshCookie = `${refreshName}=${pair.refreshToken}; Max-Age=${refreshMaxAge}; ${base}`;

  return { accessCookie, refreshCookie };
}

/**
 * Build a pair of Set-Cookie headers that clear both token cookies.
 * Use this on logout or after a detected replay attack.
 *
 * @param {CookieOptions} [opts]
 * @returns {{ accessCookie: string, refreshCookie: string }}
 */
export function clearCookies(opts = {}) {
  const { name = "access_token", refreshName = "refresh_token", path = "/", domain } = opts;

  const base = [
    `HttpOnly`,
    `Path=${path}`,
    `Max-Age=0`,
    `SameSite=Strict`,
    `Secure`,
    domain ? `Domain=${domain}` : null,
  ].filter(Boolean).join("; ");

  return {
    accessCookie: `${name}=; ${base}`,
    refreshCookie: `${refreshName}=; ${base}`,
  };
}

/**
 * Parse a Cookie header string and extract token values.
 *
 * @param {string} cookieHeader - Value of the Cookie request header
 * @param {object} [opts]
 * @param {string} [opts.name="access_token"]
 * @param {string} [opts.refreshName="refresh_token"]
 * @returns {{ accessToken: string|null, refreshToken: string|null }}
 */
export function parseCookies(cookieHeader, opts = {}) {
  const { name = "access_token", refreshName = "refresh_token" } = opts;

  if (!cookieHeader) return { accessToken: null, refreshToken: null };

  const map = {};
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    map[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }

  return {
    accessToken: map[name] ?? null,
    refreshToken: map[refreshName] ?? null,
  };
}
