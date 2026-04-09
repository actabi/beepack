// LemonSqueezy Payments - Checkout, webhooks, subscriptions, and customer portal
// Zero dependencies - uses native fetch and Web Crypto API.

const LS_API = "https://api.lemonsqueezy.com/v1";
const TIMEOUT_MS = 15000;
const LOG = "[lemonsqueezy-payments]";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Perform an authenticated request to the LemonSqueezy JSON:API.
 *
 * @param {string} apiKey
 * @param {string} path - e.g. "/checkouts"
 * @param {object} [options]
 * @param {string} [options.method="GET"]
 * @param {object} [options.body]
 * @returns {Promise<object|null>} Parsed JSON:API response or null on error
 */
async function lsRequest(apiKey, path, { method = "GET", body } = {}) {
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  };
  if (body) init.body = JSON.stringify(body);

  try {
    const res = await fetch(`${LS_API}${path}`, init);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.errors?.[0]?.detail || err.errors?.[0]?.title || res.statusText;
      console.error(`${LOG} API ${res.status} on ${method} ${path}: ${msg}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.error(`${LOG} Request failed (${method} ${path}): ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

/**
 * Generate a hosted checkout URL for a variant (product/plan).
 *
 * @param {object} config
 * @param {string} config.apiKey - LEMONSQUEEZY_API_KEY
 * @param {string} config.storeId - LEMONSQUEEZY_STORE_ID
 * @param {string} config.variantId - Variant ID for the product/plan to purchase
 * @param {object} [config.checkoutData] - Pre-fill customer data and custom fields
 * @param {string} [config.checkoutData.email] - Customer email
 * @param {string} [config.checkoutData.name] - Customer name
 * @param {string} [config.checkoutData.billingAddress.country] - ISO 3166-1 alpha-2
 * @param {Record<string,string>} [config.checkoutData.custom] - Custom metadata passed to webhooks
 * @param {object} [config.productOptions]
 * @param {string} [config.productOptions.redirectUrl] - URL after successful payment
 * @param {boolean} [config.productOptions.receiptButtonText] - Button text on receipt page
 * @param {number} [config.expiresAt] - Unix timestamp for checkout expiry (optional)
 * @returns {Promise<{id: string, url: string, expiresAt: string|null}|null>}
 */
export async function createCheckout(config) {
  const { apiKey, storeId, variantId, checkoutData = {}, productOptions = {}, expiresAt } = config;

  const attributes = {
    store_id: Number(storeId),
    variant_id: Number(variantId),
    checkout_data: {
      email: checkoutData.email,
      name: checkoutData.name,
      billing_address: checkoutData.billingAddress,
      custom: checkoutData.custom,
    },
    product_options: {
      redirect_url: productOptions.redirectUrl,
      receipt_button_text: productOptions.receiptButtonText,
    },
    expires_at: expiresAt ? new Date(expiresAt * 1000).toISOString() : undefined,
  };

  // Strip undefined values so the API ignores unprovided fields
  const clean = (obj) =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));

  attributes.checkout_data = clean(attributes.checkout_data);
  attributes.product_options = clean(attributes.product_options);
  const body = { data: { type: "checkouts", attributes: clean(attributes) } };

  const data = await lsRequest(apiKey, "/checkouts", { method: "POST", body });
  if (!data) return null;

  const attrs = data.data?.attributes;
  return {
    id: data.data.id,
    url: attrs.url,
    expiresAt: attrs.expires_at || null,
  };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

/**
 * Validate a LemonSqueezy webhook request using HMAC-SHA256.
 * Call this before processing any incoming webhook payload.
 *
 * @param {object} params
 * @param {string} params.secret - LEMONSQUEEZY_WEBHOOK_SECRET
 * @param {string} params.rawBody - Raw request body as a UTF-8 string
 * @param {string} params.signature - Value of the X-Signature header
 * @returns {Promise<boolean>}
 */
export async function validateWebhook({ secret, rawBody, signature }) {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Constant-time comparison to prevent timing attacks
    if (computed.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < computed.length; i++) {
      diff |= computed.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return diff === 0;
  } catch (err) {
    console.error(`${LOG} Webhook validation error: ${err.message}`);
    return false;
  }
}

/**
 * Parse and route a validated webhook payload to typed event handlers.
 * Unrecognised event names are passed to the optional `onUnknown` handler.
 *
 * @param {string|object} rawBodyOrParsed - Raw JSON string or already-parsed object
 * @param {object} handlers
 * @param {(data: object) => any} [handlers.onOrderCreated]
 * @param {(data: object) => any} [handlers.onSubscriptionCreated]
 * @param {(data: object) => any} [handlers.onSubscriptionUpdated]
 * @param {(data: object) => any} [handlers.onSubscriptionCancelled]
 * @param {(data: object) => any} [handlers.onSubscriptionResumed]
 * @param {(data: object) => any} [handlers.onSubscriptionExpired]
 * @param {(data: object) => any} [handlers.onSubscriptionPaused]
 * @param {(data: object) => any} [handlers.onSubscriptionUnpaused]
 * @param {(data: object) => any} [handlers.onSubscriptionPaymentSuccess]
 * @param {(data: object) => any} [handlers.onSubscriptionPaymentFailed]
 * @param {(data: object) => any} [handlers.onSubscriptionPaymentRecovered]
 * @param {(eventName: string, data: object) => any} [handlers.onUnknown]
 * @returns {Promise<any>} Return value of the matched handler, or null if no handler matched
 */
export async function routeWebhookEvent(rawBodyOrParsed, handlers) {
  let payload;
  try {
    payload =
      typeof rawBodyOrParsed === "string" ? JSON.parse(rawBodyOrParsed) : rawBodyOrParsed;
  } catch (err) {
    console.error(`${LOG} Failed to parse webhook payload: ${err.message}`);
    return null;
  }

  const eventName = payload?.meta?.event_name;
  const data = payload?.data;

  const routeMap = {
    order_created: handlers.onOrderCreated,
    subscription_created: handlers.onSubscriptionCreated,
    subscription_updated: handlers.onSubscriptionUpdated,
    subscription_cancelled: handlers.onSubscriptionCancelled,
    subscription_resumed: handlers.onSubscriptionResumed,
    subscription_expired: handlers.onSubscriptionExpired,
    subscription_paused: handlers.onSubscriptionPaused,
    subscription_unpaused: handlers.onSubscriptionUnpaused,
    subscription_payment_success: handlers.onSubscriptionPaymentSuccess,
    subscription_payment_failed: handlers.onSubscriptionPaymentFailed,
    subscription_payment_recovered: handlers.onSubscriptionPaymentRecovered,
  };

  const handler = routeMap[eventName];
  if (handler) return handler(data);

  if (handlers.onUnknown) return handlers.onUnknown(eventName, data);

  console.error(`${LOG} No handler registered for event: ${eventName}`);
  return null;
}

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

/**
 * Fetch the current state of a subscription from LemonSqueezy.
 *
 * @param {string} apiKey - LEMONSQUEEZY_API_KEY
 * @param {string} subscriptionId
 * @returns {Promise<{id: string, status: string, productId: string, variantId: string, cardBrand: string|null, cardLastFour: string|null, pause: object|null, cancelled: boolean, trialEndsAt: string|null, billingAnchor: number, renewsAt: string|null, endsAt: string|null, createdAt: string, updatedAt: string}|null>}
 */
export async function getSubscription(apiKey, subscriptionId) {
  const data = await lsRequest(apiKey, `/subscriptions/${subscriptionId}`);
  if (!data) return null;

  const a = data.data?.attributes;
  return {
    id: data.data.id,
    status: a.status,
    productId: String(a.product_id),
    variantId: String(a.variant_id),
    cardBrand: a.card_brand || null,
    cardLastFour: a.card_last_four || null,
    pause: a.pause || null,
    cancelled: a.cancelled,
    trialEndsAt: a.trial_ends_at || null,
    billingAnchor: a.billing_anchor,
    renewsAt: a.renews_at || null,
    endsAt: a.ends_at || null,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

/**
 * Cancel a subscription at period end (sets cancelled = true, subscription stays active until endsAt).
 *
 * @param {string} apiKey
 * @param {string} subscriptionId
 * @returns {Promise<{id: string, status: string, endsAt: string|null}|null>}
 */
export async function cancelSubscription(apiKey, subscriptionId) {
  const data = await lsRequest(apiKey, `/subscriptions/${subscriptionId}`, {
    method: "DELETE",
  });
  if (!data) return null;

  const a = data.data?.attributes;
  return { id: data.data.id, status: a.status, endsAt: a.ends_at || null };
}

/**
 * Change a subscription to a different variant (plan), with immediate proration.
 * Set `disableProrations: true` to apply the change at the next renewal instead.
 *
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string} params.subscriptionId
 * @param {string} params.variantId - Target variant/plan ID
 * @param {number} [params.billingAnchor] - Override billing anchor day (1–31)
 * @param {boolean} [params.disableProrations=false] - Skip immediate proration charge
 * @returns {Promise<{id: string, status: string, variantId: string, renewsAt: string|null}|null>}
 */
export async function changePlan({ apiKey, subscriptionId, variantId, billingAnchor, disableProrations = false }) {
  const attributes = { variant_id: Number(variantId) };
  if (billingAnchor !== undefined) attributes.billing_anchor = billingAnchor;
  if (disableProrations) attributes.disable_prorations = true;

  const data = await lsRequest(apiKey, `/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    body: { data: { type: "subscriptions", id: String(subscriptionId), attributes } },
  });
  if (!data) return null;

  const a = data.data?.attributes;
  return {
    id: data.data.id,
    status: a.status,
    variantId: String(a.variant_id),
    renewsAt: a.renews_at || null,
  };
}

/**
 * Pause or resume a subscription.
 * Pass `mode: "void"` to pause (no charges, access revoked) or `mode: "free"` (no charges, access kept).
 * Pass `pause: null` to resume a paused subscription.
 *
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string} params.subscriptionId
 * @param {{mode: "void"|"free", resumesAt?: string}|null} params.pause - Pause config or null to resume
 * @returns {Promise<{id: string, status: string, pause: object|null}|null>}
 */
export async function pauseOrResumeSubscription({ apiKey, subscriptionId, pause }) {
  const data = await lsRequest(apiKey, `/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    body: {
      data: {
        type: "subscriptions",
        id: String(subscriptionId),
        attributes: { pause },
      },
    },
  });
  if (!data) return null;

  const a = data.data?.attributes;
  return { id: data.data.id, status: a.status, pause: a.pause || null };
}

// ---------------------------------------------------------------------------
// Customer portal
// ---------------------------------------------------------------------------

/**
 * Retrieve the customer portal (billing management) URL for a subscription.
 * Redirect the user to this URL so they can update payment method, cancel, etc.
 *
 * @param {string} apiKey
 * @param {string} subscriptionId
 * @returns {Promise<{url: string}|null>}
 */
export async function getCustomerPortalUrl(apiKey, subscriptionId) {
  const data = await lsRequest(apiKey, `/subscriptions/${subscriptionId}`);
  if (!data) return null;

  const url = data.data?.attributes?.urls?.customer_portal;
  if (!url) {
    console.error(`${LOG} No customer portal URL found for subscription ${subscriptionId}`);
    return null;
  }
  return { url };
}
