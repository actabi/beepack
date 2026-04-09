// Algolia Search Client
// Zero dependencies - uses native fetch with the Algolia REST API v1.
// Covers index settings management, record sync (save/batch/delete),
// full-text search with filters and facets, and query suggestions.

const TIMEOUT_MS = 15000;

// --- Helpers ---

/**
 * Build the Algolia DSN base URL for a given app ID.
 * @param {string} appId - Algolia application ID
 * @returns {string}
 */
function baseUrl(appId) {
  return `https://${appId}-dsn.algolia.net/1`;
}

/**
 * Build standard Algolia request headers.
 * @param {string} appId - Algolia application ID
 * @param {string} apiKey - Algolia API key (Admin or Search depending on operation)
 * @returns {object}
 */
function buildHeaders(appId, apiKey) {
  return {
    "X-Algolia-Application-Id": appId,
    "X-Algolia-API-Key": apiKey,
    "Content-Type": "application/json",
  };
}

/**
 * Execute a fetch with timeout and unified error handling.
 * Returns null on any error rather than throwing.
 * @param {string} tag - Log prefix, e.g. "search"
 * @param {string} url
 * @param {RequestInit} options
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
        `[algolia-search] ${tag} error ${res.status}: ${err.message || err.reason || ""}`
      );
      return null;
    }

    return res.json();
  } catch (err) {
    console.error(`[algolia-search] ${tag} failed: ${err.message}`);
    return null;
  }
}

// --- Index Settings ---

/**
 * Retrieve the settings for an Algolia index.
 * Returns the full settings object including searchableAttributes, ranking,
 * attributesForFaceting, and all other index configuration.
 *
 * @param {string} appId - Algolia application ID
 * @param {string} apiKey - Algolia Admin API key
 * @param {string} indexName - Target index name
 * @returns {Promise<object|null>} Index settings object, or null on error
 */
export async function getIndexSettings(appId, apiKey, indexName) {
  return apiFetch(
    "getIndexSettings",
    `${baseUrl(appId)}/indexes/${encodeURIComponent(indexName)}/settings`,
    { method: "GET", headers: buildHeaders(appId, apiKey) }
  );
}

/**
 * Update settings for an Algolia index.
 * Only the provided settings keys are updated; others are left unchanged.
 * Common settings: searchableAttributes, attributesForFaceting, ranking,
 * customRanking, attributesToRetrieve, hitsPerPage.
 *
 * @param {string} appId - Algolia application ID
 * @param {string} apiKey - Algolia Admin API key
 * @param {string} indexName - Target index name
 * @param {object} settings - Partial settings object to apply
 * @param {boolean} [forwardToReplicas=false] - Propagate changes to replica indices
 * @returns {Promise<{taskID: number, updatedAt: string}|null>} Task confirmation or null on error
 */
export async function updateIndexSettings(appId, apiKey, indexName, settings, forwardToReplicas = false) {
  const params = forwardToReplicas ? "?forwardToReplicas=true" : "";
  return apiFetch(
    "updateIndexSettings",
    `${baseUrl(appId)}/indexes/${encodeURIComponent(indexName)}/settings${params}`,
    {
      method: "PUT",
      headers: buildHeaders(appId, apiKey),
      body: JSON.stringify(settings),
    }
  );
}

/**
 * Configure the searchable attributes for an index.
 * Attributes listed first receive the highest search priority.
 * Wrap an attribute in an array to make co-equal with others at that position.
 *
 * @param {string} appId
 * @param {string} apiKey - Algolia Admin API key
 * @param {string} indexName
 * @param {Array<string>} attributes - Ordered list of attribute names
 * @returns {Promise<object|null>}
 */
export async function setSearchableAttributes(appId, apiKey, indexName, attributes) {
  return updateIndexSettings(appId, apiKey, indexName, { searchableAttributes: attributes });
}

/**
 * Configure faceting attributes for an index.
 * Prefix with "filterOnly(" to allow filtering without facet counts.
 * Prefix with "searchable(" to enable facet value search.
 *
 * @param {string} appId
 * @param {string} apiKey - Algolia Admin API key
 * @param {string} indexName
 * @param {Array<string>} attributes - List of attribute names to facet on
 * @returns {Promise<object|null>}
 */
export async function setAttributesForFaceting(appId, apiKey, indexName, attributes) {
  return updateIndexSettings(appId, apiKey, indexName, { attributesForFaceting: attributes });
}

/**
 * Configure the ranking formula for an index.
 * Standard criteria: typo, geo, words, filters, proximity, attribute, exact, custom.
 * Custom criteria reference attributes via "asc(attr)" or "desc(attr)".
 *
 * @param {string} appId
 * @param {string} apiKey - Algolia Admin API key
 * @param {string} indexName
 * @param {Array<string>} ranking - Ordered ranking criteria array
 * @param {Array<string>} [customRanking] - Custom ranking attributes (asc/desc)
 * @returns {Promise<object|null>}
 */
export async function setRanking(appId, apiKey, indexName, ranking, customRanking) {
  const settings = { ranking };
  if (customRanking) settings.customRanking = customRanking;
  return updateIndexSettings(appId, apiKey, indexName, settings);
}

// --- Record Sync ---

/**
 * Save (create or replace) a single record in an index.
 * If the record has an `objectID` field it is used; otherwise Algolia assigns one.
 *
 * @param {string} appId
 * @param {string} apiKey - Algolia Admin API key
 * @param {string} indexName
 * @param {object} record - Record object; include `objectID` to upsert by ID
 * @returns {Promise<{createdAt: string, taskID: number, objectID: string}|null>}
 */
export async function saveRecord(appId, apiKey, indexName, record) {
  const hasId = Boolean(record.objectID);
  const method = hasId ? "PUT" : "POST";
  const path = hasId
    ? `/indexes/${encodeURIComponent(indexName)}/${encodeURIComponent(record.objectID)}`
    : `/indexes/${encodeURIComponent(indexName)}`;

  return apiFetch("saveRecord", `${baseUrl(appId)}${path}`, {
    method,
    headers: buildHeaders(appId, apiKey),
    body: JSON.stringify(record),
  });
}

/**
 * Partially update a record's attributes without replacing the whole object.
 * Only the provided fields are changed; all other attributes are left intact.
 *
 * @param {string} appId
 * @param {string} apiKey - Algolia Admin API key
 * @param {string} indexName
 * @param {string} objectID - Target record's objectID
 * @param {object} attributes - Partial attribute map to merge into the record
 * @param {boolean} [createIfNotExists=true] - Create the record if it does not exist
 * @returns {Promise<object|null>}
 */
export async function partialUpdateRecord(appId, apiKey, indexName, objectID, attributes, createIfNotExists = true) {
  const params = createIfNotExists ? "" : "?createIfNotExists=false";
  return apiFetch(
    "partialUpdateRecord",
    `${baseUrl(appId)}/indexes/${encodeURIComponent(indexName)}/${encodeURIComponent(objectID)}/partial${params}`,
    {
      method: "POST",
      headers: buildHeaders(appId, apiKey),
      body: JSON.stringify(attributes),
    }
  );
}

/**
 * Batch save, update, or delete multiple records in a single API call.
 * Algolia recommends batches of 1 000 records max; this function automatically
 * splits larger arrays into sequential batches.
 *
 * @param {string} appId
 * @param {string} apiKey - Algolia Admin API key
 * @param {string} indexName
 * @param {Array<{action: string, body: object}>} requests - Batch operation objects.
 *   action is one of: "addObject" | "updateObject" | "partialUpdateObject" |
 *   "partialUpdateObjectNoCreate" | "deleteObject" | "clear"
 * @param {number} [batchSize=1000] - Max records per API call
 * @returns {Promise<Array<object>|null>} Array of task objects for each batch, or null on error
 */
export async function batchRecords(appId, apiKey, indexName, requests, batchSize = 1000) {
  const results = [];

  for (let i = 0; i < requests.length; i += batchSize) {
    const chunk = requests.slice(i, i + batchSize);
    const data = await apiFetch(
      "batchRecords",
      `${baseUrl(appId)}/indexes/${encodeURIComponent(indexName)}/batch`,
      {
        method: "POST",
        headers: buildHeaders(appId, apiKey),
        body: JSON.stringify({ requests: chunk }),
      }
    );
    if (!data) return null;
    results.push(data);
  }

  return results;
}

/**
 * Delete a single record from an index by its objectID.
 *
 * @param {string} appId
 * @param {string} apiKey - Algolia Admin API key
 * @param {string} indexName
 * @param {string} objectID
 * @returns {Promise<{deletedAt: string, taskID: number}|null>}
 */
export async function deleteRecord(appId, apiKey, indexName, objectID) {
  return apiFetch(
    "deleteRecord",
    `${baseUrl(appId)}/indexes/${encodeURIComponent(indexName)}/${encodeURIComponent(objectID)}`,
    { method: "DELETE", headers: buildHeaders(appId, apiKey) }
  );
}

/**
 * Delete all records matching a filter expression from an index.
 * The index must have `attributesForFaceting` configured for the filtered attributes.
 *
 * @param {string} appId
 * @param {string} apiKey - Algolia Admin API key
 * @param {string} indexName
 * @param {string} filters - Algolia filter expression, e.g. "category:books AND price < 10"
 * @returns {Promise<object|null>}
 */
export async function deleteRecordsByFilter(appId, apiKey, indexName, filters) {
  return apiFetch(
    "deleteRecordsByFilter",
    `${baseUrl(appId)}/indexes/${encodeURIComponent(indexName)}/deleteByQuery`,
    {
      method: "POST",
      headers: buildHeaders(appId, apiKey),
      body: JSON.stringify({ params: `filters=${encodeURIComponent(filters)}` }),
    }
  );
}

// --- Search ---

/**
 * Search an Algolia index with optional filters, facets, and pagination.
 *
 * @param {string} appId
 * @param {string} apiKey - Search-only or Admin API key
 * @param {string} indexName
 * @param {string} query - Full-text search query (empty string matches all)
 * @param {object} [options]
 * @param {string} [options.filters] - Algolia filter expression, e.g. "category:books"
 * @param {Array<string>} [options.facets] - Attribute names to return facet counts for
 * @param {object} [options.facetFilters] - Facet filter array, e.g. [["category:books","category:games"]]
 * @param {number} [options.page=0] - Zero-based page number
 * @param {number} [options.hitsPerPage=20] - Results per page (max 1000)
 * @param {Array<string>} [options.attributesToRetrieve] - Limit returned attributes
 * @param {Array<string>} [options.attributesToHighlight] - Attributes to include snippets for
 * @param {boolean} [options.analytics=true] - Record the search in analytics
 * @param {string} [options.userToken] - User token for personalization and analytics
 * @returns {Promise<{hits: Array<object>, nbHits: number, page: number, nbPages: number, facets: object|null}>}
 */
export async function search(appId, apiKey, indexName, query, options = {}) {
  const {
    filters,
    facets,
    facetFilters,
    page = 0,
    hitsPerPage = 20,
    attributesToRetrieve,
    attributesToHighlight,
    analytics = true,
    userToken,
  } = options;

  const params = { query, page, hitsPerPage, analytics };
  if (filters) params.filters = filters;
  if (facets) params.facets = facets;
  if (facetFilters) params.facetFilters = facetFilters;
  if (attributesToRetrieve) params.attributesToRetrieve = attributesToRetrieve;
  if (attributesToHighlight) params.attributesToHighlight = attributesToHighlight;
  if (userToken) params.userToken = userToken;

  const data = await apiFetch(
    "search",
    `${baseUrl(appId)}/indexes/${encodeURIComponent(indexName)}/query`,
    {
      method: "POST",
      headers: buildHeaders(appId, apiKey),
      body: JSON.stringify(params),
    }
  );

  if (!data) return null;

  return {
    hits: data.hits ?? [],
    nbHits: data.nbHits ?? 0,
    page: data.page ?? 0,
    nbPages: data.nbPages ?? 0,
    facets: data.facets ?? null,
    processingTimeMS: data.processingTimeMS,
    query: data.query,
  };
}

/**
 * Execute multiple search queries across one or more indices in a single request.
 * Useful for federated search (searching several indices simultaneously).
 *
 * @param {string} appId
 * @param {string} apiKey - Search-only or Admin API key
 * @param {Array<{indexName: string, query: string, params?: object}>} queries
 * @returns {Promise<Array<object>|null>} Array of result objects (one per query), or null on error
 */
export async function multiSearch(appId, apiKey, queries) {
  const requests = queries.map(({ indexName, query, params = {} }) => ({
    indexName,
    query,
    ...params,
  }));

  const data = await apiFetch(
    "multiSearch",
    `${baseUrl(appId)}/indexes/*/queries`,
    {
      method: "POST",
      headers: buildHeaders(appId, apiKey),
      body: JSON.stringify({ requests }),
    }
  );

  return data?.results ?? null;
}

// --- Query Suggestions ---

/**
 * Fetch query suggestions for a given prefix from an Algolia Query Suggestions index.
 * Query Suggestions indices are regular Algolia indices populated by the
 * Query Suggestions feature and must be created in the Algolia dashboard first.
 *
 * @param {string} appId
 * @param {string} apiKey - Search-only or Admin API key
 * @param {string} suggestionsIndexName - Name of the Query Suggestions index
 * @param {string} query - Partial query to fetch suggestions for
 * @param {number} [limit=5] - Maximum number of suggestions to return
 * @returns {Promise<Array<{query: string, count: number}>|null>} Suggestion list or null on error
 */
export async function getQuerySuggestions(appId, apiKey, suggestionsIndexName, query, limit = 5) {
  const data = await search(appId, apiKey, suggestionsIndexName, query, {
    hitsPerPage: limit,
    attributesToRetrieve: ["query", "count"],
    analytics: false,
  });

  if (!data) return null;
  return data.hits.map((hit) => ({ query: hit.query ?? hit.objectID, count: hit.count ?? 0 }));
}

/**
 * Search within the values of a facet attribute.
 * Returns matching facet values and their record counts.
 * The attribute must be listed in `attributesForFaceting` for the index.
 *
 * @param {string} appId
 * @param {string} apiKey - Search-only or Admin API key
 * @param {string} indexName
 * @param {string} facetName - Attribute name to search within
 * @param {string} facetQuery - Prefix or substring to match facet values against
 * @param {object} [options]
 * @param {string} [options.filters] - Restrict facet search to a filtered subset of records
 * @param {number} [options.maxFacetHits=10] - Maximum number of facet values to return (max 100)
 * @returns {Promise<Array<{value: string, count: number}>|null>}
 */
export async function searchFacetValues(appId, apiKey, indexName, facetName, facetQuery, options = {}) {
  const { filters, maxFacetHits = 10 } = options;

  const body = { facetQuery, maxFacetHits: Math.min(maxFacetHits, 100) };
  if (filters) body.filters = filters;

  const data = await apiFetch(
    "searchFacetValues",
    `${baseUrl(appId)}/indexes/${encodeURIComponent(indexName)}/facets/${encodeURIComponent(facetName)}/query`,
    {
      method: "POST",
      headers: buildHeaders(appId, apiKey),
      body: JSON.stringify(body),
    }
  );

  if (!data) return null;
  return (data.facetHits ?? []).map((hit) => ({ value: hit.value, count: hit.count }));
}
