// @ts-check

/**
 * MongoDB Atlas Data API wrapper.
 * Provides a simple interface to MongoDB collections via the Atlas Data API REST endpoints.
 * Zero dependencies — uses native fetch and AbortSignal.
 *
 * @module mongodb-rest-client
 */

const DEFAULT_API_KEY = process.env.MONGODB_DATA_API_KEY;
const DEFAULT_API_URL = process.env.MONGODB_DATA_API_URL;
const DEFAULT_CLUSTER = process.env.MONGODB_CLUSTER;
const DEFAULT_DATABASE = process.env.MONGODB_DATABASE;

/**
 * Build the configuration object from options and environment variables.
 * @param {object} [opts]
 * @param {string} [opts.apiKey] - Atlas Data API key
 * @param {string} [opts.apiUrl] - Atlas Data API base URL
 * @param {string} [opts.cluster] - Cluster name
 * @param {string} [opts.database] - Database name
 * @returns {{ apiKey: string, apiUrl: string, cluster: string, database: string }}
 */
function getConfig(opts = {}) {
  const apiKey = opts.apiKey || DEFAULT_API_KEY;
  const apiUrl = opts.apiUrl || DEFAULT_API_URL;
  const cluster = opts.cluster || DEFAULT_CLUSTER;
  const database = opts.database || DEFAULT_DATABASE;

  if (!apiKey || !apiUrl || !cluster || !database) {
    throw new Error(
      'MongoDB Atlas Data API configuration required. Set MONGODB_DATA_API_KEY, MONGODB_DATA_API_URL, MONGODB_CLUSTER, MONGODB_DATABASE env vars or pass as options.'
    );
  }

  return { apiKey, apiUrl: apiUrl.replace(/\/$/, ''), cluster, database };
}

/**
 * Send a request to the MongoDB Atlas Data API.
 * @param {string} action - The API action (e.g. findOne, find, insertOne)
 * @param {object} body - Request body payload
 * @param {object} [opts] - Configuration overrides
 * @returns {Promise<object | null>} Parsed JSON response or null on error
 */
async function apiRequest(action, body, opts = {}) {
  try {
    const config = getConfig(opts);
    const url = `${config.apiUrl}/action/${action}`;

    const payload = {
      dataSource: config.cluster,
      database: config.database,
      ...body,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': config.apiKey,
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      console.error(`MongoDB Data API error (${response.status}): ${errText}`);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error(`MongoDB Data API request failed: ${err.message}`);
    return null;
  }
}

/**
 * Find a single document matching a filter.
 * @param {string} collection - Collection name
 * @param {object} [filter={}] - MongoDB query filter
 * @param {object} [projection] - Fields to include/exclude
 * @param {object} [opts] - Configuration overrides
 * @returns {Promise<object | null>} The matched document or null
 */
export async function findOne(collection, filter = {}, projection, opts = {}) {
  const body = { collection, filter };
  if (projection) {
    body.projection = projection;
  }
  const result = await apiRequest('findOne', body, opts);
  return result ? result.document || null : null;
}

/**
 * Find multiple documents matching a filter.
 * @param {string} collection - Collection name
 * @param {object} [filter={}] - MongoDB query filter
 * @param {object} [options={}] - Query options
 * @param {object} [options.projection] - Fields to include/exclude
 * @param {object} [options.sort] - Sort specification
 * @param {number} [options.limit] - Maximum documents to return
 * @param {number} [options.skip] - Number of documents to skip
 * @param {object} [opts] - Configuration overrides
 * @returns {Promise<object[] | null>} Array of matched documents or null
 */
export async function find(collection, filter = {}, options = {}, opts = {}) {
  const body = { collection, filter };
  if (options.projection) body.projection = options.projection;
  if (options.sort) body.sort = options.sort;
  if (options.limit !== undefined) body.limit = options.limit;
  if (options.skip !== undefined) body.skip = options.skip;

  const result = await apiRequest('find', body, opts);
  return result ? result.documents || [] : null;
}

/**
 * Insert a single document into a collection.
 * @param {string} collection - Collection name
 * @param {object} document - The document to insert
 * @param {object} [opts] - Configuration overrides
 * @returns {Promise<{ insertedId: string } | null>} Insert result or null
 */
export async function insertOne(collection, document, opts = {}) {
  const result = await apiRequest('insertOne', { collection, document }, opts);
  return result ? { insertedId: result.insertedId } : null;
}

/**
 * Insert multiple documents into a collection.
 * @param {string} collection - Collection name
 * @param {object[]} documents - Array of documents to insert
 * @param {object} [opts] - Configuration overrides
 * @returns {Promise<{ insertedIds: string[] } | null>} Insert result or null
 */
export async function insertMany(collection, documents, opts = {}) {
  if (!Array.isArray(documents) || documents.length === 0) {
    console.error('insertMany requires a non-empty array of documents.');
    return null;
  }
  const result = await apiRequest('insertMany', { collection, documents }, opts);
  return result ? { insertedIds: result.insertedIds || [] } : null;
}

/**
 * Update a single document matching a filter.
 * @param {string} collection - Collection name
 * @param {object} filter - MongoDB query filter
 * @param {object} update - Update operations (e.g. { $set: { ... } })
 * @param {object} [options={}] - Update options
 * @param {boolean} [options.upsert] - Insert if no match found
 * @param {object} [opts] - Configuration overrides
 * @returns {Promise<{ matchedCount: number, modifiedCount: number, upsertedId?: string } | null>}
 */
export async function updateOne(collection, filter, update, options = {}, opts = {}) {
  const body = { collection, filter, update };
  if (options.upsert) body.upsert = true;

  const result = await apiRequest('updateOne', body, opts);
  if (!result) return null;

  return {
    matchedCount: result.matchedCount || 0,
    modifiedCount: result.modifiedCount || 0,
    ...(result.upsertedId ? { upsertedId: result.upsertedId } : {}),
  };
}

/**
 * Delete a single document matching a filter.
 * @param {string} collection - Collection name
 * @param {object} filter - MongoDB query filter
 * @param {object} [opts] - Configuration overrides
 * @returns {Promise<{ deletedCount: number } | null>} Delete result or null
 */
export async function deleteOne(collection, filter, opts = {}) {
  const result = await apiRequest('deleteOne', { collection, filter }, opts);
  return result ? { deletedCount: result.deletedCount || 0 } : null;
}
