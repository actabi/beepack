// Stripe Checkout Sessions + Webhook Verification
// Zero dependencies - uses native fetch and Web Crypto API.
// Handles the tricky parts: webhook signature verification, idempotency, and subscription lifecycle.

const STRIPE_API = "https://api.stripe.com/v1";

/**
 * Create a Stripe Checkout Session for one-time or subscription payments.
 *
 * @param {string} secretKey - Stripe secret key (sk_live_... or sk_test_...)
 * @param {object} params
 * @param {Array<{name: string, amount: number, currency?: string, quantity?: number}>} params.lineItems
 * @param {"payment"|"subscription"} [params.mode="payment"]
 * @param {string} params.successUrl - Redirect URL on success
 * @param {string} params.cancelUrl - Redirect URL on cancel
 * @param {string} [params.customerEmail] - Pre-fill customer email
 * @param {string} [params.customerId] - Existing Stripe customer ID
 * @param {object} [params.metadata] - Key-value metadata
 * @param {string} [params.idempotencyKey] - Prevent duplicate sessions
 * @returns {Promise<{id: string, url: string}|null>} Session object or null on error
 */
export async function createCheckoutSession(secretKey, params) {
  const {
    lineItems,
    mode = "payment",
    successUrl,
    cancelUrl,
    customerEmail,
    customerId,
    metadata,
    idempotencyKey,
  } = params;

  const body = new URLSearchParams();
  body.append("mode", mode);
  body.append("success_url", successUrl);
  body.append("cancel_url", cancelUrl);

  if (customerEmail) body.append("customer_email", customerEmail);
  if (customerId) body.append("customer", customerId);

  lineItems.forEach((item, i) => {
    body.append(`line_items[${i}][price_data][currency]`, item.currency || "usd");
    body.append(`line_items[${i}][price_data][product_data][name]`, item.name);
    body.append(`line_items[${i}][price_data][unit_amount]`, String(item.amount));
    if (mode === "subscription") {
      body.append(`line_items[${i}][price_data][recurring][interval]`, item.interval || "month");
    }
    body.append(`line_items[${i}][quantity]`, String(item.quantity || 1));
  });

  if (metadata) {
    for (const [k, v] of Object.entries(metadata)) {
      body.append(`metadata[${k}]`, String(v));
    }
  }

  const headers = {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  try {
    const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
      method: "POST",
      headers,
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`[stripe-checkout] API error ${res.status}:`, err.error?.message || "");
      return null;
    }

    const session = await res.json();
    return { id: session.id, url: session.url };
  } catch (err) {
    console.error(`[stripe-checkout] Request failed: ${err.message}`);
    return null;
  }
}

/**
 * Verify a Stripe webhook signature (v1 scheme).
 * Uses Web Crypto API - no dependencies needed.
 *
 * @param {string} payload - Raw request body (string)
 * @param {string} sigHeader - Stripe-Signature header value
 * @param {string} webhookSecret - Webhook endpoint secret (whsec_...)
 * @param {number} [toleranceSec=300] - Max age of event in seconds
 * @returns {Promise<{valid: boolean, event?: object, error?: string}>}
 */
export async function verifyWebhookSignature(payload, sigHeader, webhookSecret, toleranceSec = 300) {
  try {
    const parts = Object.fromEntries(
      sigHeader.split(",").map((p) => {
        const [k, v] = p.split("=");
        return [k.trim(), v];
      })
    );

    const timestamp = parts.t;
    const signature = parts.v1;

    if (!timestamp || !signature) {
      return { valid: false, error: "Missing timestamp or signature" };
    }

    // Check timestamp tolerance
    const age = Math.floor(Date.now() / 1000) - parseInt(timestamp, 10);
    if (Math.abs(age) > toleranceSec) {
      return { valid: false, error: `Timestamp outside tolerance (${age}s)` };
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
    const expectedSig = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (expectedSig !== signature) {
      return { valid: false, error: "Signature mismatch" };
    }

    const event = JSON.parse(payload);
    return { valid: true, event };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Retrieve a Stripe customer's active subscriptions.
 *
 * @param {string} secretKey - Stripe secret key
 * @param {string} customerId - Stripe customer ID (cus_...)
 * @returns {Promise<Array<{id: string, status: string, plan: string, currentPeriodEnd: string}>|null>}
 */
export async function getCustomerSubscriptions(secretKey, customerId) {
  try {
    const params = new URLSearchParams({ customer: customerId, status: "all", limit: "100" });
    const res = await fetch(`${STRIPE_API}/subscriptions?${params}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data.data.map((sub) => ({
      id: sub.id,
      status: sub.status,
      plan: sub.items.data[0]?.price?.id || "unknown",
      currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    }));
  } catch (err) {
    console.error(`[stripe-checkout] Subscription fetch failed: ${err.message}`);
    return null;
  }
}

/**
 * Cancel a subscription (at period end by default).
 *
 * @param {string} secretKey - Stripe secret key
 * @param {string} subscriptionId - Subscription ID (sub_...)
 * @param {boolean} [immediate=false] - Cancel immediately vs at period end
 * @returns {Promise<{id: string, status: string, cancelAt: string|null}|null>}
 */
export async function cancelSubscription(secretKey, subscriptionId, immediate = false) {
  try {
    if (immediate) {
      const res = await fetch(`${STRIPE_API}/subscriptions/${subscriptionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${secretKey}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const sub = await res.json();
      return { id: sub.id, status: sub.status, cancelAt: null };
    }

    const res = await fetch(`${STRIPE_API}/subscriptions/${subscriptionId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "cancel_at_period_end=true",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const sub = await res.json();
    return {
      id: sub.id,
      status: sub.status,
      cancelAt: new Date(sub.current_period_end * 1000).toISOString(),
    };
  } catch (err) {
    console.error(`[stripe-checkout] Cancel failed: ${err.message}`);
    return null;
  }
}
