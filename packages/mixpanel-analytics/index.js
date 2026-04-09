// mixpanel-analytics – zero-dependency Mixpanel tracking API wrapper
// SPDX-License-Identifier: MIT

const DEFAULT_TIMEOUT = 15000;

/**
 * Resolve the Mixpanel project token from opts or environment.
 * @param {object} opts - Options object.
 * @returns {string} The project token.
 */
function getToken(opts) {
  const token = opts.token || process.env.MIXPANEL_TOKEN;
  if (!token) throw new Error('MIXPANEL_TOKEN is required');
  return token;
}

/**
 * Base64-encode a string (works in Node 18+ and modern runtimes).
 * @param {string} str - String to encode.
 * @returns {string} Base64-encoded string.
 */
function b64(str) {
  return btoa(str);
}

/**
 * Send data to a Mixpanel endpoint using the base64-encoded data param.
 * @param {string} endpoint - Mixpanel API endpoint URL.
 * @param {object} payload - JSON payload to encode.
 * @returns {Promise<object|null>} Parsed response or null.
 */
async function send(endpoint, payload) {
  try {
    const encoded = b64(JSON.stringify(payload));
    const body = new URLSearchParams({ data: encoded });
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`Mixpanel API error ${res.status}: ${text}`);
      return null;
    }
    const text = await res.text();
    // Mixpanel returns "1" for success, "0" for failure
    if (text === '1') return { success: true };
    if (text === '0') return { success: false };
    try { return JSON.parse(text); } catch { return { response: text }; }
  } catch (err) {
    console.error('Mixpanel request failed:', err.message);
    return null;
  }
}

/**
 * Track a single event.
 * @param {string} event - Event name.
 * @param {Record<string,any>} [properties] - Event properties.
 * @param {object} [opts] - Optional overrides (token).
 * @returns {Promise<object|null>} Tracking result or null.
 */
export async function track(event, properties = {}, opts = {}) {
  if (!event) throw new Error('event name is required');
  const token = getToken(opts);
  const payload = {
    event,
    properties: {
      ...properties,
      token,
    },
  };
  return send('https://api.mixpanel.com/track', payload);
}

/**
 * Identify a user by setting their distinct_id for future events.
 * Uses the engage endpoint to create/update a profile.
 * @param {string} distinctId - Unique user identifier.
 * @param {Record<string,any>} [properties] - User profile properties to set.
 * @param {object} [opts] - Optional overrides (token).
 * @returns {Promise<object|null>} Result or null.
 */
export async function identify(distinctId, properties = {}, opts = {}) {
  if (!distinctId) throw new Error('distinctId is required');
  const token = getToken(opts);
  const payload = {
    $token: token,
    $distinct_id: distinctId,
    $set: properties,
  };
  return send('https://api.mixpanel.com/engage', payload);
}

/**
 * Set user profile properties (without needing to identify first).
 * @param {string} distinctId - Unique user identifier.
 * @param {Record<string,any>} properties - Properties to set on the profile.
 * @param {object} [opts] - Optional overrides (token).
 * @returns {Promise<object|null>} Result or null.
 */
export async function setUserProperties(distinctId, properties, opts = {}) {
  if (!distinctId || !properties) throw new Error('distinctId and properties are required');
  const token = getToken(opts);
  const payload = {
    $token: token,
    $distinct_id: distinctId,
    $set: properties,
  };
  return send('https://api.mixpanel.com/engage', payload);
}

/**
 * Track multiple events in a single batch request.
 * @param {Array<{event: string, properties?: Record<string,any>}>} events - Array of event objects.
 * @param {object} [opts] - Optional overrides (token).
 * @returns {Promise<object|null>} Batch result or null.
 */
export async function trackBatch(events, opts = {}) {
  if (!Array.isArray(events) || events.length === 0) {
    throw new Error('events must be a non-empty array');
  }
  const token = getToken(opts);
  const payload = events.map((e) => ({
    event: e.event,
    properties: {
      ...(e.properties || {}),
      token,
    },
  }));
  return send('https://api.mixpanel.com/track#live-event-batch', payload);
}

/**
 * Create an alias to merge two distinct IDs.
 * @param {string} distinctId - The current canonical distinct ID.
 * @param {string} alias - The alias to map to the distinct ID.
 * @param {object} [opts] - Optional overrides (token).
 * @returns {Promise<object|null>} Result or null.
 */
export async function createAlias(distinctId, alias, opts = {}) {
  if (!distinctId || !alias) throw new Error('distinctId and alias are required');
  const token = getToken(opts);
  const payload = {
    event: '$create_alias',
    properties: {
      distinct_id: distinctId,
      alias,
      token,
    },
  };
  return send('https://api.mixpanel.com/track', payload);
}
