// clerk-auth – zero-dependency Clerk Backend API wrapper
// SPDX-License-Identifier: MIT

const DEFAULT_TIMEOUT = 15000;
const API_BASE = 'https://api.clerk.com/v1';

/**
 * Resolve the Clerk secret key from opts or environment.
 * @param {object} opts - Options object.
 * @returns {string} The secret key.
 */
function getSecretKey(opts) {
  const key = opts.secretKey || process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error('CLERK_SECRET_KEY is required');
  return key;
}

/**
 * Build standard authorization headers for Clerk API.
 * @param {object} opts - Options with optional secretKey.
 * @returns {Record<string,string>} Headers object.
 */
function headers(opts) {
  return {
    Authorization: `Bearer ${getSecretKey(opts)}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Internal GET helper.
 * @param {string} path - API path.
 * @param {Record<string,string>} [params] - Query parameters.
 * @param {object} opts - Auth options.
 * @returns {Promise<object|null>} Parsed response or null.
 */
async function get(path, params, opts) {
  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  try {
    const res = await fetch(url.toString(), {
      headers: headers(opts),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`Clerk API error ${res.status}: ${text}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('Clerk request failed:', err.message);
    return null;
  }
}

/**
 * Internal POST helper.
 * @param {string} path - API path.
 * @param {object} body - JSON body.
 * @param {object} opts - Auth options.
 * @returns {Promise<object|null>} Parsed response or null.
 */
async function post(path, body, opts) {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: headers(opts),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`Clerk API error ${res.status}: ${text}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('Clerk request failed:', err.message);
    return null;
  }
}

/**
 * Fetch a single user by their Clerk user ID.
 * @param {string} userId - The Clerk user ID.
 * @param {object} [opts] - Optional overrides (secretKey).
 * @returns {Promise<object|null>} The user object or null.
 */
export async function getUser(userId, opts = {}) {
  if (!userId) throw new Error('userId is required');
  return get(`/users/${userId}`, null, opts);
}

/**
 * List users with optional filtering and pagination.
 * @param {object} [query] - Query parameters (limit, offset, email_address, phone_number, order_by, etc.).
 * @param {object} [opts] - Optional overrides (secretKey).
 * @returns {Promise<object|null>} Array of user objects or null.
 */
export async function listUsers(query = {}, opts = {}) {
  return get('/users', query, opts);
}

/**
 * Create a new user in Clerk.
 * @param {object} params - User creation parameters.
 * @param {string[]} [params.email_address] - Email addresses.
 * @param {string} [params.first_name] - First name.
 * @param {string} [params.last_name] - Last name.
 * @param {string} [params.password] - Password.
 * @param {Record<string,any>} [params.public_metadata] - Public metadata.
 * @param {object} [opts] - Optional overrides (secretKey).
 * @returns {Promise<object|null>} The created user or null.
 */
export async function createUser(params, opts = {}) {
  if (!params) throw new Error('params are required');
  return post('/users', params, opts);
}

/**
 * Verify that a session ID is valid and active.
 * @param {string} sessionId - The Clerk session ID.
 * @param {object} [opts] - Optional overrides (secretKey).
 * @returns {Promise<object|null>} The session object or null.
 */
export async function verifySession(sessionId, opts = {}) {
  if (!sessionId) throw new Error('sessionId is required');
  return get(`/sessions/${sessionId}`, null, opts);
}

/**
 * Verify a session token (JWT) using the Clerk Backend API.
 * @param {string} token - The session JWT to verify.
 * @param {object} [opts] - Optional overrides (secretKey).
 * @returns {Promise<object|null>} The verified token claims or null.
 */
export async function verifyToken(token, opts = {}) {
  if (!token) throw new Error('token is required');
  return post('/tokens/verify', { token }, opts);
}
