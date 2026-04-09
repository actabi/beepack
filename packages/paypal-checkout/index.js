// @ts-check

const SANDBOX_URL = 'https://api-m.sandbox.paypal.com';
const LIVE_URL = 'https://api-m.paypal.com';

/**
 * Returns the base URL based on PAYPAL_MODE environment variable.
 * @returns {string}
 */
function baseUrl() {
  const mode = (process.env.PAYPAL_MODE || 'sandbox').toLowerCase();
  return mode === 'live' ? LIVE_URL : SANDBOX_URL;
}

/**
 * Returns client credentials from environment variables.
 * @returns {{ clientId: string; clientSecret: string }}
 */
function credentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET environment variables are required');
  }
  return { clientId, clientSecret };
}

/**
 * Generate an OAuth2 access token using client credentials.
 * @returns {Promise<{ accessToken: string; expiresIn: number; tokenType: string } | null>}
 */
export async function generateAccessToken() {
  try {
    const { clientId, clientSecret } = credentials();
    const auth = btoa(`${clientId}:${clientSecret}`);

    const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`PayPal OAuth error ${res.status}: ${text}`);
      return null;
    }

    const data = await res.json();
    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
    };
  } catch (err) {
    console.error('PayPal generateAccessToken failed:', err.message);
    return null;
  }
}

/**
 * Makes an authenticated request to the PayPal API.
 * @param {string} method - HTTP method
 * @param {string} path - API path
 * @param {Record<string, unknown>} [body] - Optional request body
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function request(method, path, body) {
  try {
    const tokenResult = await generateAccessToken();
    if (!tokenResult) return null;

    const opts = {
      method,
      headers: {
        Authorization: `Bearer ${tokenResult.accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    };

    if (body && (method === 'POST' || method === 'PATCH')) {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(`${baseUrl()}${path}`, opts);
    if (!res.ok) {
      const text = await res.text();
      console.error(`PayPal API error ${res.status}: ${text}`);
      return null;
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return /** @type {Record<string, unknown>} */ (await res.json());
    }
    return null;
  } catch (err) {
    console.error('PayPal request failed:', err.message);
    return null;
  }
}

/**
 * Create a new PayPal checkout order.
 * @param {object} options
 * @param {string} options.currency - Currency code (e.g. 'USD')
 * @param {string} options.amount - Amount as a string (e.g. '10.00')
 * @param {string} [options.description] - Order description
 * @param {string} [options.intent='CAPTURE'] - Order intent (CAPTURE or AUTHORIZE)
 * @param {string} [options.returnUrl] - URL to redirect to after approval
 * @param {string} [options.cancelUrl] - URL to redirect to on cancellation
 * @returns {Promise<{ id: string; status: string; links: { href: string; rel: string; method: string }[] } | null>}
 */
export async function createOrder({
  currency,
  amount,
  description,
  intent = 'CAPTURE',
  returnUrl,
  cancelUrl,
}) {
  const purchaseUnit = {
    amount: {
      currency_code: currency,
      value: amount,
    },
  };
  if (description) purchaseUnit.description = description;

  const body = {
    intent,
    purchase_units: [purchaseUnit],
  };

  if (returnUrl && cancelUrl) {
    body.payment_source = {
      paypal: {
        experience_context: {
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      },
    };
  }

  const data = await request('POST', '/v2/checkout/orders', body);
  if (!data) return null;

  return {
    id: /** @type {string} */ (data.id),
    status: /** @type {string} */ (data.status),
    links: /** @type {{ href: string; rel: string; method: string }[]} */ (data.links ?? []),
  };
}

/**
 * Capture payment for an approved order.
 * @param {string} orderId - The PayPal order ID to capture
 * @returns {Promise<{ id: string; status: string; payer: Record<string, unknown> } | null>}
 */
export async function captureOrder(orderId) {
  if (!orderId) {
    console.error('captureOrder requires an orderId');
    return null;
  }

  const data = await request('POST', `/v2/checkout/orders/${orderId}/capture`, {});
  if (!data) return null;

  return {
    id: /** @type {string} */ (data.id),
    status: /** @type {string} */ (data.status),
    payer: /** @type {Record<string, unknown>} */ (data.payer ?? {}),
  };
}

/**
 * Retrieve details of an existing PayPal order.
 * @param {string} orderId - The PayPal order ID
 * @returns {Promise<{ id: string; status: string; purchaseUnits: Record<string, unknown>[]; createTime: string } | null>}
 */
export async function getOrder(orderId) {
  if (!orderId) {
    console.error('getOrder requires an orderId');
    return null;
  }

  const data = await request('GET', `/v2/checkout/orders/${orderId}`);
  if (!data) return null;

  return {
    id: /** @type {string} */ (data.id),
    status: /** @type {string} */ (data.status),
    purchaseUnits: /** @type {Record<string, unknown>[]} */ (data.purchase_units ?? []),
    createTime: /** @type {string} */ (data.create_time ?? ''),
  };
}
