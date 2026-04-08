// Expo Push Notifications Client
// Zero dependencies - uses native fetch with the Expo Push Notification REST API.
// Covers token registration/storage helpers, single and batch sending (auto-chunked),
// receipt retrieval (auto-chunked), iOS/Android payload differences, deep link handling,
// and error classification for DeviceNotRegistered and rate limiting.
//
// Required env: none (Expo push is a public API).
// Optional env: EXPO_ACCESS_TOKEN — increases rate limits when set.

const TIMEOUT_MS = 15000;
const BASE_URL = 'https://exp.host';

// Expo enforces a maximum of 100 notifications per /push/send call
const SEND_CHUNK_SIZE = 100;
// Expo enforces a maximum of 1000 IDs per /push/getReceipts call
const RECEIPT_CHUNK_SIZE = 1000;

// --- Helpers ---

/**
 * Standard headers required by the Expo push API.
 * Attaches an Authorization header when EXPO_ACCESS_TOKEN is available in the environment,
 * which raises Expo's per-project rate limits significantly.
 *
 * @param {string|null} [accessToken] - Optional override; falls back to EXPO_ACCESS_TOKEN env var
 * @returns {object}
 */
function buildHeaders(accessToken = null) {
  const token = accessToken ?? (typeof process !== 'undefined' ? process.env?.EXPO_ACCESS_TOKEN : null) ?? null;
  const headers = {
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Split an array into chunks of a given size.
 * @template T
 * @param {Array<T>} arr
 * @param {number} size
 * @returns {Array<Array<T>>}
 */
function chunk(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * Execute a fetch with timeout and unified error handling.
 * Returns null on any error rather than throwing.
 * @param {string} tag - Log prefix
 * @param {string} url - Full URL
 * @param {RequestInit} options - Fetch options (headers must already be set)
 * @returns {Promise<object|null>}
 */
async function apiFetch(tag, url, options = {}) {
  try {
    const res = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(
        `[expo-push] ${tag} error ${res.status}: ${err?.errors?.[0]?.message || JSON.stringify(err)}`
      );
      return null;
    }

    return res.json();
  } catch (err) {
    console.error(`[expo-push] ${tag} failed: ${err.message}`);
    return null;
  }
}

// --- Token Validation ---

/**
 * Check whether a string is a valid Expo push token format.
 * Valid formats: "ExponentPushToken[xxxxxx]" or "ExpoPushToken[xxxxxx]".
 * Does not make a network call; validation is purely regex-based.
 *
 * @param {string} token - Token string to validate
 * @returns {boolean} true if the token matches a valid Expo push token pattern
 */
export function isExpoPushToken(token) {
  if (typeof token !== 'string') return false;
  return /^Expo(?:nent)?PushToken\[.+\]$/.test(token);
}

// --- Sending Notifications ---

/**
 * Send a single push notification to one Expo push token.
 * The token must be a valid Expo push token (see isExpoPushToken).
 *
 * @param {string} expoPushToken - Recipient's Expo push token
 * @param {string} message - Notification body text
 * @param {object} [options={}] - Additional notification options
 * @param {string} [options.title] - Notification title (shown in banner)
 * @param {string} [options.subtitle] - Notification subtitle (iOS only)
 * @param {'default'|'normal'|'high'} [options.priority='default'] - Delivery priority
 * @param {'default'|null} [options.sound='default'] - Sound: 'default' or null for silent
 * @param {number} [options.badge] - App badge count to set on iOS
 * @param {object} [options.data] - Arbitrary JSON data to include in the notification payload
 * @param {number} [options.ttl] - Time-to-live in seconds (default 2419200 = 28 days)
 * @param {string} [options.channelId] - Android notification channel ID (required on Android 8+)
 * @param {string} [options.accessToken] - Expo access token (overrides EXPO_ACCESS_TOKEN env var)
 * @returns {Promise<{data: Array<{status: string, id?: string, details?: object}>}|null>}
 *   Expo ticket response object, or null on network/API error
 */
export async function sendNotification(expoPushToken, message, options = {}) {
  if (!isExpoPushToken(expoPushToken)) {
    console.error(`[expo-push] sendNotification: invalid Expo push token: ${expoPushToken}`);
    return null;
  }
  if (typeof message !== 'string') {
    console.error('[expo-push] sendNotification: message must be a string');
    return null;
  }

  const { title, subtitle, priority = 'default', sound = 'default', badge, data, ttl, channelId, accessToken } = options;

  const notification = { to: expoPushToken, body: message, priority };
  if (title) notification.title = title;
  if (subtitle) notification.subtitle = subtitle;
  if (sound !== undefined) notification.sound = sound;
  if (badge !== undefined) notification.badge = badge;
  if (data) notification.data = data;
  if (ttl !== undefined) notification.ttl = ttl;
  if (channelId) notification.channelId = channelId;

  return apiFetch('sendNotification', `${BASE_URL}/--/api/v2/push/send`, {
    method: 'POST',
    headers: buildHeaders(accessToken),
    body: JSON.stringify([notification]),
  });
}

/**
 * Send a batch of push notifications in one or more API calls.
 * Automatically chunks the notifications array into groups of 100 (Expo's limit)
 * and sends each chunk sequentially. Returns a flat array of all ticket objects.
 *
 * Each notification in the array should have:
 * - to {string} - Expo push token
 * - body {string} - Notification body text
 * - title? {string} - Title
 * - data? {object} - Custom payload
 * - sound? {string} - 'default' or null
 * - badge? {number} - iOS badge count
 * - ttl? {number} - Time-to-live in seconds
 * - priority? {string} - 'default' | 'normal' | 'high'
 * - channelId? {string} - Android channel ID
 *
 * @param {Array<object>} notifications - Array of notification descriptor objects
 * @param {object} [opts={}]
 * @param {string} [opts.accessToken] - Expo access token (overrides EXPO_ACCESS_TOKEN env var)
 * @returns {Promise<Array<{status: string, id?: string, details?: object}>|null>}
 *   Flat array of Expo ticket objects (one per notification), or null on error
 */
export async function sendBatch(notifications, opts = {}) {
  if (!Array.isArray(notifications) || notifications.length === 0) {
    console.error('[expo-push] sendBatch: notifications must be a non-empty array');
    return null;
  }

  const { accessToken } = opts;
  const tickets = [];
  const chunks = chunk(notifications, SEND_CHUNK_SIZE);

  for (const batch of chunks) {
    const result = await apiFetch('sendBatch', `${BASE_URL}/--/api/v2/push/send`, {
      method: 'POST',
      headers: buildHeaders(accessToken),
      body: JSON.stringify(batch),
    });

    if (!result) return null;

    const batchTickets = result.data ?? [];
    tickets.push(...batchTickets);
  }

  return tickets;
}

// --- Receipt Retrieval ---

/**
 * Retrieve delivery receipts for a set of push ticket IDs.
 * Receipts are typically available 15-30 minutes after sending.
 * Automatically chunks the IDs into groups of 1000 (Expo's limit) and merges results.
 *
 * Each receipt has a status of 'ok' or 'error'. Error receipts include a details
 * object with an error field: 'DeviceNotRegistered' | 'MessageTooBig' |
 * 'MessageRateExceeded' | 'InvalidCredentials'.
 *
 * @param {Array<string>} ticketIds - Array of ticket IDs returned from send calls
 * @param {object} [opts={}]
 * @param {string} [opts.accessToken] - Expo access token (overrides EXPO_ACCESS_TOKEN env var)
 * @returns {Promise<{data: object}|null>}
 *   Object where data maps receiptId -> {status, message?, details?}, or null on error
 */
export async function getReceipts(ticketIds, opts = {}) {
  if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
    console.error('[expo-push] getReceipts: ticketIds must be a non-empty array');
    return null;
  }

  const { accessToken } = opts;
  const allData = {};
  const chunks = chunk(ticketIds, RECEIPT_CHUNK_SIZE);

  for (const batch of chunks) {
    const result = await apiFetch('getReceipts', `${BASE_URL}/--/api/v2/push/getReceipts`, {
      method: 'POST',
      headers: buildHeaders(accessToken),
      body: JSON.stringify({ ids: batch }),
    });

    if (!result) return null;

    // Merge receipt maps
    Object.assign(allData, result.data ?? {});
  }

  return { data: allData };
}

/**
 * Parse a getReceipts result and return entries that indicate errors.
 * Useful for identifying tokens to unregister (DeviceNotRegistered) or
 * senders that need to back off (MessageRateExceeded).
 *
 * Error types and recommended actions:
 * - DeviceNotRegistered: Remove the push token from your database immediately.
 * - MessageRateExceeded: Implement exponential backoff before retrying.
 * - MessageTooBig: Reduce the notification body/data payload size.
 * - InvalidCredentials: Update your Expo push credentials.
 *
 * @param {{data: object}} receipts - Result object from getReceipts()
 * @returns {Array<{receiptId: string, error: string, message?: string, details?: object}>}
 *   Array of error entries; empty array if all receipts are 'ok'
 */
export function checkReceiptsForErrors(receipts) {
  if (!receipts || typeof receipts.data !== 'object') {
    console.error('[expo-push] checkReceiptsForErrors: receipts must be the result of getReceipts()');
    return [];
  }

  const errors = [];

  for (const [receiptId, receipt] of Object.entries(receipts.data)) {
    if (receipt.status !== 'ok') {
      errors.push({
        receiptId,
        error: receipt.details?.error ?? receipt.status ?? 'UnknownError',
        message: receipt.message,
        details: receipt.details ?? null,
      });
    }
  }

  return errors;
}

/**
 * Filter an array of push tickets to find those that had send errors.
 * Tickets with status 'error' should not be checked for receipts since
 * they were never delivered to Expo's service.
 *
 * @param {Array<{status: string, id?: string, details?: object, message?: string}>} tickets
 *   Array of ticket objects returned from sendBatch or sendNotification
 * @returns {Array<{index: number, status: string, message?: string, details?: object}>}
 *   Array of error entries with their index in the original tickets array
 */
export function findTicketErrors(tickets) {
  if (!Array.isArray(tickets)) {
    console.error('[expo-push] findTicketErrors: tickets must be an array');
    return [];
  }

  return tickets
    .map((ticket, index) => ({ index, ...ticket }))
    .filter((t) => t.status === 'error');
}

// --- Push Token Registry ---

/**
 * Create an in-memory push token registry keyed by user ID.
 * Replace the internal Map with DB calls (e.g. Postgres, Redis) in production.
 *
 * The registry enforces token-format validation on write and exposes helpers
 * to retrieve tokens by user or fan-out across all registered devices.
 *
 * @returns {{
 *   register: (userId: string, token: string) => boolean,
 *   unregister: (userId: string, token: string) => void,
 *   getTokens: (userId: string) => string[],
 *   getAllEntries: () => Array<{userId: string, token: string}>
 * }}
 */
export function createTokenRegistry() {
  /** @type {Map<string, Set<string>>} */
  const store = new Map();

  return {
    /**
     * Persist an Expo push token for a user.
     * Silently deduplicates — registering the same token twice is safe.
     *
     * @param {string} userId
     * @param {string} token
     * @returns {boolean} false if the token fails format validation
     */
    register(userId, token) {
      if (!isExpoPushToken(token)) {
        console.error(`[expo-push] register: invalid push token for user "${userId}": ${token}`);
        return false;
      }
      if (!store.has(userId)) store.set(userId, new Set());
      store.get(userId).add(token);
      return true;
    },

    /**
     * Remove a specific push token for a user.
     * Call this whenever a receipt comes back with DeviceNotRegistered.
     *
     * @param {string} userId
     * @param {string} token
     */
    unregister(userId, token) {
      store.get(userId)?.delete(token);
    },

    /**
     * Return all push tokens registered for a user.
     *
     * @param {string} userId
     * @returns {string[]}
     */
    getTokens(userId) {
      return [...(store.get(userId) ?? [])];
    },

    /**
     * Return every {userId, token} pair — useful for broadcast sends.
     *
     * @returns {Array<{userId: string, token: string}>}
     */
    getAllEntries() {
      /** @type {Array<{userId: string, token: string}>} */
      const entries = [];
      for (const [userId, tokens] of store) {
        for (const token of tokens) {
          entries.push({ userId, token });
        }
      }
      return entries;
    },
  };
}

// --- Platform-aware Payload Builder ---

/**
 * Build a platform-tuned Expo push message object.
 *
 * iOS-specific defaults applied automatically:
 *   - sound: 'default' (triggers system sound + vibration)
 *   - badge: included when provided (APNs badge field)
 *   - subtitle: iOS banner subtitle
 *
 * Android-specific defaults applied automatically:
 *   - channelId: 'default' (Android 8+ requires a channel; create it in app code)
 *   - color: accent colour for the notification icon
 *   - priority: 'high' triggers FCM high-priority delivery (wakes doze mode)
 *
 * Deep links: when `deepLink` is provided it is merged into the data payload as
 * `data.url`. Your app's notification handler should read `notification.request
 * .content.data.url` and call your router's navigate / linking helper.
 *
 * @param {object} params
 * @param {string} params.to - Expo push token (ExponentPushToken[...])
 * @param {string} params.title - Notification title
 * @param {string} params.body - Notification body text
 * @param {object} [params.data={}] - Custom payload (delivered to the app as-is)
 * @param {string} [params.deepLink] - Deep link URI merged into data.url
 *   e.g. "myapp://order/123" or "https://myapp.com/profile"
 * @param {'default'|null} [params.sound='default'] - 'default' = system sound, null = silent
 * @param {number} [params.badge] - iOS app badge count; omit to leave unchanged
 * @param {string} [params.subtitle] - iOS banner subtitle (ignored on Android)
 * @param {string} [params.channelId='default'] - Android 8+ notification channel ID
 * @param {string} [params.color] - Android icon accent color ('#rrggbb')
 * @param {'default'|'normal'|'high'} [params.priority='high'] - FCM/APNs delivery priority
 * @param {number} [params.ttl] - Seconds before Expo drops an undelivered message (default: 28 days)
 * @param {number} [params.expiration] - Unix timestamp after which the message is discarded
 * @param {string} [params.categoryId] - iOS actionable notification category identifier
 * @returns {object} Push message object ready to pass to sendNotification / sendBatch
 */
export function buildMessage({
  to,
  title,
  body,
  data = {},
  deepLink,
  sound = 'default',
  badge,
  subtitle,
  channelId = 'default',
  color,
  priority = 'high',
  ttl,
  expiration,
  categoryId,
}) {
  // Merge deep link into data so the app can navigate when the notification is tapped.
  const mergedData = deepLink ? { ...data, url: deepLink } : { ...data };

  const message = { to, title, body, priority };

  if (Object.keys(mergedData).length > 0) message.data = mergedData;
  if (sound !== undefined) message.sound = sound;
  if (badge !== undefined) message.badge = badge;
  if (subtitle) message.subtitle = subtitle;          // iOS only — Expo ignores on Android
  if (channelId) message.channelId = channelId;       // Android 8+; harmless on iOS
  if (color) message.color = color;                   // Android icon accent color
  if (ttl !== undefined) message.ttl = ttl;
  if (expiration !== undefined) message.expiration = expiration;
  if (categoryId) message.categoryId = categoryId;   // iOS actionable notifications

  return message;
}

// --- Deep Link Helpers ---

/**
 * Parse a deep link URI into its components.
 * Supports both custom-scheme links ("myapp://order/123") and
 * universal/app links ("https://myapp.com/order/123").
 *
 * Use this in your Expo notification response handler to extract the
 * destination before calling your router's navigate function.
 *
 * @param {string} url - Deep link URI from notification data payload (data.url)
 * @returns {{
 *   scheme: string,
 *   host: string,
 *   pathname: string,
 *   params: Record<string, string>
 * }|null} Parsed components, or null if the URI is invalid
 *
 * @example
 * // In your Expo notification handler:
 * Notifications.addNotificationResponseReceivedListener((response) => {
 *   const url = response.notification.request.content.data?.url;
 *   if (url) {
 *     const link = parseDeepLink(url);
 *     if (link?.scheme === 'myapp' && link.host === 'order') {
 *       router.push(`/orders${link.pathname}`);
 *     }
 *   }
 * });
 */
export function parseDeepLink(url) {
  if (typeof url !== 'string' || !url) return null;

  try {
    const parsed = new URL(url);
    return {
      scheme: parsed.protocol.replace(/:$/, ''),
      host: parsed.hostname,
      pathname: parsed.pathname,
      params: Object.fromEntries(parsed.searchParams.entries()),
    };
  } catch (err) {
    console.error(`[expo-push] parseDeepLink: invalid URL "${url}": ${err.message}`);
    return null;
  }
}
