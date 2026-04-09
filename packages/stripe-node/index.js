// Stripe Node.js SDK — Integration helper for beepack
// Points to the real SDK: https://github.com/stripe/stripe-node
// Install the real package: npm install stripe

/**
 * Stripe API client using native fetch. Covers common payment operations.
 * For production, use the official `stripe` npm package.
 */

const STRIPE_API = "https://api.stripe.com/v1";

async function stripeRequest(secretKey, method, path, body) {
  const headers = { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" };
  const opts = { method, headers, signal: AbortSignal.timeout(15000) };
  if (body) opts.body = new URLSearchParams(body).toString();
  const res = await fetch(`${STRIPE_API}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${res.status}: ${data.error?.message || "Unknown error"}`);
  return data;
}

/** Create a Payment Intent. */
export async function createPaymentIntent(secretKey, { amount, currency = "usd", metadata }) {
  const body = { amount: String(amount), currency };
  if (metadata) Object.entries(metadata).forEach(([k, v]) => body[`metadata[${k}]`] = v);
  return stripeRequest(secretKey, "POST", "/payment_intents", body);
}

/** Create a Checkout Session. */
export async function createCheckoutSession(secretKey, { lineItems, mode = "payment", successUrl, cancelUrl }) {
  const body = { mode, success_url: successUrl, cancel_url: cancelUrl };
  lineItems.forEach((item, i) => {
    body[`line_items[${i}][price_data][currency]`] = item.currency || "usd";
    body[`line_items[${i}][price_data][product_data][name]`] = item.name;
    body[`line_items[${i}][price_data][unit_amount]`] = String(item.amount);
    body[`line_items[${i}][quantity]`] = String(item.quantity || 1);
  });
  return stripeRequest(secretKey, "POST", "/checkout/sessions", body);
}

/** List customers. */
export async function listCustomers(secretKey, { limit = 10, email } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (email) params.set("email", email);
  return stripeRequest(secretKey, "GET", `/customers?${params}`, null);
}

/** Verify a Stripe webhook signature (HMAC-SHA256). */
export async function verifyWebhookSignature(payload, sigHeader, webhookSecret, tolerance = 300) {
  const parts = Object.fromEntries(sigHeader.split(",").map(p => p.split("=")));
  const timestamp = parseInt(parts.t);
  if (Math.abs(Date.now() / 1000 - timestamp) > tolerance) return { valid: false, error: "timestamp_expired" };
  const signed = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(webhookSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signed));
  const expected = Array.from(new Uint8Array(sig), b => b.toString(16).padStart(2, "0")).join("");
  return { valid: expected === parts.v1, event: expected === parts.v1 ? JSON.parse(payload) : null };
}
