// pinecone-vectors – zero-dependency Pinecone vector database API wrapper
// SPDX-License-Identifier: MIT

const DEFAULT_TIMEOUT = 15000;

/**
 * Resolve the Pinecone API key from opts or environment.
 * @param {object} opts - Options object.
 * @returns {string} The API key.
 */
function getApiKey(opts) {
  const key = opts.apiKey || process.env.PINECONE_API_KEY;
  if (!key) throw new Error('PINECONE_API_KEY is required');
  return key;
}

/**
 * Resolve the Pinecone index host from opts or environment.
 * @param {object} opts - Options object.
 * @returns {string} The index host URL (e.g. https://my-index-abc123.svc.us-east1-gcp.pinecone.io).
 */
function getIndexHost(opts) {
  const host = opts.indexHost || process.env.PINECONE_INDEX_HOST;
  if (!host) throw new Error('PINECONE_INDEX_HOST is required');
  return host.replace(/\/$/, '');
}

/**
 * Internal POST request to an index endpoint.
 * @param {string} host - Index host URL.
 * @param {string} path - API path.
 * @param {object} body - JSON body.
 * @param {object} opts - Auth options.
 * @returns {Promise<object|null>} Parsed response or null.
 */
async function indexPost(host, path, body, opts) {
  try {
    const res = await fetch(`${host}${path}`, {
      method: 'POST',
      headers: {
        'Api-Key': getApiKey(opts),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`Pinecone API error ${res.status}: ${text}`);
      return null;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : { success: true };
  } catch (err) {
    console.error('Pinecone request failed:', err.message);
    return null;
  }
}

/**
 * Internal GET request to the control plane API.
 * @param {string} path - API path.
 * @param {object} opts - Auth options.
 * @returns {Promise<object|null>} Parsed response or null.
 */
async function controlGet(path, opts) {
  try {
    const res = await fetch(`https://api.pinecone.io${path}`, {
      headers: {
        'Api-Key': getApiKey(opts),
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`Pinecone API error ${res.status}: ${text}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('Pinecone request failed:', err.message);
    return null;
  }
}

/**
 * Upsert vectors into the index.
 * @param {Array<{id: string, values: number[], metadata?: Record<string,any>}>} vectors - Vectors to upsert.
 * @param {object} [opts] - Optional overrides (apiKey, indexHost, namespace).
 * @returns {Promise<object|null>} Upsert result or null.
 */
export async function upsert(vectors, opts = {}) {
  if (!Array.isArray(vectors) || vectors.length === 0) {
    throw new Error('vectors must be a non-empty array');
  }
  const host = getIndexHost(opts);
  const body = { vectors };
  if (opts.namespace) body.namespace = opts.namespace;
  return indexPost(host, '/vectors/upsert', body, opts);
}

/**
 * Query the index for similar vectors.
 * @param {object} params - Query parameters.
 * @param {number[]} [params.vector] - Query vector for similarity search.
 * @param {string} [params.id] - Query by vector ID instead of providing a vector.
 * @param {number} [params.topK=10] - Number of results to return.
 * @param {boolean} [params.includeMetadata=false] - Include vector metadata.
 * @param {boolean} [params.includeValues=false] - Include vector values.
 * @param {Record<string,any>} [params.filter] - Metadata filter object.
 * @param {object} [opts] - Optional overrides (apiKey, indexHost, namespace).
 * @returns {Promise<object|null>} Query results or null.
 */
export async function query(params, opts = {}) {
  if (!params) throw new Error('query params are required');
  const host = getIndexHost(opts);
  const body = {
    topK: params.topK || 10,
    includeMetadata: params.includeMetadata ?? false,
    includeValues: params.includeValues ?? false,
  };
  if (params.vector) body.vector = params.vector;
  if (params.id) body.id = params.id;
  if (params.filter) body.filter = params.filter;
  if (opts.namespace) body.namespace = opts.namespace;
  return indexPost(host, '/query', body, opts);
}

/**
 * Delete vectors from the index.
 * @param {object} params - Deletion parameters.
 * @param {string[]} [params.ids] - Vector IDs to delete.
 * @param {boolean} [params.deleteAll] - Delete all vectors in the namespace.
 * @param {Record<string,any>} [params.filter] - Metadata filter for selective deletion.
 * @param {object} [opts] - Optional overrides (apiKey, indexHost, namespace).
 * @returns {Promise<object|null>} Deletion result or null.
 */
export async function deleteVectors(params, opts = {}) {
  if (!params) throw new Error('delete params are required');
  const host = getIndexHost(opts);
  const body = {};
  if (params.ids) body.ids = params.ids;
  if (params.deleteAll) body.deleteAll = true;
  if (params.filter) body.filter = params.filter;
  if (opts.namespace) body.namespace = opts.namespace;
  return indexPost(host, '/vectors/delete', body, opts);
}

/**
 * Describe an index to get its configuration and status.
 * @param {string} indexName - The name of the index.
 * @param {object} [opts] - Optional overrides (apiKey).
 * @returns {Promise<object|null>} Index description or null.
 */
export async function describeIndex(indexName, opts = {}) {
  if (!indexName) throw new Error('indexName is required');
  return controlGet(`/indexes/${indexName}`, opts);
}

/**
 * List all indexes in the Pinecone project.
 * @param {object} [opts] - Optional overrides (apiKey).
 * @returns {Promise<object|null>} List of indexes or null.
 */
export async function listIndexes(opts = {}) {
  return controlGet('/indexes', opts);
}
