// Cloudflare KV Store Client
// Zero dependencies - uses native fetch with the Cloudflare REST API v4.
// Covers get/put/delete/list for individual keys plus bulk write and delete,
// automatic pagination, and per-key metadata support.

const TIMEOUT_MS = 15000;
const BASE_URL = 'https://api.cloudflare.com/client/v4';

// --- Helpers ---

/**
 * Build standard Cloudflare API request headers.
 * @param {string} token - Cloudflare API token
 * @returns {object} Headers object
 */
function buildHeaders(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Build the base path for a KV namespace.
 * @param {string} accountId - Cloudflare account ID
 * @param {string} namespaceId - KV namespace ID
 * @returns {string}
 */
function nsPath(accountId, namespaceId) {
  return `${BASE_URL}/accounts/${accountId}/storage/kv/namespaces/${namespaceId}`;
}

/**
 * Execute a fetch with timeout and Cloudflare-specific error handling.
 * Cloudflare wraps responses in {success, errors, result} envelopes.
 * Returns null on any error rather than throwing.
 * @param {string} tag - Log prefix
 * @param {string} url - Full URL
 * @param {RequestInit} options - Fetch options
 * @param {boolean} [raw=false] - If true, return the raw Response (for streaming text bodies)
 * @returns {Promise<object|string|null>}
 */
async function apiFetch(tag, url, options = {}, raw = false) {
  try {
    const res = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (raw) {
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`[cloudflare-kv] ${tag} error ${res.status}: ${body}`);
        return null;
      }
      return res;
    }

    // Check HTTP status first; some CF endpoints return non-JSON on 404
    if (res.status === 404) {
      return null; // key not found - not an error worth logging
    }

    const json = await res.json().catch(() => null);

    if (!json) {
      console.error(`[cloudflare-kv] ${tag} error ${res.status}: non-JSON response`);
      return null;
    }

    if (!json.success) {
      const msgs = (json.errors || []).map((e) => `${e.code}: ${e.message}`).join(', ');
      console.error(`[cloudflare-kv] ${tag} failed: ${msgs || JSON.stringify(json)}`);
      return null;
    }

    return json.result;
  } catch (err) {
    console.error(`[cloudflare-kv] ${tag} failed: ${err.message}`);
    return null;
  }
}

// --- Single-Key Operations ---

/**
 * Get the string value of a KV key.
 * Returns null if the key does not exist or on any error.
 *
 * @param {string} accountId - Cloudflare account ID
 * @param {string} token - Cloudflare API token with KV write permissions
 * @param {string} namespaceId - KV namespace ID
 * @param {string} key - Key to retrieve
 * @returns {Promise<string|null>} Raw string value, or null if not found / on error
 */
export async function getValue(accountId, token, namespaceId, key) {
  if (!accountId || !token || !namespaceId || !key) {
    console.error('[cloudflare-kv] getValue: accountId, token, namespaceId, and key are required');
    return null;
  }

  try {
    const res = await fetch(
      `${nsPath(accountId, namespaceId)}/values/${encodeURIComponent(key)}`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );

    if (res.status === 404) return null;

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[cloudflare-kv] getValue error ${res.status}: ${body}`);
      return null;
    }

    return res.text();
  } catch (err) {
    console.error(`[cloudflare-kv] getValue failed: ${err.message}`);
    return null;
  }
}

/**
 * Get the value and metadata for a KV key.
 * Metadata is stored in the cf-kv-metadata response header as a JSON string.
 * Returns null if the key does not exist.
 *
 * @param {string} accountId - Cloudflare account ID
 * @param {string} token - Cloudflare API token
 * @param {string} namespaceId - KV namespace ID
 * @param {string} key - Key to retrieve
 * @returns {Promise<{value: string, metadata: object|null}|null>}
 *   Object with the raw string value and parsed metadata, or null if not found / on error
 */
export async function getValueWithMetadata(accountId, token, namespaceId, key) {
  if (!accountId || !token || !namespaceId || !key) {
    console.error('[cloudflare-kv] getValueWithMetadata: all parameters are required');
    return null;
  }

  try {
    const res = await fetch(
      `${nsPath(accountId, namespaceId)}/values/${encodeURIComponent(key)}`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );

    if (res.status === 404) return null;

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[cloudflare-kv] getValueWithMetadata error ${res.status}: ${body}`);
      return null;
    }

    const value = await res.text();
    const metaHeader = res.headers.get('cf-kv-metadata');
    let metadata = null;
    if (metaHeader) {
      try {
        metadata = JSON.parse(metaHeader);
      } catch {
        metadata = null;
      }
    }

    return { value, metadata };
  } catch (err) {
    console.error(`[cloudflare-kv] getValueWithMetadata failed: ${err.message}`);
    return null;
  }
}

/**
 * Write a value to a KV key, with optional TTL, expiration, and metadata.
 *
 * @param {string} accountId - Cloudflare account ID
 * @param {string} token - Cloudflare API token
 * @param {string} namespaceId - KV namespace ID
 * @param {string} key - Key to write
 * @param {string} value - Value to store (must be a string; JSON-stringify objects first)
 * @param {object} [options={}] - Write options
 * @param {number} [options.ttl] - Time-to-live in seconds (minimum 60; mutually exclusive with expiration)
 * @param {number} [options.expiration] - Unix timestamp when the key expires (mutually exclusive with ttl)
 * @param {object} [options.metadata] - JSON-serializable object to store as key metadata
 * @returns {Promise<boolean>} true on success, false on error
 */
export async function putValue(accountId, token, namespaceId, key, value, options = {}) {
  if (!accountId || !token || !namespaceId || !key || value === undefined) {
    console.error('[cloudflare-kv] putValue: accountId, token, namespaceId, key, and value are required');
    return false;
  }

  const { ttl, expiration, metadata } = options;

  const params = new URLSearchParams();
  if (ttl !== undefined) {
    if (ttl < 60) {
      console.error('[cloudflare-kv] putValue: ttl must be >= 60 seconds');
      return false;
    }
    params.set('expiration_ttl', String(ttl));
  } else if (expiration !== undefined) {
    params.set('expiration', String(expiration));
  }

  const queryString = params.toString() ? `?${params}` : '';

  // CF KV PUT uses multipart when metadata is provided; plain text otherwise
  let body;
  let contentType;

  if (metadata) {
    const boundary = `----CfKvBoundary${Date.now()}`;
    const metaJson = JSON.stringify(metadata);
    body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="metadata"',
      'Content-Type: application/json',
      '',
      metaJson,
      `--${boundary}`,
      'Content-Disposition: form-data; name="value"',
      '',
      value,
      `--${boundary}--`,
    ].join('\r\n');
    contentType = `multipart/form-data; boundary=${boundary}`;
  } else {
    body = value;
    contentType = 'text/plain';
  }

  try {
    const res = await fetch(
      `${nsPath(accountId, namespaceId)}/values/${encodeURIComponent(key)}${queryString}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': contentType,
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const msgs = (json.errors || []).map((e) => `${e.code}: ${e.message}`).join(', ');
      console.error(`[cloudflare-kv] putValue error ${res.status}: ${msgs || JSON.stringify(json)}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[cloudflare-kv] putValue failed: ${err.message}`);
    return false;
  }
}

/**
 * Delete a KV key. Returns true on success or if the key did not exist.
 *
 * @param {string} accountId - Cloudflare account ID
 * @param {string} token - Cloudflare API token
 * @param {string} namespaceId - KV namespace ID
 * @param {string} key - Key to delete
 * @returns {Promise<boolean>} true on success, false on error
 */
export async function deleteValue(accountId, token, namespaceId, key) {
  if (!accountId || !token || !namespaceId || !key) {
    console.error('[cloudflare-kv] deleteValue: all parameters are required');
    return false;
  }

  try {
    const res = await fetch(
      `${nsPath(accountId, namespaceId)}/values/${encodeURIComponent(key)}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );

    if (!res.ok && res.status !== 404) {
      const json = await res.json().catch(() => ({}));
      const msgs = (json.errors || []).map((e) => `${e.code}: ${e.message}`).join(', ');
      console.error(`[cloudflare-kv] deleteValue error ${res.status}: ${msgs}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[cloudflare-kv] deleteValue failed: ${err.message}`);
    return false;
  }
}

// --- Key Listing ---

/**
 * List keys in a KV namespace, with optional cursor pagination, limit, and prefix filter.
 * Cloudflare returns at most 1000 keys per page.
 *
 * @param {string} accountId - Cloudflare account ID
 * @param {string} token - Cloudflare API token
 * @param {string} namespaceId - KV namespace ID
 * @param {object} [options={}] - List options
 * @param {string} [options.cursor] - Pagination cursor from a previous listKeys call
 * @param {number} [options.limit=1000] - Maximum keys to return (1-1000)
 * @param {string} [options.prefix] - Only return keys with this prefix
 * @returns {Promise<{keys: Array<{name: string, expiration?: number, metadata?: object}>, list_complete: boolean, cursor?: string}|null>}
 */
export async function listKeys(accountId, token, namespaceId, options = {}) {
  if (!accountId || !token || !namespaceId) {
    console.error('[cloudflare-kv] listKeys: accountId, token, and namespaceId are required');
    return null;
  }

  const { cursor, limit = 1000, prefix } = options;
  const params = new URLSearchParams({ limit: String(Math.min(limit, 1000)) });
  if (cursor) params.set('cursor', cursor);
  if (prefix) params.set('prefix', prefix);

  try {
    const res = await fetch(
      `${nsPath(accountId, namespaceId)}/keys?${params}`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );

    const json = await res.json().catch(() => null);
    if (!json || !json.success) {
      const msgs = (json?.errors || []).map((e) => `${e.code}: ${e.message}`).join(', ');
      console.error(`[cloudflare-kv] listKeys error ${res.status}: ${msgs || 'unknown'}`);
      return null;
    }

    return {
      keys: json.result ?? [],
      list_complete: json.result_info?.list_complete ?? true,
      cursor: json.result_info?.cursor,
    };
  } catch (err) {
    console.error(`[cloudflare-kv] listKeys failed: ${err.message}`);
    return null;
  }
}

/**
 * List ALL keys in a namespace, auto-paginating until list_complete is true.
 * For large namespaces this may make many API calls; use prefix to narrow scope.
 *
 * @param {string} accountId - Cloudflare account ID
 * @param {string} token - Cloudflare API token
 * @param {string} namespaceId - KV namespace ID
 * @param {string} [prefix=''] - Optional key prefix filter
 * @returns {Promise<Array<{name: string, expiration?: number, metadata?: object}>|null>}
 *   Full array of key objects across all pages, or null on error
 */
export async function listAllKeys(accountId, token, namespaceId, prefix = '') {
  const allKeys = [];
  let cursor;

  do {
    const page = await listKeys(accountId, token, namespaceId, {
      limit: 1000,
      prefix: prefix || undefined,
      cursor,
    });

    if (!page) return null;

    allKeys.push(...page.keys);

    if (page.list_complete) break;
    cursor = page.cursor;
  } while (cursor);

  return allKeys;
}

// --- Bulk Operations ---

/**
 * Write multiple key-value pairs in a single API call.
 * Cloudflare supports up to 10,000 items per bulk write request.
 * If items exceeds 10,000, they are split into sequential batches automatically.
 *
 * @param {string} accountId - Cloudflare account ID
 * @param {string} token - Cloudflare API token
 * @param {string} namespaceId - KV namespace ID
 * @param {Array<object>} items - Array of key-value write descriptors
 * @param {string} items[].key - Key name
 * @param {string} items[].value - Value string
 * @param {number} [items[].ttl] - TTL in seconds (min 60)
 * @param {number} [items[].expiration] - Unix timestamp expiration
 * @param {object} [items[].metadata] - Metadata object to store with the key
 * @param {boolean} [items[].base64] - If true, value is base64-encoded binary
 * @returns {Promise<boolean>} true if all batches succeeded, false on any error
 */
export async function bulkWrite(accountId, token, namespaceId, items) {
  if (!accountId || !token || !namespaceId || !Array.isArray(items)) {
    console.error('[cloudflare-kv] bulkWrite: accountId, token, namespaceId, and items array are required');
    return false;
  }
  if (items.length === 0) return true;

  const BATCH_SIZE = 10000;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);

    try {
      const res = await fetch(`${nsPath(accountId, namespaceId)}/bulk`, {
        method: 'PUT',
        headers: buildHeaders(token),
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(TIMEOUT_MS * 2),
      });

      const json = await res.json().catch(() => null);
      if (!json || !json.success) {
        const msgs = (json?.errors || []).map((e) => `${e.code}: ${e.message}`).join(', ');
        console.error(`[cloudflare-kv] bulkWrite error ${res.status}: ${msgs || 'unknown'}`);
        return false;
      }
    } catch (err) {
      console.error(`[cloudflare-kv] bulkWrite failed: ${err.message}`);
      return false;
    }
  }

  return true;
}

/**
 * Delete multiple keys in a single API call.
 * Cloudflare supports up to 10,000 keys per bulk delete request.
 * Arrays larger than 10,000 are split into sequential batches automatically.
 *
 * @param {string} accountId - Cloudflare account ID
 * @param {string} token - Cloudflare API token
 * @param {string} namespaceId - KV namespace ID
 * @param {Array<string>} keys - Array of key names to delete
 * @returns {Promise<boolean>} true if all batches succeeded, false on any error
 */
export async function bulkDelete(accountId, token, namespaceId, keys) {
  if (!accountId || !token || !namespaceId || !Array.isArray(keys)) {
    console.error('[cloudflare-kv] bulkDelete: accountId, token, namespaceId, and keys array are required');
    return false;
  }
  if (keys.length === 0) return true;

  const BATCH_SIZE = 10000;

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const chunk = keys.slice(i, i + BATCH_SIZE);

    try {
      const res = await fetch(`${nsPath(accountId, namespaceId)}/bulk`, {
        method: 'DELETE',
        headers: buildHeaders(token),
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(TIMEOUT_MS * 2),
      });

      const json = await res.json().catch(() => null);
      if (!json || !json.success) {
        const msgs = (json?.errors || []).map((e) => `${e.code}: ${e.message}`).join(', ');
        console.error(`[cloudflare-kv] bulkDelete error ${res.status}: ${msgs || 'unknown'}`);
        return false;
      }
    } catch (err) {
      console.error(`[cloudflare-kv] bulkDelete failed: ${err.message}`);
      return false;
    }
  }

  return true;
}
