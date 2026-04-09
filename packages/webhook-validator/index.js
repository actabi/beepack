// Webhook Validator
// Zero dependencies. Uses native Web Crypto API (Node >= 18 / all modern runtimes).
// Handles the hard parts: raw body preservation, timing-safe HMAC, replay prevention,
// and the provider-specific quirks that silently break naive implementations.

/**
 * @typedef {"stripe"|"github"|"slack"|"linear"|"shopify"|"vercel"} Provider
 */

/**
 * @typedef {object} ValidResult
 * @property {true} valid
 * @property {Provider} provider
 * @property {object} payload - Parsed JSON body
 */

/**
 * @typedef {object} InvalidResult
 * @property {false} valid
 * @property {Provider|null} provider
 * @property {string} error
 */

/**
 * @typedef {ValidResult | InvalidResult} VerifyResult
 *
 * Discriminated union — narrow with `if (result.valid)` to access `.payload`.
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const enc = new TextEncoder();

/**
 * Import a raw HMAC-SHA256 key via Web Crypto.
 * @param {string} secret
 * @returns {Promise<CryptoKey>}
 */
async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

/**
 * Compute HMAC-SHA256 of `message` using `secret`, returned as a lowercase hex string.
 * @param {string} secret
 * @param {string} message
 * @returns {Promise<string>}
 */
async function hmacSha256Hex(secret, message) {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Timing-safe comparison of two ASCII strings using Web Crypto HMAC verify.
 * Avoids the === short-circuit that leaks signature length/prefix via timing.
 *
 * Both strings are signed with an ephemeral random key so an attacker cannot
 * manipulate the comparison through crafted input.
 *
 * @param {string} a
 * @param {string} b
 * @returns {Promise<boolean>}
 */
async function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sigA = await crypto.subtle.sign("HMAC", key, enc.encode(a));
  return crypto.subtle.verify("HMAC", key, sigA, enc.encode(b));
}

/**
 * Check that a Unix timestamp (in seconds) is within the allowed age window.
 * @param {number} timestampSec - Event timestamp in seconds
 * @param {number} toleranceSec - Max allowed age in seconds
 * @returns {{ok: boolean, ageSec: number}}
 */
function checkTimestamp(timestampSec, toleranceSec) {
  const ageSec = Math.floor(Date.now() / 1000) - timestampSec;
  return { ok: Math.abs(ageSec) <= toleranceSec, ageSec };
}

// ---------------------------------------------------------------------------
// Provider: Stripe
// ---------------------------------------------------------------------------

/**
 * Verify a Stripe webhook (v1 signing scheme).
 *
 * Stripe signs `"${timestamp}.${rawBody}"` and puts `t=<ts>,v1=<sig>` in
 * the `Stripe-Signature` header. The t= component is mandatory — omitting it
 * from the signed payload is a classic implementation mistake.
 *
 * @param {string} rawBody - Exact bytes received (not re-serialised JSON)
 * @param {string} sigHeader - Value of the `Stripe-Signature` header
 * @param {string} secret - Webhook endpoint secret (whsec_...)
 * @param {number} [toleranceSec=300]
 * @returns {Promise<VerifyResult>}
 */
export async function verifyStripe(rawBody, sigHeader, secret, toleranceSec = 300) {
  try {
    const parts = {};
    for (const part of sigHeader.split(",")) {
      const eq = part.indexOf("=");
      if (eq === -1) continue;
      const k = part.slice(0, eq).trim();
      const v = part.slice(eq + 1);
      // Collect all v1 signatures (Stripe may send multiple during key rotation)
      if (k === "v1") {
        parts.v1 = parts.v1 ? [...parts.v1, v] : [v];
      } else {
        parts[k] = v;
      }
    }

    const timestamp = parts.t;
    const signatures = parts.v1;

    if (!timestamp || !signatures?.length) {
      return { valid: false, provider: "stripe", error: "Missing t= or v1= in Stripe-Signature" };
    }

    const ts = parseInt(timestamp, 10);
    if (isNaN(ts)) {
      return { valid: false, provider: "stripe", error: "Non-numeric timestamp in Stripe-Signature" };
    }

    const { ok, ageSec } = checkTimestamp(ts, toleranceSec);
    if (!ok) {
      return { valid: false, provider: "stripe", error: `Timestamp too old (${ageSec}s). Possible replay attack.` };
    }

    // The signed payload includes the timestamp — omitting this is a critical bug
    const signedPayload = `${timestamp}.${rawBody}`;
    const expected = await hmacSha256Hex(secret, signedPayload);

    // Accept if any of the rotation signatures match
    for (const candidate of signatures) {
      if (await timingSafeEqual(expected, candidate)) {
        return { valid: true, provider: "stripe", payload: JSON.parse(rawBody) };
      }
    }

    return { valid: false, provider: "stripe", error: "Signature mismatch" };
  } catch (err) {
    return { valid: false, provider: "stripe", error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Provider: GitHub
// ---------------------------------------------------------------------------

/**
 * Verify a GitHub webhook (sha256 scheme).
 *
 * GitHub puts `sha256=<hex>` in the `X-Hub-Signature-256` header.
 *
 * @param {string} rawBody - Raw request body string
 * @param {string} sigHeader - Value of the `X-Hub-Signature-256` header
 * @param {string} secret - Webhook secret configured in the GitHub repo/org settings
 * @returns {Promise<VerifyResult>}
 */
export async function verifyGitHub(rawBody, sigHeader, secret) {
  try {
    const prefix = "sha256=";
    if (!sigHeader?.startsWith(prefix)) {
      return { valid: false, provider: "github", error: "Missing or malformed X-Hub-Signature-256 header" };
    }

    const receivedSig = sigHeader.slice(prefix.length);
    const expectedSig = await hmacSha256Hex(secret, rawBody);

    if (!(await timingSafeEqual(expectedSig, receivedSig))) {
      return { valid: false, provider: "github", error: "Signature mismatch" };
    }

    return { valid: true, provider: "github", payload: JSON.parse(rawBody) };
  } catch (err) {
    return { valid: false, provider: "github", error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Provider: Slack
// ---------------------------------------------------------------------------

/**
 * Verify a Slack webhook / Events API request (v0 signing scheme).
 *
 * Slack signs `"v0:${timestamp}:${rawBody}"` and puts
 * `v0=<hex>` in `X-Slack-Signature`. The `X-Slack-Request-Timestamp`
 * header must also pass the replay-window check (default 5 minutes).
 *
 * @param {string} rawBody - Raw request body string
 * @param {string} sigHeader - Value of the `X-Slack-Signature` header
 * @param {string} timestampHeader - Value of the `X-Slack-Request-Timestamp` header
 * @param {string} signingSecret - Slack app signing secret
 * @param {number} [toleranceSec=300]
 * @returns {Promise<VerifyResult>}
 */
export async function verifySlack(rawBody, sigHeader, timestampHeader, signingSecret, toleranceSec = 300) {
  try {
    if (!sigHeader || !timestampHeader) {
      return { valid: false, provider: "slack", error: "Missing X-Slack-Signature or X-Slack-Request-Timestamp" };
    }

    const ts = parseInt(timestampHeader, 10);
    if (isNaN(ts)) {
      return { valid: false, provider: "slack", error: "Non-numeric X-Slack-Request-Timestamp" };
    }

    const { ok, ageSec } = checkTimestamp(ts, toleranceSec);
    if (!ok) {
      return { valid: false, provider: "slack", error: `Timestamp too old (${ageSec}s). Possible replay attack.` };
    }

    const baseString = `v0:${ts}:${rawBody}`;
    const expected = `v0=${await hmacSha256Hex(signingSecret, baseString)}`;

    if (!(await timingSafeEqual(expected, sigHeader))) {
      return { valid: false, provider: "slack", error: "Signature mismatch" };
    }

    // Slack sends form-encoded or JSON depending on the endpoint type
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = Object.fromEntries(new URLSearchParams(rawBody));
    }

    return { valid: true, provider: "slack", payload };
  } catch (err) {
    return { valid: false, provider: "slack", error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Provider: Linear
// ---------------------------------------------------------------------------

/**
 * Verify a Linear webhook.
 *
 * Linear puts a hex HMAC-SHA256 in the `Linear-Signature` header,
 * signing the raw request body with your webhook secret.
 *
 * @param {string} rawBody - Raw request body string
 * @param {string} sigHeader - Value of the `Linear-Signature` header
 * @param {string} secret - Webhook signing secret from Linear settings
 * @returns {Promise<VerifyResult>}
 */
export async function verifyLinear(rawBody, sigHeader, secret) {
  try {
    if (!sigHeader) {
      return { valid: false, provider: "linear", error: "Missing Linear-Signature header" };
    }

    const expected = await hmacSha256Hex(secret, rawBody);

    if (!(await timingSafeEqual(expected, sigHeader))) {
      return { valid: false, provider: "linear", error: "Signature mismatch" };
    }

    return { valid: true, provider: "linear", payload: JSON.parse(rawBody) };
  } catch (err) {
    return { valid: false, provider: "linear", error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Provider: Shopify
// ---------------------------------------------------------------------------

/**
 * Verify a Shopify webhook (HMAC-SHA256, base64-encoded).
 *
 * Shopify puts a base64-encoded HMAC in `X-Shopify-Hmac-Sha256`,
 * signing the raw body with your shared secret.
 *
 * @param {string|Uint8Array} rawBody - Raw request body (string or bytes)
 * @param {string} hmacHeader - Value of the `X-Shopify-Hmac-Sha256` header (base64)
 * @param {string} secret - Shopify webhook shared secret
 * @returns {Promise<VerifyResult>}
 */
export async function verifyShopify(rawBody, hmacHeader, secret) {
  try {
    if (!hmacHeader) {
      return { valid: false, provider: "shopify", error: "Missing X-Shopify-Hmac-Sha256 header" };
    }

    const bodyBytes = typeof rawBody === "string" ? enc.encode(rawBody) : rawBody;
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, bodyBytes);

    // Convert received base64 to hex for timing-safe comparison
    const receivedBytes = Uint8Array.from(atob(hmacHeader), (c) => c.charCodeAt(0));
    const receivedHex = Array.from(receivedBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const expectedHex = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (!(await timingSafeEqual(expectedHex, receivedHex))) {
      return { valid: false, provider: "shopify", error: "Signature mismatch" };
    }

    const bodyStr = typeof rawBody === "string" ? rawBody : new TextDecoder().decode(rawBody);
    return { valid: true, provider: "shopify", payload: JSON.parse(bodyStr) };
  } catch (err) {
    return { valid: false, provider: "shopify", error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Provider: Vercel
// ---------------------------------------------------------------------------

/**
 * Verify a Vercel webhook (HMAC-SHA1 scheme).
 *
 * Vercel uses HMAC-SHA1 and puts `sha1=<hex>` in `x-vercel-signature`.
 *
 * @param {string} rawBody - Raw request body string
 * @param {string} sigHeader - Value of the `x-vercel-signature` header
 * @param {string} secret - Vercel webhook secret
 * @returns {Promise<VerifyResult>}
 */
export async function verifyVercel(rawBody, sigHeader, secret) {
  try {
    const prefix = "sha1=";
    if (!sigHeader?.startsWith(prefix)) {
      return { valid: false, provider: "vercel", error: "Missing or malformed x-vercel-signature header" };
    }

    const receivedSig = sigHeader.slice(prefix.length);

    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-1" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
    const expectedSig = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (!(await timingSafeEqual(expectedSig, receivedSig))) {
      return { valid: false, provider: "vercel", error: "Signature mismatch" };
    }

    return { valid: true, provider: "vercel", payload: JSON.parse(rawBody) };
  } catch (err) {
    return { valid: false, provider: "vercel", error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Provider auto-detection
// ---------------------------------------------------------------------------

/**
 * Detect the webhook provider from request headers.
 *
 * Returns the first confident match. For ambiguous requests (no identifying
 * headers), returns null — callers should fall back to explicit verification.
 *
 * @param {Record<string, string|string[]>} headers - Request headers (case-insensitive keys)
 * @returns {Provider|null}
 */
export function detectProvider(headers) {
  const h = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v])
  );

  if (h["stripe-signature"]) return "stripe";
  if (h["x-hub-signature-256"] || h["x-github-event"]) return "github";
  if (h["x-slack-signature"] && h["x-slack-request-timestamp"]) return "slack";
  if (h["linear-signature"]) return "linear";
  if (h["x-shopify-hmac-sha256"] || h["x-shopify-topic"]) return "shopify";
  if (h["x-vercel-signature"]) return "vercel";

  return null;
}

// ---------------------------------------------------------------------------
// Universal verifier (auto-detect + dispatch)
// ---------------------------------------------------------------------------

/**
 * Configuration map for the universal verifier.
 *
 * @typedef {object} WebhookSecrets
 * @property {string} [stripe] - Stripe webhook secret (whsec_...)
 * @property {string} [github] - GitHub webhook secret
 * @property {string} [slack]  - Slack signing secret
 * @property {string} [linear] - Linear webhook secret
 * @property {string} [shopify] - Shopify shared secret
 * @property {string} [vercel] - Vercel webhook secret
 */

/**
 * Auto-detect the provider from headers and verify the webhook signature.
 *
 * Pass all your secrets in one map — only the matching provider's secret is used.
 * This lets you use a single webhook endpoint for multiple providers.
 *
 * @param {object} request
 * @param {Record<string, string|string[]>} request.headers - Request headers
 * @param {string} request.rawBody - Raw (unparsed) request body string
 * @param {WebhookSecrets} secrets - Per-provider secrets
 * @param {number} [toleranceSec=300] - Replay window for providers that support it
 * @returns {Promise<VerifyResult>}
 *
 * @example
 * const result = await verifyWebhook(
 *   { headers: req.headers, rawBody: req.rawBody },
 *   { stripe: process.env.STRIPE_WEBHOOK_SECRET, github: process.env.GITHUB_WEBHOOK_SECRET }
 * );
 * if (result.valid) {
 *   console.log(result.provider, result.payload);
 * }
 */
export async function verifyWebhook({ headers, rawBody }, secrets, toleranceSec = 300) {
  const provider = detectProvider(headers);

  if (!provider) {
    return { valid: false, provider: null, error: "Could not detect provider from request headers" };
  }

  const h = Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v[0] : v])
  );

  switch (provider) {
    case "stripe":
      if (!secrets.stripe) return { valid: false, provider, error: "No Stripe secret provided" };
      return verifyStripe(rawBody, h["stripe-signature"], secrets.stripe, toleranceSec);

    case "github":
      if (!secrets.github) return { valid: false, provider, error: "No GitHub secret provided" };
      return verifyGitHub(rawBody, h["x-hub-signature-256"], secrets.github);

    case "slack":
      if (!secrets.slack) return { valid: false, provider, error: "No Slack secret provided" };
      return verifySlack(rawBody, h["x-slack-signature"], h["x-slack-request-timestamp"], secrets.slack, toleranceSec);

    case "linear":
      if (!secrets.linear) return { valid: false, provider, error: "No Linear secret provided" };
      return verifyLinear(rawBody, h["linear-signature"], secrets.linear);

    case "shopify":
      if (!secrets.shopify) return { valid: false, provider, error: "No Shopify secret provided" };
      return verifyShopify(rawBody, h["x-shopify-hmac-sha256"], secrets.shopify);

    case "vercel":
      if (!secrets.vercel) return { valid: false, provider, error: "No Vercel secret provided" };
      return verifyVercel(rawBody, h["x-vercel-signature"], secrets.vercel);

    default:
      return { valid: false, provider: null, error: `Unknown provider: ${provider}` };
  }
}

// ---------------------------------------------------------------------------
// Raw body middleware
// ---------------------------------------------------------------------------

/**
 * Express/Connect middleware that buffers the raw request body into `req.rawBody`.
 *
 * CRITICAL: JSON.parse() or body-parser middleware must NOT run before this.
 * Once the body stream is consumed and re-serialised, byte-level fidelity is
 * lost (whitespace, key order, encoding) and HMAC verification will always fail.
 *
 * Mount this before any body-parsing middleware on webhook routes.
 *
 * @param {object} req - Node.js IncomingMessage / Express Request
 * @param {object} res - Node.js ServerResponse / Express Response
 * @param {Function} next - Next middleware function
 *
 * @example
 * // Express setup
 * import express from "express";
 * import { rawBodyMiddleware } from "./index.js";
 *
 * const app = express();
 *
 * // Webhook route — raw body FIRST, no global body-parser
 * app.post("/webhook", rawBodyMiddleware, async (req, res) => {
 *   const result = await verifyWebhook(
 *     { headers: req.headers, rawBody: req.rawBody },
 *     { stripe: process.env.STRIPE_WEBHOOK_SECRET }
 *   );
 *   if (!result.valid) return res.status(400).send(result.error);
 *   res.sendStatus(200);
 * });
 *
 * // Other routes can use body-parser normally
 * app.use(express.json());
 */
export function rawBodyMiddleware(req, res, next) {
  const chunks = [];

  req.on("data", (chunk) => chunks.push(chunk));

  req.on("end", () => {
    const buf = Buffer.concat(chunks);
    req.rawBody = buf.toString("utf8");
    // Also expose as Buffer for providers that may want binary comparison (Shopify)
    req.rawBodyBuffer = buf;
    next();
  });

  req.on("error", (err) => {
    next(err);
  });
}

/**
 * Web Fetch API / Edge runtime equivalent of rawBodyMiddleware.
 * Extracts and returns the raw body string from a Request object.
 *
 * Call this once at the top of your handler — reading .body twice will throw.
 *
 * @param {Request} request - Web API Request object (Next.js, Cloudflare Workers, etc.)
 * @returns {Promise<string>} Raw body string
 *
 * @example
 * // Next.js App Router route handler
 * import { getRawBody, verifyWebhook } from "./index.js";
 *
 * export async function POST(request) {
 *   const rawBody = await getRawBody(request);
 *   const result = await verifyWebhook(
 *     { headers: Object.fromEntries(request.headers), rawBody },
 *     { stripe: process.env.STRIPE_WEBHOOK_SECRET }
 *   );
 *   if (!result.valid) return new Response(result.error, { status: 400 });
 *   return new Response("ok");
 * }
 */
export async function getRawBody(request) {
  return request.text();
}
