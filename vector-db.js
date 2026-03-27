/**
 * Qdrant Vector Database Client for Beepack
 * Handles vector storage and similarity search at scale
 */

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION_NAME = process.env.QDRANT_COLLECTION || 'packages';
const VECTOR_SIZE = 1536; // OpenAI text-embedding-3-small

/**
 * Make request to Qdrant API
 */
async function qdrantRequest(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };
  
  if (QDRANT_API_KEY) {
    headers['api-key'] = QDRANT_API_KEY;
  }
  
  const response = await fetch(`${QDRANT_URL}${endpoint}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.status?.error || `Qdrant error: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Check if Qdrant is available
 */
export async function isQdrantAvailable() {
  try {
    await qdrantRequest('/collections');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Initialize the packages collection
 */
export async function initCollection() {
  try {
    // Check if collection exists
    const collections = await qdrantRequest('/collections');
    const exists = collections.result?.collections?.some(c => c.name === COLLECTION_NAME);
    
    if (!exists) {
      // Create collection
      await qdrantRequest(`/collections/${COLLECTION_NAME}`, {
        method: 'PUT',
        body: JSON.stringify({
          vectors: {
            size: VECTOR_SIZE,
            distance: 'Cosine',
          },
          optimizers_config: {
            indexing_threshold: 10000, // Start HNSW indexing after 10k vectors
          },
        }),
      });
      console.log(`✅ Created Qdrant collection: ${COLLECTION_NAME}`);
    } else {
      console.log(`✅ Qdrant collection exists: ${COLLECTION_NAME}`);
    }
    
    return true;
  } catch (e) {
    console.error('❌ Qdrant init failed:', e.message);
    return false;
  }
}

/**
 * Upsert a package vector
 * @param {string} id - Package ID (slug or numeric)
 * @param {number[]} vector - 1536-dim embedding
 * @param {object} payload - Metadata (slug, name, description, keywords, etc.)
 */
export async function upsertVector(id, vector, payload = {}) {
  await qdrantRequest(`/collections/${COLLECTION_NAME}/points`, {
    method: 'PUT',
    body: JSON.stringify({
      points: [
        {
          id: typeof id === 'string' ? hashString(id) : id,
          vector,
          payload: {
            ...payload,
            originalId: id,
          },
        },
      ],
    }),
  });
}

/**
 * Batch upsert multiple vectors
 */
export async function upsertVectors(points) {
  await qdrantRequest(`/collections/${COLLECTION_NAME}/points`, {
    method: 'PUT',
    body: JSON.stringify({
      points: points.map(p => ({
        id: typeof p.id === 'string' ? hashString(p.id) : p.id,
        vector: p.vector,
        payload: {
          ...p.payload,
          originalId: p.id,
        },
      })),
    }),
  });
}

/**
 * Search for similar vectors
 * @param {number[]} queryVector - Query embedding
 * @param {number} limit - Max results
 * @param {object} filter - Optional filter conditions
 * @returns {Array} Matching packages with scores
 */
export async function searchVectors(queryVector, limit = 10, filter = null) {
  const body = {
    vector: queryVector,
    limit,
    with_payload: true,
  };
  
  if (filter) {
    body.filter = filter;
  }
  
  const response = await qdrantRequest(`/collections/${COLLECTION_NAME}/points/search`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  
  return response.result.map(r => ({
    id: r.payload.originalId || r.id,
    score: r.score,
    ...r.payload,
  }));
}

/**
 * Delete a vector by ID
 */
export async function deleteVector(id) {
  await qdrantRequest(`/collections/${COLLECTION_NAME}/points/delete`, {
    method: 'POST',
    body: JSON.stringify({
      points: [typeof id === 'string' ? hashString(id) : id],
    }),
  });
}

/**
 * Get collection info (count, status)
 */
export async function getCollectionInfo() {
  try {
    const response = await qdrantRequest(`/collections/${COLLECTION_NAME}`);
    return {
      vectorCount: response.result?.vectors_count || 0,
      pointsCount: response.result?.points_count || 0,
      status: response.result?.status || 'unknown',
    };
  } catch (e) {
    return { vectorCount: 0, pointsCount: 0, status: 'unavailable' };
  }
}

/**
 * Hash string to numeric ID (Qdrant prefers numeric IDs)
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Create filter for Qdrant queries
 */
export function createFilter(conditions) {
  const must = [];
  
  if (conditions.compatible) {
    must.push({
      key: 'compatible',
      match: { any: Array.isArray(conditions.compatible) ? conditions.compatible : [conditions.compatible] },
    });
  }
  
  if (conditions.keywords) {
    must.push({
      key: 'keywords',
      match: { any: Array.isArray(conditions.keywords) ? conditions.keywords : [conditions.keywords] },
    });
  }
  
  if (conditions.owner) {
    must.push({
      key: 'owner',
      match: { value: conditions.owner },
    });
  }
  
  return must.length > 0 ? { must } : null;
}

export default {
  isQdrantAvailable,
  initCollection,
  upsertVector,
  upsertVectors,
  searchVectors,
  deleteVector,
  getCollectionInfo,
  createFilter,
};
