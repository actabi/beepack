/**
 * Semantic Search with OpenAI Embeddings for Beepack
 * Supports Qdrant vector DB with SQLite fallback
 */

import { isQdrantAvailable, initCollection, upsertVector, searchVectors, getCollectionInfo, createFilter } from './vector-db.js';

// Config
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

// State
let useQdrant = false;

/**
 * Check if embeddings are available
 */
export function isEmbeddingsEnabled() {
  return !!OPENAI_API_KEY;
}

/**
 * Check if Qdrant is being used
 */
export function isUsingQdrant() {
  return useQdrant;
}

/**
 * Generate embedding for text
 */
export async function generateEmbedding(text) {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Embedding generation failed');
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Create text representation for a package (for embedding)
 */
export function packageToText(pkg) {
  const parts = [
    pkg.display_name || pkg.displayName,
    pkg.description,
    ...(JSON.parse(pkg.keywords || '[]')),
    ...(JSON.parse(pkg.capabilities || '[]')),
  ];
  return parts.filter(Boolean).join(' ');
}

/**
 * Initialize embeddings (Qdrant + SQLite fallback)
 */
export async function initEmbeddings(db) {
  // Always create SQLite table as fallback
  db.exec(`
    CREATE TABLE IF NOT EXISTS package_embeddings (
      package_id INTEGER PRIMARY KEY REFERENCES packages(id),
      embedding BLOB NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Try to connect to Qdrant
  if (await isQdrantAvailable()) {
    const initialized = await initCollection();
    if (initialized) {
      useQdrant = true;
      const info = await getCollectionInfo();
      console.log(`✅ Qdrant connected (${info.pointsCount} vectors indexed)`);
      return;
    }
  }
  
  console.log('⚠️  Qdrant unavailable - using SQLite fallback');
}

// Alias for backward compatibility
export function initEmbeddingsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS package_embeddings (
      package_id INTEGER PRIMARY KEY REFERENCES packages(id),
      embedding BLOB NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * Store embedding for a package (Qdrant + SQLite)
 */
export async function storeEmbedding(db, packageId, embedding, packageData = {}) {
  const embeddingBlob = Buffer.from(new Float32Array(embedding).buffer);
  
  // Always store in SQLite (backup)
  db.prepare(`
    INSERT INTO package_embeddings (package_id, embedding, model)
    VALUES (?, ?, ?)
    ON CONFLICT(package_id) DO UPDATE SET
      embedding = excluded.embedding,
      model = excluded.model,
      updated_at = CURRENT_TIMESTAMP
  `).run(packageId, embeddingBlob, EMBEDDING_MODEL);

  // Also store in Qdrant if available
  if (useQdrant) {
    try {
      await upsertVector(packageId, embedding, {
        slug: packageData.slug,
        displayName: packageData.display_name || packageData.displayName,
        description: packageData.description,
        keywords: JSON.parse(packageData.keywords || '[]'),
        capabilities: JSON.parse(packageData.capabilities || '[]'),
        compatible: JSON.parse(packageData.compatible || '[]'),
        owner: packageData.owner_handle,
        version: packageData.latest_version,
        stars: packageData.stars_count || 0,
        downloads: packageData.downloads_count || 0,
      });
    } catch (e) {
      console.error('Qdrant upsert error:', e.message);
    }
  }
}

/**
 * Get embedding for a package
 */
export function getEmbedding(db, packageId) {
  const row = db.prepare('SELECT embedding FROM package_embeddings WHERE package_id = ?').get(packageId);
  if (!row) return null;
  
  return Array.from(new Float32Array(row.embedding.buffer));
}

/**
 * Generate and store embeddings for all packages
 */
export async function generateAllEmbeddings(db) {
  if (!isEmbeddingsEnabled()) {
    console.log('⚠️  OpenAI API key not set - skipping embeddings');
    return;
  }

  const packages = db.prepare('SELECT * FROM packages').all();
  console.log(`🔄 Generating embeddings for ${packages.length} packages...`);

  for (const pkg of packages) {
    try {
      const text = packageToText(pkg);
      const embedding = await generateEmbedding(text);
      await storeEmbedding(db, pkg.id, embedding, pkg);
      console.log(`  ✅ ${pkg.slug}`);
    } catch (error) {
      console.error(`  ❌ ${pkg.slug}: ${error.message}`);
    }
  }

  if (useQdrant) {
    const info = await getCollectionInfo();
    console.log(`✅ Indexed ${info.pointsCount} vectors in Qdrant`);
  }
  console.log('✅ Embeddings generated');
}

/**
 * Semantic search using Qdrant or SQLite fallback
 */
export async function semanticSearch(db, query, limit = 10, filters = {}) {
  if (!isEmbeddingsEnabled()) {
    return null;
  }

  try {
    const startTime = Date.now();
    const queryEmbedding = await generateEmbedding(query);

    // Use Qdrant if available
    if (useQdrant) {
      const filter = createFilter(filters);
      const results = await searchVectors(queryEmbedding, limit, filter);
      
      return results.map(r => ({
        package: {
          id: r.id,
          slug: r.slug,
          displayName: r.displayName,
          description: r.description,
          keywords: r.keywords || [],
          capabilities: r.capabilities || [],
          compatible: r.compatible || [],
          owner: { handle: r.owner },
          version: r.version,
          stats: { stars: r.stars || 0, downloads: r.downloads || 0 },
        },
        score: r.score,
        searchTime: Date.now() - startTime,
        engine: 'qdrant',
      }));
    }

    // Fallback: SQLite + in-memory cosine
    const rows = db.prepare(`
      SELECT p.*, pe.embedding
      FROM packages p
      JOIN package_embeddings pe ON p.id = pe.package_id
    `).all();

    const results = rows.map(row => {
      const embedding = Array.from(new Float32Array(row.embedding.buffer));
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      
      return {
        package: {
          id: row.id,
          slug: row.slug,
          displayName: row.display_name,
          description: row.description,
          keywords: JSON.parse(row.keywords || '[]'),
          capabilities: JSON.parse(row.capabilities || '[]'),
          compatible: JSON.parse(row.compatible || '[]'),
          owner: {
            handle: row.owner_handle,
            avatarUrl: row.owner_avatar,
          },
          version: row.latest_version,
          stats: {
            stars: row.stars_count || 0,
            downloads: row.downloads_count || 0,
          },
        },
        score: similarity,
        searchTime: Date.now() - startTime,
        engine: 'sqlite',
      };
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit).filter(r => r.score > 0.3);
  } catch (error) {
    console.error('Semantic search error:', error);
    return null;
  }
}

/**
 * Search handler middleware
 */
export function createSearchHandler(db) {
  return async (req, res) => {
    const { q: query, capabilities, compatible, limit = 10 } = req.query;

    if (!query) {
      return res.status(400).json({
        error: { code: 'MISSING_QUERY', message: 'Search query required' },
      });
    }

    const startTime = Date.now();

    // Try semantic search first
    let results = await semanticSearch(db, query, parseInt(limit), { capabilities, compatible });

    if (!results) {
      // Fallback to basic LIKE search
      const searchTerm = `%${query}%`;
      const packages = db.prepare(`
        SELECT * FROM packages
        WHERE display_name LIKE ? 
           OR description LIKE ?
           OR slug LIKE ?
           OR keywords LIKE ?
        ORDER BY stars_count DESC
        LIMIT ?
      `).all(searchTerm, searchTerm, searchTerm, searchTerm, parseInt(limit));

      results = packages.map((pkg, index) => ({
        package: {
          id: pkg.id,
          slug: pkg.slug,
          displayName: pkg.display_name,
          description: pkg.description,
          keywords: JSON.parse(pkg.keywords || '[]'),
          capabilities: JSON.parse(pkg.capabilities || '[]'),
          compatible: JSON.parse(pkg.compatible || '[]'),
          owner: { handle: pkg.owner_handle, avatarUrl: pkg.owner_avatar },
          version: pkg.latest_version,
          stats: { stars: pkg.stars_count || 0, downloads: pkg.downloads_count || 0 },
        },
        score: 1 - (index * 0.1),
        engine: 'basic',
      }));
    }

    // Enrich results with fresh data from database (Qdrant payload may be stale)
    results = results.map(r => {
      const fresh = db.prepare('SELECT * FROM packages WHERE slug = ?').get(r.package.slug);
      if (fresh) {
        r.package.displayName = fresh.display_name;
        r.package.description = fresh.description;
        r.package.keywords = JSON.parse(fresh.keywords || '[]');
        r.package.capabilities = JSON.parse(fresh.capabilities || '[]');
        r.package.compatible = JSON.parse(fresh.compatible || '[]');
        r.package.stats = { stars: fresh.stars_count || 0, downloads: fresh.downloads_count || 0 };
        r.package.version = fresh.latest_version;
        r.package.owner = { handle: fresh.owner_handle, avatarUrl: fresh.owner_avatar };
      }
      return r;
    });

    // Apply additional filters
    if (capabilities && !useQdrant) {
      const caps = capabilities.split(',').map(c => c.trim().toLowerCase());
      results = results.filter(r => 
        r.package.capabilities.some(c => caps.includes(c.toLowerCase()))
      );
    }

    if (compatible && !useQdrant) {
      results = results.filter(r => 
        r.package.compatible.some(c => c.toLowerCase() === compatible.toLowerCase())
      );
    }

    const searchTime = Date.now() - startTime;

    res.json({
      results: results.map(r => ({ ...r.package, score: r.score })),
      query,
      searchTime,
      semantic: isEmbeddingsEnabled(),
      engine: results[0]?.engine || 'basic',
      qdrant: useQdrant,
    });
  };
}
