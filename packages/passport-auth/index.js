// Authentication Strategies - Zero dependencies
// Password hashing (PBKDF2), JWT (HS256), OAuth2 flows.

/**
 * Hash a password using Web Crypto (PBKDF2).
 * @param {string} password
 * @param {string} [salt] - Hex salt (generated if not provided)
 * @returns {Promise<{hash: string, salt: string}>}
 */
export async function hashPassword(password, salt) {
  const saltBuf = salt
    ? new Uint8Array(salt.match(/.{2}/g).map(b => parseInt(b, 16)))
    : crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBuf, iterations: 100000, hash: "SHA-256" }, key, 256
  );
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
  const saltHex = Array.from(saltBuf).map(b => b.toString(16).padStart(2, "0")).join("");
  return { hash: hashHex, salt: saltHex };
}

/**
 * Verify a password against a stored hash.
 * @param {string} password
 * @param {string} storedHash
 * @param {string} storedSalt
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, storedHash, storedSalt) {
  const { hash } = await hashPassword(password, storedSalt);
  return hash === storedHash;
}

/**
 * Create a JWT token (HS256).
 * @param {object} payload
 * @param {string} secret
 * @param {number} [expiresInSec=3600]
 * @returns {Promise<string>}
 */
export async function createJwt(payload, secret, expiresInSec = 3600) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = { ...payload, iat: now, exp: now + expiresInSec };
  const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const input = b64url(header) + "." + b64url(claims);
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return input + "." + sigB64;
}

/**
 * Verify and decode a JWT (HS256).
 * @param {string} token
 * @param {string} secret
 * @returns {Promise<object|null>}
 */
export async function verifyJwt(token, secret) {
  const [headerB64, payloadB64, sigB64] = token.split(".");
  if (!headerB64 || !payloadB64 || !sigB64) return null;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
  );
  const sigBytes = Uint8Array.from(atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(headerB64 + "." + payloadB64));
  if (!valid) return null;
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/**
 * Build an OAuth2 authorization URL.
 * @param {object} opts - {authorizeUrl, clientId, redirectUri, scope, state}
 * @returns {string}
 */
export function buildOAuth2Url(opts) {
  const params = new URLSearchParams({
    response_type: "code", client_id: opts.clientId,
    redirect_uri: opts.redirectUri, scope: opts.scope || "",
    state: opts.state || crypto.randomUUID(),
  });
  return opts.authorizeUrl + "?" + params;
}

/**
 * Exchange an OAuth2 authorization code for tokens.
 * @param {object} opts - {tokenUrl, clientId, clientSecret, code, redirectUri}
 * @returns {Promise<object>}
 */
export async function exchangeOAuth2Code(opts) {
  const res = await fetch(opts.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", client_id: opts.clientId,
      client_secret: opts.clientSecret, code: opts.code, redirect_uri: opts.redirectUri,
    }),
  });
  if (!res.ok) throw new Error("OAuth2 exchange " + res.status);
  return res.json();
}