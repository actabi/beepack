// airtable-client – zero-dependency Airtable API wrapper
// SPDX-License-Identifier: MIT

const DEFAULT_TIMEOUT = 15000;
const API_BASE = 'https://api.airtable.com/v0';

/**
 * Resolve the Airtable base ID from opts or environment.
 * @param {object} opts - Options object.
 * @returns {string} The base ID.
 */
function getBaseId(opts) {
  const id = opts.baseId || process.env.AIRTABLE_BASE_ID;
  if (!id) throw new Error('AIRTABLE_BASE_ID is required');
  return id;
}

/**
 * Build authorization headers.
 * @param {object} opts - Options object.
 * @returns {Record<string,string>} Headers object.
 */
function headers(opts) {
  const key = opts.apiKey || process.env.AIRTABLE_API_KEY;
  if (!key) throw new Error('AIRTABLE_API_KEY is required');
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Internal fetch helper.
 * @param {string} url - Full URL.
 * @param {object} fetchOpts - Fetch options.
 * @returns {Promise<object|null>} Parsed JSON or null.
 */
async function request(url, fetchOpts) {
  try {
    const res = await fetch(url, {
      ...fetchOpts,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`Airtable API error ${res.status}: ${text}`);
      return null;
    }
    // DELETE returns 200 with deleted:true but may have empty body
    const text = await res.text();
    return text ? JSON.parse(text) : { success: true };
  } catch (err) {
    console.error('Airtable request failed:', err.message);
    return null;
  }
}

/**
 * List records from a table with optional filtering.
 * @param {string} tableName - The table name or ID.
 * @param {object} [query] - Query options (maxRecords, view, filterByFormula, sort, pageSize, offset).
 * @param {object} [opts] - Optional overrides (apiKey, baseId).
 * @returns {Promise<object|null>} Records response or null.
 */
export async function listRecords(tableName, query = {}, opts = {}) {
  if (!tableName) throw new Error('tableName is required');
  const baseId = getBaseId(opts);
  const url = new URL(`${API_BASE}/${baseId}/${encodeURIComponent(tableName)}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return request(url.toString(), { method: 'GET', headers: headers(opts) });
}

/**
 * Get a single record by ID.
 * @param {string} tableName - The table name or ID.
 * @param {string} recordId - The record ID.
 * @param {object} [opts] - Optional overrides (apiKey, baseId).
 * @returns {Promise<object|null>} The record or null.
 */
export async function getRecord(tableName, recordId, opts = {}) {
  if (!tableName || !recordId) throw new Error('tableName and recordId are required');
  const baseId = getBaseId(opts);
  const url = `${API_BASE}/${baseId}/${encodeURIComponent(tableName)}/${recordId}`;
  return request(url, { method: 'GET', headers: headers(opts) });
}

/**
 * Create a new record in a table.
 * @param {string} tableName - The table name or ID.
 * @param {Record<string,any>} fields - Field values for the new record.
 * @param {object} [opts] - Optional overrides (apiKey, baseId).
 * @returns {Promise<object|null>} The created record or null.
 */
export async function createRecord(tableName, fields, opts = {}) {
  if (!tableName || !fields) throw new Error('tableName and fields are required');
  const baseId = getBaseId(opts);
  const url = `${API_BASE}/${baseId}/${encodeURIComponent(tableName)}`;
  return request(url, {
    method: 'POST',
    headers: headers(opts),
    body: JSON.stringify({ fields }),
  });
}

/**
 * Update an existing record (PATCH — partial update).
 * @param {string} tableName - The table name or ID.
 * @param {string} recordId - The record ID.
 * @param {Record<string,any>} fields - Field values to update.
 * @param {object} [opts] - Optional overrides (apiKey, baseId).
 * @returns {Promise<object|null>} The updated record or null.
 */
export async function updateRecord(tableName, recordId, fields, opts = {}) {
  if (!tableName || !recordId || !fields) {
    throw new Error('tableName, recordId, and fields are required');
  }
  const baseId = getBaseId(opts);
  const url = `${API_BASE}/${baseId}/${encodeURIComponent(tableName)}/${recordId}`;
  return request(url, {
    method: 'PATCH',
    headers: headers(opts),
    body: JSON.stringify({ fields }),
  });
}

/**
 * Delete a record by ID.
 * @param {string} tableName - The table name or ID.
 * @param {string} recordId - The record ID to delete.
 * @param {object} [opts] - Optional overrides (apiKey, baseId).
 * @returns {Promise<object|null>} Deletion confirmation or null.
 */
export async function deleteRecord(tableName, recordId, opts = {}) {
  if (!tableName || !recordId) throw new Error('tableName and recordId are required');
  const baseId = getBaseId(opts);
  const url = `${API_BASE}/${baseId}/${encodeURIComponent(tableName)}/${recordId}`;
  return request(url, { method: 'DELETE', headers: headers(opts) });
}
