// meilisearch-search – zero-dependency Meilisearch API wrapper
// https://github.com/meilisearch/meilisearch-js

const HOST = process.env.MEILISEARCH_HOST;
const API_KEY = process.env.MEILISEARCH_API_KEY;

/**
 * Build default headers for Meilisearch requests.
 * @returns {Record<string, string>}
 */
function headers() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_KEY}`,
  };
}

/**
 * Internal helper – make a request to the Meilisearch API.
 * @param {string} path - API path (relative to host)
 * @param {object} [opts] - fetch options
 * @returns {Promise<any|null>}
 */
async function request(path, opts = {}) {
  if (!HOST || !API_KEY) {
    throw new Error('MEILISEARCH_HOST and MEILISEARCH_API_KEY must be set');
  }
  const url = `${HOST.replace(/\/+$/, '')}${path}`;
  try {
    const res = await fetch(url, {
      ...opts,
      headers: { ...headers(), ...opts.headers },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Meilisearch ${res.status}: ${body}`);
    }
    return await res.json();
  } catch (err) {
    if (err.message?.startsWith('Meilisearch')) throw err;
    console.error('[meilisearch-search]', err.message);
    return null;
  }
}

/**
 * Search an index for documents matching a query.
 * @param {string} indexUid - The index to search
 * @param {string} query - Search query string
 * @param {object} [options] - Optional search parameters (limit, offset, filter, sort, etc.)
 * @param {number} [options.limit=20] - Maximum number of results
 * @param {number} [options.offset=0] - Number of results to skip
 * @param {string} [options.filter] - Filter expression
 * @param {string[]} [options.sort] - Sort rules
 * @param {string[]} [options.attributesToRetrieve] - Attributes to include in results
 * @returns {Promise<{hits: object[], estimatedTotalHits: number, query: string}|null>}
 */
export async function search(indexUid, query, options = {}) {
  if (!indexUid || typeof query !== 'string') {
    throw new Error('indexUid and query are required');
  }
  const payload = { q: query, ...options };
  return request(`/indexes/${encodeURIComponent(indexUid)}/search`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Add or update documents in an index.
 * @param {string} indexUid - Target index UID
 * @param {object[]} documents - Array of document objects to add
 * @param {string} [primaryKey] - Optional primary key field name
 * @returns {Promise<{taskUid: number, status: string}|null>} Enqueued task info
 */
export async function addDocuments(indexUid, documents, primaryKey) {
  if (!indexUid || !Array.isArray(documents)) {
    throw new Error('indexUid and documents array are required');
  }
  const path = primaryKey
    ? `/indexes/${encodeURIComponent(indexUid)}/documents?primaryKey=${encodeURIComponent(primaryKey)}`
    : `/indexes/${encodeURIComponent(indexUid)}/documents`;
  return request(path, {
    method: 'POST',
    body: JSON.stringify(documents),
  });
}

/**
 * Delete documents from an index by their IDs.
 * @param {string} indexUid - Target index UID
 * @param {(string|number)[]} documentIds - Array of document IDs to delete
 * @returns {Promise<{taskUid: number, status: string}|null>} Enqueued task info
 */
export async function deleteDocuments(indexUid, documentIds) {
  if (!indexUid || !Array.isArray(documentIds)) {
    throw new Error('indexUid and documentIds array are required');
  }
  return request(`/indexes/${encodeURIComponent(indexUid)}/documents/delete-batch`, {
    method: 'POST',
    body: JSON.stringify(documentIds),
  });
}

/**
 * Create a new index.
 * @param {string} uid - Unique identifier for the index
 * @param {string} [primaryKey] - Optional primary key field name
 * @returns {Promise<{taskUid: number, status: string}|null>} Enqueued task info
 */
export async function createIndex(uid, primaryKey) {
  if (!uid) {
    throw new Error('Index uid is required');
  }
  const payload = { uid };
  if (primaryKey) payload.primaryKey = primaryKey;
  return request('/indexes', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Get information about an index.
 * @param {string} uid - The index UID to retrieve
 * @returns {Promise<{uid: string, primaryKey: string|null, createdAt: string, updatedAt: string}|null>}
 */
export async function getIndex(uid) {
  if (!uid) {
    throw new Error('Index uid is required');
  }
  return request(`/indexes/${encodeURIComponent(uid)}`);
}
