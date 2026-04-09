// @ts-check

/**
 * Typesense search engine API wrapper.
 * Provides functions for searching, indexing, and managing collections via the Typesense REST API.
 * Zero dependencies — uses native fetch and AbortSignal.
 *
 * @module typesense-search
 */

const DEFAULT_HOST = process.env.TYPESENSE_HOST;
const DEFAULT_API_KEY = process.env.TYPESENSE_API_KEY;

/**
 * Build configuration from options and environment variables.
 * @param {object} [opts]
 * @param {string} [opts.host] - Typesense server host
 * @param {string} [opts.apiKey] - Typesense API key
 * @param {string} [opts.protocol] - Protocol (default: https)
 * @returns {{ baseUrl: string, apiKey: string }}
 */
function getConfig(opts = {}) {
  const host = opts.host || DEFAULT_HOST;
  const apiKey = opts.apiKey || DEFAULT_API_KEY;
  const protocol = opts.protocol || 'https';

  if (!host || !apiKey) {
    throw new Error(
      'Typesense configuration required. Set TYPESENSE_HOST and TYPESENSE_API_KEY env vars or pass as options.'
    );
  }

  return {
    baseUrl: `${protocol}://${host}`,
    apiKey,
  };
}

/**
 * Send a request to the Typesense API.
 * @param {string} method - HTTP method
 * @param {string} path - API path (e.g. /collections)
 * @param {object | null} body - Request body for POST/PUT/PATCH
 * @param {object} [opts] - Configuration overrides
 * @returns {Promise<object | null>}
 */
async function apiRequest(method, path, body = null, opts = {}) {
  try {
    const config = getConfig(opts);
    const url = `${config.baseUrl}${path}`;

    const headers = {
      'X-TYPESENSE-API-KEY': config.apiKey,
      Accept: 'application/json',
    };

    const fetchOpts = {
      method,
      headers,
      signal: AbortSignal.timeout(15000),
    };

    if (body !== null) {
      headers['Content-Type'] = 'application/json';
      fetchOpts.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOpts);

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      console.error(`Typesense API error (${response.status}): ${errText}`);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error(`Typesense API request failed: ${err.message}`);
    return null;
  }
}

/**
 * Send a JSONL import request to the Typesense API.
 * @param {string} path - API path
 * @param {string} jsonlBody - JSONL-formatted string
 * @param {object} [opts] - Configuration overrides
 * @returns {Promise<object[] | null>}
 */
async function jsonlRequest(path, jsonlBody, opts = {}) {
  try {
    const config = getConfig(opts);
    const url = `${config.baseUrl}${path}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-TYPESENSE-API-KEY': config.apiKey,
        'Content-Type': 'text/plain',
        Accept: 'application/json',
      },
      body: jsonlBody,
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      console.error(`Typesense JSONL import error (${response.status}): ${errText}`);
      return null;
    }

    const text = await response.text();
    const lines = text.trim().split('\n');
    return lines.map((line) => JSON.parse(line));
  } catch (err) {
    console.error(`Typesense JSONL request failed: ${err.message}`);
    return null;
  }
}

/**
 * Search a Typesense collection.
 * @param {string} collection - Collection name
 * @param {string} query - Search query string
 * @param {object} [params={}] - Additional search parameters
 * @param {string} [params.query_by] - Comma-separated list of fields to search
 * @param {string} [params.filter_by] - Filter expression
 * @param {string} [params.sort_by] - Sort expression
 * @param {number} [params.page] - Page number (default 1)
 * @param {number} [params.per_page] - Results per page (default 10)
 * @param {string} [params.facet_by] - Fields to facet on
 * @param {object} [opts] - Configuration overrides
 * @returns {Promise<{ found: number, hits: object[], facet_counts?: object[] } | null>}
 */
export async function search(collection, query, params = {}, opts = {}) {
  const searchParams = new URLSearchParams();
  searchParams.set('q', query);

  if (params.query_by) searchParams.set('query_by', params.query_by);
  if (params.filter_by) searchParams.set('filter_by', params.filter_by);
  if (params.sort_by) searchParams.set('sort_by', params.sort_by);
  if (params.page !== undefined) searchParams.set('page', String(params.page));
  if (params.per_page !== undefined) searchParams.set('per_page', String(params.per_page));
  if (params.facet_by) searchParams.set('facet_by', params.facet_by);

  // Pass through any additional params not explicitly handled
  for (const [key, value] of Object.entries(params)) {
    if (!searchParams.has(key)) {
      searchParams.set(key, String(value));
    }
  }

  const path = `/collections/${encodeURIComponent(collection)}/documents/search?${searchParams.toString()}`;
  return await apiRequest('GET', path, null, opts);
}

/**
 * Create a new Typesense collection.
 * @param {object} schema - Collection schema
 * @param {string} schema.name - Collection name
 * @param {object[]} schema.fields - Array of field definitions
 * @param {string} [schema.default_sorting_field] - Default field to sort by
 * @param {object} [opts] - Configuration overrides
 * @returns {Promise<object | null>} Created collection schema or null
 */
export async function createCollection(schema, opts = {}) {
  if (!schema || !schema.name || !schema.fields) {
    console.error('createCollection requires a schema with name and fields.');
    return null;
  }
  return await apiRequest('POST', '/collections', schema, opts);
}

/**
 * Index (upsert) a single document into a collection.
 * @param {string} collection - Collection name
 * @param {object} document - Document to index
 * @param {object} [options={}] - Index options
 * @param {string} [options.action] - Action: 'create', 'update', 'upsert' (default: 'create')
 * @param {object} [opts] - Configuration overrides
 * @returns {Promise<object | null>} Indexed document or null
 */
export async function indexDocument(collection, document, options = {}, opts = {}) {
  const action = options.action || 'create';
  const path = `/collections/${encodeURIComponent(collection)}/documents?action=${action}`;
  return await apiRequest('POST', path, document, opts);
}

/**
 * Bulk index multiple documents into a collection using JSONL import.
 * @param {string} collection - Collection name
 * @param {object[]} documents - Array of documents to index
 * @param {object} [options={}] - Import options
 * @param {string} [options.action] - Action: 'create', 'update', 'upsert' (default: 'create')
 * @param {number} [options.batch_size] - Batch size for import
 * @param {object} [opts] - Configuration overrides
 * @returns {Promise<object[] | null>} Array of import results or null
 */
export async function indexDocuments(collection, documents, options = {}, opts = {}) {
  if (!Array.isArray(documents) || documents.length === 0) {
    console.error('indexDocuments requires a non-empty array of documents.');
    return null;
  }

  const action = options.action || 'create';
  const params = new URLSearchParams({ action });
  if (options.batch_size) params.set('batch_size', String(options.batch_size));

  const path = `/collections/${encodeURIComponent(collection)}/documents/import?${params.toString()}`;
  const jsonlBody = documents.map((doc) => JSON.stringify(doc)).join('\n');

  return await jsonlRequest(path, jsonlBody, opts);
}

/**
 * Delete a document from a collection by ID.
 * @param {string} collection - Collection name
 * @param {string} documentId - Document ID to delete
 * @param {object} [opts] - Configuration overrides
 * @returns {Promise<object | null>} Deleted document or null
 */
export async function deleteDocument(collection, documentId, opts = {}) {
  const path = `/collections/${encodeURIComponent(collection)}/documents/${encodeURIComponent(documentId)}`;
  return await apiRequest('DELETE', path, null, opts);
}

/**
 * Get information about a collection.
 * @param {string} collection - Collection name
 * @param {object} [opts] - Configuration overrides
 * @returns {Promise<object | null>} Collection info or null
 */
export async function getCollection(collection, opts = {}) {
  const path = `/collections/${encodeURIComponent(collection)}`;
  return await apiRequest('GET', path, null, opts);
}
