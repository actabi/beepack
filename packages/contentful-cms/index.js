// contentful-cms – zero-dependency Contentful Delivery API wrapper
// SPDX-License-Identifier: MIT

const DEFAULT_TIMEOUT = 15000;

/**
 * Build the base URL for the Contentful Delivery API.
 * @param {string} [spaceId] - Contentful space ID (falls back to env).
 * @returns {string} Base URL including environment path.
 */
function baseUrl(spaceId) {
  const id = spaceId || process.env.CONTENTFUL_SPACE_ID;
  if (!id) throw new Error('CONTENTFUL_SPACE_ID is required');
  return `https://cdn.contentful.com/spaces/${id}/environments/master`;
}

/**
 * Internal helper – execute an authenticated GET request.
 * @param {string} path - URL path appended to base.
 * @param {object} [opts] - Optional overrides.
 * @param {string} [opts.spaceId] - Space ID override.
 * @param {string} [opts.accessToken] - Access token override.
 * @param {Record<string,string>} [opts.params] - Query-string params.
 * @returns {Promise<object|null>} Parsed JSON or null on failure.
 */
async function request(path, opts = {}) {
  const token = opts.accessToken || process.env.CONTENTFUL_ACCESS_TOKEN;
  if (!token) throw new Error('CONTENTFUL_ACCESS_TOKEN is required');

  const url = new URL(`${baseUrl(opts.spaceId)}${path}`);
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`Contentful API error ${res.status}: ${text}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('Contentful request failed:', err.message);
    return null;
  }
}

/**
 * Fetch a single entry by ID.
 * @param {string} entryId - The entry ID.
 * @param {object} [opts] - Optional overrides (spaceId, accessToken).
 * @returns {Promise<object|null>} The entry object or null.
 */
export async function getEntry(entryId, opts = {}) {
  if (!entryId) throw new Error('entryId is required');
  return request(`/entries/${entryId}`, opts);
}

/**
 * Fetch multiple entries with optional query parameters.
 * @param {object} [query] - Contentful query parameters (content_type, limit, skip, etc.).
 * @param {object} [opts] - Optional overrides (spaceId, accessToken).
 * @returns {Promise<object|null>} The entries response or null.
 */
export async function getEntries(query = {}, opts = {}) {
  return request('/entries', { ...opts, params: query });
}

/**
 * Fetch a single asset by ID.
 * @param {string} assetId - The asset ID.
 * @param {object} [opts] - Optional overrides (spaceId, accessToken).
 * @returns {Promise<object|null>} The asset object or null.
 */
export async function getAsset(assetId, opts = {}) {
  if (!assetId) throw new Error('assetId is required');
  return request(`/assets/${assetId}`, opts);
}

/**
 * Fetch a content type definition.
 * @param {string} contentTypeId - The content type ID.
 * @param {object} [opts] - Optional overrides (spaceId, accessToken).
 * @returns {Promise<object|null>} The content type or null.
 */
export async function getContentType(contentTypeId, opts = {}) {
  if (!contentTypeId) throw new Error('contentTypeId is required');
  return request(`/content_types/${contentTypeId}`, opts);
}

/**
 * Search entries using full-text search and optional filters.
 * @param {string} queryText - The search query string.
 * @param {object} [filters] - Additional Contentful query params (content_type, limit, etc.).
 * @param {object} [opts] - Optional overrides (spaceId, accessToken).
 * @returns {Promise<object|null>} The search results or null.
 */
export async function searchEntries(queryText, filters = {}, opts = {}) {
  if (!queryText) throw new Error('queryText is required');
  const params = { ...filters, query: queryText };
  return request('/entries', { ...opts, params });
}
