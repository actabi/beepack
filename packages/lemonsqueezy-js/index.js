// Lemon Squeezy JS SDK — Integration helper for beepack
// Points to the real SDK: https://github.com/lmsqueezy/lemonsqueezy.js
// Install the real package: npm install @lemonsqueezy/lemonsqueezy.js

/**
 * Lemon Squeezy API client using native fetch.
 */

const LS_API = "https://api.lemonsqueezy.com/v1";

async function lsRequest(apiKey, method, path, body) {
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/vnd.api+json", "Content-Type": "application/vnd.api+json" };
  const opts = { method, headers, signal: AbortSignal.timeout(15000) };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${LS_API}${path}`, opts);
  return res.json();
}

/** List all products for a store. */
export async function listProducts(apiKey, storeId) {
  return lsRequest(apiKey, "GET", `/products?filter[store_id]=${storeId}`);
}

/** Create a checkout URL. */
export async function createCheckout(apiKey, { storeId, variantId, email, customData }) {
  const payload = { data: { type: "checkouts", attributes: {
    checkout_data: { email, custom: customData || {} } },
    relationships: { store: { data: { type: "stores", id: String(storeId) } },
      variant: { data: { type: "variants", id: String(variantId) } } } } };
  return lsRequest(apiKey, "POST", "/checkouts", payload);
}

/** List subscriptions. */
export async function listSubscriptions(apiKey, { storeId, status } = {}) {
  const params = new URLSearchParams();
  if (storeId) params.set("filter[store_id]", storeId);
  if (status) params.set("filter[status]", status);
  return lsRequest(apiKey, "GET", `/subscriptions?${params}`);
}

/** Verify a Lemon Squeezy webhook signature. */
export async function verifyWebhook(payload, signature, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, "0")).join("");
  return expected === signature;
}
