/**
 * Beepack API Server
 * Express server with SQLite, GitHub OAuth, and Semantic Search
 */

import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { setupAuthRoutes, authMiddleware, requireAuth } from './auth.js';
import { initEmbeddings, initEmbeddingsTable, generateAllEmbeddings, createSearchHandler, isEmbeddingsEnabled, isUsingQdrant, generateEmbedding, storeEmbedding, packageToText } from './embeddings.js';
import { storePackageFiles, getPackageFilesMetadata, getFile, createPackageArchive, initStorage } from './storage.js';
import { setupRemoteMCP } from './mcp-remote.js';
import { setupClawHubCompat } from './clawhub-compat.js';

// Initialize storage
initStorage();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3011;

// Middleware
app.use(cors());
app.use(express.json());

// Multer for file uploads (50MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Serve static site
app.use(express.static(join(__dirname, 'site')));

// Initialize SQLite database
const dataDir = join(__dirname, 'data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir);
}

const db = new Database(join(dataDir, 'beepack.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    github_id TEXT UNIQUE,
    handle TEXT UNIQUE NOT NULL,
    name TEXT,
    email TEXT,
    avatar_url TEXT,
    bio TEXT,
    github_token TEXT,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    owner_id INTEGER REFERENCES users(id),
    owner_handle TEXT,
    owner_avatar TEXT,
    description TEXT,
    readme TEXT,
    repository_url TEXT,
    homepage_url TEXT,
    keywords TEXT, -- JSON array
    capabilities TEXT, -- JSON array
    compatible TEXT, -- JSON array
    requires TEXT, -- JSON object
    stars_count INTEGER DEFAULT 0,
    downloads_count INTEGER DEFAULT 0,
    version_count INTEGER DEFAULT 0,
    latest_version TEXT,
    moderation_status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS package_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER REFERENCES packages(id),
    version TEXT NOT NULL,
    changelog TEXT,
    files TEXT, -- JSON array of file metadata
    hive_yaml TEXT, -- Full HIVE.yaml content
    source_code TEXT, -- Main source code
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(package_id, version)
  );

  CREATE TABLE IF NOT EXISTS stars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER REFERENCES packages(id),
    user_id INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(package_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER REFERENCES packages(id),
    user_id INTEGER REFERENCES users(id),
    body TEXT NOT NULL,
    deleted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER REFERENCES packages(id),
    user_id INTEGER REFERENCES users(id),
    liked INTEGER NOT NULL CHECK(liked IN (0, 1)),
    reason TEXT,
    agent_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(package_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS package_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_package_id INTEGER REFERENCES packages(id),
    to_package_id INTEGER REFERENCES packages(id),
    reason TEXT,
    suggested_by INTEGER REFERENCES users(id),
    agent_name TEXT,
    votes INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_package_id, to_package_id)
  );

  CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER REFERENCES packages(id),
    author_id INTEGER REFERENCES users(id),
    author_handle TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    code_diff TEXT,
    status TEXT DEFAULT 'open' CHECK(status IN ('open', 'accepted', 'rejected')),
    review_comment TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_suggestions_package ON suggestions(package_id);
  CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);

  CREATE TABLE IF NOT EXISTS bundles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    use_case TEXT,
    owner_id INTEGER REFERENCES users(id),
    owner_handle TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bundle_packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bundle_id INTEGER REFERENCES bundles(id),
    package_id INTEGER REFERENCES packages(id),
    role TEXT,
    UNIQUE(bundle_id, package_id)
  );

  CREATE INDEX IF NOT EXISTS idx_packages_slug ON packages(slug);
  CREATE INDEX IF NOT EXISTS idx_packages_owner ON packages(owner_id);
  CREATE INDEX IF NOT EXISTS idx_packages_status ON packages(moderation_status);
  CREATE INDEX IF NOT EXISTS idx_package_links_from ON package_links(from_package_id);
  CREATE INDEX IF NOT EXISTS idx_package_links_to ON package_links(to_package_id);

`);

// Initialize embeddings table
initEmbeddingsTable(db);

// Initialize Qdrant (async, non-blocking)
initEmbeddings(db).catch(e => console.error('Embeddings init error:', e));

console.log('📦 Database initialized');

// No seed data - only real packages published via the API

// ============== AUTH ROUTES ==============
setupAuthRoutes(app, db);

// ============== REMOTE MCP SERVER ==============
setupRemoteMCP(app, PORT, db);

// ============== CLAWHUB COMPATIBILITY ==============
setupClawHubCompat(app, db);

// ============== API ROUTES ==============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    version: '0.2.0',
    features: {
      auth: true,
      semanticSearch: isEmbeddingsEnabled(),
      mcp: true,
    }
  });
});

// List packages
app.get('/api/v1/packages', (req, res) => {
  const { page = 1, limit = 20, sort = 'stars' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  
  const sortColumn = {
    'stars': 'stars_count DESC',
    'downloads': 'downloads_count DESC',
    'updated': 'updated_at DESC',
    'name': 'display_name ASC'
  }[sort] || 'stars_count DESC';
  
  const packages = db.prepare(`
    SELECT *
    FROM packages
    WHERE moderation_status = 'active'
    ORDER BY ${sortColumn}
    LIMIT ? OFFSET ?
  `).all(parseInt(limit), offset);
  
  const total = db.prepare(`
    SELECT COUNT(*) as count FROM packages WHERE moderation_status = 'active'
  `).get();
  
  res.json({
    packages: packages.map(p => ({
      slug: p.slug,
      displayName: p.display_name,
      description: p.description,
      owner: {
        handle: p.owner_handle || 'unknown',
        avatarUrl: p.owner_avatar
      },
      version: p.latest_version,
      stats: {
        stars: p.stars_count,
        downloads: p.downloads_count
      },
      keywords: JSON.parse(p.keywords || '[]'),
      capabilities: JSON.parse(p.capabilities || '[]'),
      compatible: JSON.parse(p.compatible || '[]'),
      updatedAt: p.updated_at
    })),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: total.count
    }
  });
});

// Get single package
app.get('/api/v1/packages/:slug', (req, res) => {
  const { slug } = req.params;
  
  const pkg = db.prepare(`
    SELECT *
    FROM packages
    WHERE slug = ? AND moderation_status = 'active'
  `).get(slug);
  
  if (!pkg) {
    return res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Package '${slug}' not found`,
        status: 404
      }
    });
  }
  
  // Get versions
  const versions = db.prepare(`
    SELECT version, changelog, created_at
    FROM package_versions
    WHERE package_id = ?
    ORDER BY created_at DESC
  `).all(pkg.id);
  
  // Increment download count (simple analytics)
  db.prepare('UPDATE packages SET downloads_count = downloads_count + 1 WHERE id = ?').run(pkg.id);
  
  res.json({
    slug: pkg.slug,
    displayName: pkg.display_name,
    description: pkg.description,
    readme: pkg.readme,
    owner: {
      handle: pkg.owner_handle || 'unknown',
      avatarUrl: pkg.owner_avatar
    },
    latestVersion: pkg.latest_version,
    versions: versions.map(v => v.version),
    stats: {
      stars: pkg.stars_count,
      downloads: pkg.downloads_count,
      versions: pkg.version_count
    },
    keywords: JSON.parse(pkg.keywords || '[]'),
    capabilities: JSON.parse(pkg.capabilities || '[]'),
    compatible: JSON.parse(pkg.compatible || '[]'),
    requires: JSON.parse(pkg.requires || '{}'),
    repositoryUrl: pkg.repository_url,
    homepageUrl: pkg.homepage_url,
    createdAt: pkg.created_at,
    updatedAt: pkg.updated_at,
    openSuggestions: (() => {
      try {
        return db.prepare(
          'SELECT id, title, description, author_handle as author, created_at as createdAt FROM suggestions WHERE package_id = ? AND status = ? ORDER BY created_at DESC LIMIT 5'
        ).all(pkg.id, 'open');
      } catch (e) { return []; }
    })(),
    bundles: (() => {
      try {
        return db.prepare(`
          SELECT b.slug, b.display_name as displayName, b.description, bp.role
          FROM bundle_packages bp
          JOIN bundles b ON b.id = bp.bundle_id
          WHERE bp.package_id = ?
        `).all(pkg.id);
      } catch (e) { return []; }
    })()
  });
});

// Search packages (with semantic search support)
app.get('/api/v1/search', createSearchHandler(db));

// Get stats
app.get('/api/v1/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as totalPackages,
      COALESCE(SUM(stars_count), 0) as totalStars,
      COALESCE(SUM(downloads_count), 0) as totalDownloads
    FROM packages
    WHERE moderation_status = 'active'
  `).get();
  
  const users = db.prepare('SELECT COUNT(*) as count FROM users').get();
  
  res.json({
    totalPackages: stats.totalPackages,
    totalStars: stats.totalStars,
    totalDownloads: stats.totalDownloads,
    totalUsers: users.count
  });
});

// ============== AUTHENTICATED ROUTES ==============

// Star a package
app.post('/api/v1/packages/:slug/star', authMiddleware, requireAuth, (req, res) => {
  const { slug } = req.params;
  
  const pkg = db.prepare('SELECT id FROM packages WHERE slug = ?').get(slug);
  if (!pkg) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Package not found' } });
  }
  
  try {
    db.prepare('INSERT INTO stars (package_id, user_id) VALUES (?, ?)').run(pkg.id, req.user.id);
    db.prepare('UPDATE packages SET stars_count = stars_count + 1 WHERE id = ?').run(pkg.id);
    res.json({ success: true, starred: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      res.json({ success: true, starred: true, message: 'Already starred' });
    } else {
      throw e;
    }
  }
});

// Unstar a package
app.delete('/api/v1/packages/:slug/star', authMiddleware, requireAuth, (req, res) => {
  const { slug } = req.params;
  
  const pkg = db.prepare('SELECT id FROM packages WHERE slug = ?').get(slug);
  if (!pkg) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Package not found' } });
  }
  
  const result = db.prepare('DELETE FROM stars WHERE package_id = ? AND user_id = ?').run(pkg.id, req.user.id);
  if (result.changes > 0) {
    db.prepare('UPDATE packages SET stars_count = MAX(0, stars_count - 1) WHERE id = ?').run(pkg.id);
  }
  
  res.json({ success: true, starred: false });
});

// Like/Dislike a package (AI feedback)
app.post('/api/v1/packages/:slug/feedback', authMiddleware, requireAuth, (req, res) => {
  const { slug } = req.params;
  const { liked, reason, agentName } = req.body;
  
  // Validate
  if (typeof liked !== 'boolean') {
    return res.status(400).json({ 
      error: { code: 'VALIDATION_ERROR', message: 'liked must be true or false' } 
    });
  }
  
  // Dislike requires a reason
  if (!liked && (!reason || reason.trim().length < 5)) {
    return res.status(400).json({ 
      error: { code: 'VALIDATION_ERROR', message: 'Please provide a reason for disliking (min 5 chars)' } 
    });
  }
  
  const pkg = db.prepare('SELECT id FROM packages WHERE slug = ?').get(slug);
  if (!pkg) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Package not found' } });
  }
  
  // Upsert feedback (one per user per package)
  db.prepare(`
    INSERT INTO ratings (package_id, user_id, liked, reason, agent_name)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(package_id, user_id) DO UPDATE SET
      liked = excluded.liked,
      reason = excluded.reason,
      agent_name = excluded.agent_name,
      created_at = CURRENT_TIMESTAMP
  `).run(pkg.id, req.user.id, liked ? 1 : 0, liked ? null : reason, agentName || null);
  
  res.json({ success: true, liked, reason: liked ? null : reason, agentName });
});

// Get feedback for a package (public)
app.get('/api/v1/packages/:slug/feedback', (req, res) => {
  const { slug } = req.params;
  
  const pkg = db.prepare('SELECT id FROM packages WHERE slug = ?').get(slug);
  if (!pkg) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Package not found' } });
  }
  
  const feedback = db.prepare(`
    SELECT r.liked, r.reason, r.agent_name as agentName, r.created_at as createdAt,
           u.github_handle as userHandle, u.avatar_url as userAvatar
    FROM ratings r
    JOIN users u ON r.user_id = u.id
    WHERE r.package_id = ?
    ORDER BY r.created_at DESC
  `).all(pkg.id);
  
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN liked = 1 THEN 1 ELSE 0 END) as likes,
      SUM(CASE WHEN liked = 0 THEN 1 ELSE 0 END) as dislikes
    FROM ratings WHERE package_id = ?
  `).get(pkg.id);
  
  res.json({
    feedback: feedback.map(f => ({ ...f, liked: !!f.liked })),
    stats: {
      total: stats.total,
      likes: stats.likes,
      dislikes: stats.dislikes,
      likeRatio: stats.total > 0 ? Math.round((stats.likes / stats.total) * 100) : null
    }
  });
});


// Publish a package (create or update)
app.post('/api/v1/packages', authMiddleware, requireAuth, (req, res) => {
  const { slug, displayName, description, keywords, capabilities, compatible, requires, version, readme, sourceCode, hiveYaml } = req.body;
  
  // Validate required fields
  if (!slug || !displayName || !version) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'slug, displayName, and version are required',
      },
    });
  }
  
  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Slug must be lowercase alphanumeric with hyphens only',
      },
    });
  }
  
  // Check if package exists
  const existing = db.prepare('SELECT * FROM packages WHERE slug = ?').get(slug);
  
  if (existing) {
    // Check ownership
    if (existing.owner_id !== req.user.id) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: 'You do not own this package',
        },
      });
    }
    
    // Update package
    db.prepare(`
      UPDATE packages SET
        display_name = ?,
        description = ?,
        readme = ?,
        keywords = ?,
        capabilities = ?,
        compatible = ?,
        requires = ?,
        latest_version = ?,
        version_count = version_count + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      displayName,
      description || '',
      readme || '',
      JSON.stringify(keywords || []),
      JSON.stringify(capabilities || []),
      JSON.stringify(compatible || []),
      JSON.stringify(requires || {}),
      version,
      existing.id
    );
    
    // Add version
    db.prepare(`
      INSERT INTO package_versions (package_id, version, hive_yaml, source_code, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(existing.id, version, hiveYaml || '', sourceCode || '', req.user.id);
    
    res.json({ success: true, action: 'updated', slug });
  } else {
    // Create new package
    const result = db.prepare(`
      INSERT INTO packages (slug, display_name, owner_id, owner_handle, owner_avatar, description, readme, keywords, capabilities, compatible, requires, latest_version, version_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      slug,
      displayName,
      req.user.id,
      req.user.login,
      req.user.avatarUrl,
      description || '',
      readme || '',
      JSON.stringify(keywords || []),
      JSON.stringify(capabilities || []),
      JSON.stringify(compatible || []),
      JSON.stringify(requires || {}),
      version
    );
    
    // Add version
    db.prepare(`
      INSERT INTO package_versions (package_id, version, hive_yaml, source_code, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(result.lastInsertRowid, version, hiveYaml || '', sourceCode || '', req.user.id);
    
    res.json({ success: true, action: 'created', slug });
  }
});

// ============== FILE UPLOAD/DOWNLOAD ROUTES ==============

// Upload package files (multipart)
app.post('/api/v1/packages/:slug/upload', authMiddleware, requireAuth, upload.array('files', 100), async (req, res) => {
  try {
    const { slug } = req.params;
    const { version, changelog } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({
        error: { code: 'NO_FILES', message: 'No files uploaded' },
      });
    }

    if (!version) {
      return res.status(400).json({
        error: { code: 'MISSING_VERSION', message: 'Version is required' },
      });
    }

    // Check for HIVE.yaml
    const hiveFile = files.find(f => f.originalname === 'HIVE.yaml' || f.originalname === 'hive.yaml');
    if (!hiveFile) {
      return res.status(400).json({
        error: { code: 'MISSING_HIVE', message: 'HIVE.yaml is required' },
      });
    }

    // Parse HIVE.yaml
    let hiveContent;
    try {
      const yaml = await import('yaml');
      hiveContent = yaml.parse(hiveFile.buffer.toString('utf8'));
    } catch (e) {
      return res.status(400).json({
        error: { code: 'INVALID_HIVE', message: `Invalid HIVE.yaml: ${e.message}` },
      });
    }

    // Validate required fields
    if (!hiveContent.name || !hiveContent.description) {
      return res.status(400).json({
        error: { code: 'INVALID_HIVE', message: 'HIVE.yaml must contain name and description' },
      });
    }

    // Validate displayName is explicit (not just the slug)
    const displayName = hiveContent.displayName || hiveContent.name;
    if (displayName === hiveContent.name && !displayName.includes(' ')) {
      return res.status(400).json({
        error: { code: 'INVALID_HIVE', message: 'HIVE.yaml must contain a displayName with a human-readable title (not just the slug). Example: "Qonto Banking SDK" instead of "qonto-sdk"' },
      });
    }

    // Validate content is in English
    const frenchWords = ['pour', 'avec', 'les', 'des', 'une', 'qui', 'dans', 'est', 'sont', 'peut', 'cette', 'votre', 'vous', 'nous', 'leur', 'aussi', 'mais', 'comme', 'donc', 'depuis'];
    const descWords = (hiveContent.description || '').toLowerCase().split(/\s+/);
    const frenchCount = descWords.filter(w => frenchWords.includes(w)).length;
    if (frenchCount >= 3) {
      return res.status(400).json({
        error: { code: 'INVALID_LANGUAGE', message: 'Description must be written in English. French was detected. See https://beepack.dev/llms.txt for publishing guidelines.' },
      });
    }

    // Check README language
    const readmeFileCheck = files.find(f => f.originalname.toLowerCase() === 'readme.md');
    if (readmeFileCheck) {
      const readmeText = readmeFileCheck.buffer.toString('utf8').toLowerCase();
      const readmeWords = readmeText.split(/\s+/);
      const readmeFrenchCount = readmeWords.filter(w => frenchWords.includes(w)).length;
      if (readmeFrenchCount >= 5) {
        return res.status(400).json({
          error: { code: 'INVALID_LANGUAGE', message: 'README.md must be written in English. French was detected. See https://beepack.dev/llms.txt for publishing guidelines.' },
        });
      }
    }

    // Check for similar existing packages (only for new packages)
    let pkg = db.prepare('SELECT * FROM packages WHERE slug = ?').get(slug);

    if (!pkg) {
      const descWords = (hiveContent.description || '').split(/\s+/).filter(w => w.length > 3);
      const searchTerm = '%' + descWords.slice(0, 3).join('%') + '%';
      const similar = db.prepare(`
        SELECT slug, display_name, description FROM packages
        WHERE (description LIKE ? OR display_name LIKE ?)
        AND slug != ?
        LIMIT 3
      `).all(searchTerm, searchTerm, slug);

      if (similar.length > 0) {
        return res.status(409).json({
          error: {
            code: 'SIMILAR_EXISTS',
            message: 'Similar packages already exist. Check them before publishing a duplicate.',
            similar: similar.map(s => ({ slug: s.slug, displayName: s.display_name, description: s.description })),
            hint: 'Option 1: Use the existing package instead. Option 2: Suggest an improvement via POST /api/v1/packages/{slug}/suggestions. Option 3: If genuinely different, change description to differentiate, then retry.'
          },
        });
      }
    }

    if (pkg) {
      if (pkg.owner_id !== req.user.id) {
        return res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'You do not own this package' },
        });
      }
    } else {
      // Create new package
      const result = db.prepare(`
        INSERT INTO packages (slug, display_name, owner_id, owner_handle, owner_avatar, description, keywords, capabilities, compatible, requires, latest_version, version_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        slug,
        hiveContent.displayName || hiveContent.name,
        req.user.id,
        req.user.login,
        req.user.avatarUrl,
        hiveContent.description || '',
        JSON.stringify(hiveContent.keywords || []),
        JSON.stringify(hiveContent.capabilities || []),
        JSON.stringify(hiveContent.compatible || []),
        JSON.stringify(hiveContent.requires || {}),
        version
      );
      pkg = { id: result.lastInsertRowid };
    }

    // Store files
    const { filesStored, totalSize } = storePackageFiles(db, pkg.id, slug, version, files);

    // Update package metadata
    const readmeFile = files.find(f => f.originalname.toLowerCase() === 'readme.md');
    const readme = readmeFile ? readmeFile.buffer.toString('utf8') : '';

    db.prepare(`
      UPDATE packages SET
        display_name = ?,
        description = ?,
        readme = ?,
        keywords = ?,
        capabilities = ?,
        compatible = ?,
        requires = ?,
        latest_version = ?,
        version_count = version_count + 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      hiveContent.displayName || hiveContent.name,
      hiveContent.description || '',
      readme,
      JSON.stringify(hiveContent.keywords || []),
      JSON.stringify(hiveContent.capabilities || []),
      JSON.stringify(hiveContent.compatible || []),
      JSON.stringify(hiveContent.requires || {}),
      version,
      pkg.id
    );

    // Add version record
    db.prepare(`
      INSERT INTO package_versions (package_id, version, changelog, hive_yaml, created_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(package_id, version) DO UPDATE SET
        changelog = excluded.changelog,
        hive_yaml = excluded.hive_yaml
    `).run(pkg.id, version, changelog || '', hiveFile.buffer.toString('utf8'), req.user.id);

    // Auto-generate embedding for semantic search (non-blocking)
    if (isEmbeddingsEnabled()) {
      const pkgData = db.prepare('SELECT * FROM packages WHERE id = ?').get(pkg.id);
      (async () => {
        try {
          const text = packageToText(pkgData);
          const embedding = await generateEmbedding(text);
          await storeEmbedding(db, pkg.id, embedding, pkgData);
          console.log(`✅ Indexed ${slug} in vector DB`);
        } catch (e) {
          console.error(`⚠️ Embedding failed for ${slug}:`, e.message);
        }
      })();
    }

    res.json({
      success: true,
      slug,
      version,
      filesStored,
      totalSize,
    });
  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({
      error: { code: 'UPLOAD_ERROR', message: e.message },
    });
  }
});

// Download package as tar.gz
app.get('/api/v1/packages/:slug/download', async (req, res) => {
  try {
    const { slug } = req.params;
    const { version } = req.query;

    const pkg = db.prepare('SELECT * FROM packages WHERE slug = ?').get(slug);
    if (!pkg) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Package not found' },
      });
    }

    const targetVersion = version || pkg.latest_version;
    
    // Get files metadata
    const files = getPackageFilesMetadata(db, pkg.id, targetVersion);
    if (files.length === 0) {
      return res.status(404).json({
        error: { code: 'NO_FILES', message: `No files for version ${targetVersion}` },
      });
    }

    // Create archive
    const archive = await createPackageArchive(slug, targetVersion);

    // Increment download count
    db.prepare('UPDATE packages SET downloads_count = downloads_count + 1 WHERE id = ?').run(pkg.id);

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}-${targetVersion}.tar.gz"`);
    res.send(archive);
  } catch (e) {
    console.error('Download error:', e);
    res.status(500).json({
      error: { code: 'DOWNLOAD_ERROR', message: e.message },
    });
  }
});

// List package files
app.get('/api/v1/packages/:slug/files', (req, res) => {
  const { slug } = req.params;
  const { version } = req.query;

  const pkg = db.prepare('SELECT * FROM packages WHERE slug = ?').get(slug);
  if (!pkg) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Package not found' },
    });
  }

  const targetVersion = version || pkg.latest_version;
  const files = getPackageFilesMetadata(db, pkg.id, targetVersion);

  res.json({
    slug,
    version: targetVersion,
    files: files.map(f => ({
      path: f.file_path,
      size: f.size_bytes,
      sha256: f.sha256,
      mimeType: f.mime_type,
    })),
  });
});

// Get single file content
app.get('/api/v1/packages/:slug/files/*', (req, res) => {
  const { slug } = req.params;
  const filePath = req.params[0];
  const { version } = req.query;

  const pkg = db.prepare('SELECT * FROM packages WHERE slug = ?').get(slug);
  if (!pkg) {
    return res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Package not found' },
    });
  }

  const targetVersion = version || pkg.latest_version;
  
  const file = db.prepare(`
    SELECT * FROM package_files 
    WHERE package_id = ? AND version = ? AND file_path = ?
  `).get(pkg.id, targetVersion, filePath);

  if (!file) {
    return res.status(404).json({
      error: { code: 'FILE_NOT_FOUND', message: `File '${filePath}' not found` },
    });
  }

  const content = getFile(file.storage_path);
  if (!content) {
    return res.status(404).json({
      error: { code: 'FILE_MISSING', message: 'File not found in storage' },
    });
  }

  res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
  res.send(content);
});

// ============== SUGGESTIONS (Package Contributions) ==============

// List suggestions for a package
app.get('/api/v1/packages/:slug/suggestions', (req, res) => {
  const pkg = db.prepare('SELECT id FROM packages WHERE slug = ?').get(req.params.slug);
  if (!pkg) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Package not found' } });

  const suggestions = db.prepare(
    'SELECT * FROM suggestions WHERE package_id = ? ORDER BY created_at DESC'
  ).all(pkg.id);

  res.json({
    suggestions: suggestions.map(s => ({
      id: s.id,
      title: s.title,
      description: s.description,
      codeDiff: s.code_diff,
      status: s.status,
      author: s.author_handle,
      reviewComment: s.review_comment,
      createdAt: s.created_at,
    })),
  });
});

// Submit a suggestion for a package
app.post('/api/v1/packages/:slug/suggestions', authMiddleware, requireAuth, (req, res) => {
  const { title, description, codeDiff } = req.body;

  if (!title || !description) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'title and description are required' },
    });
  }

  const pkg = db.prepare('SELECT * FROM packages WHERE slug = ?').get(req.params.slug);
  if (!pkg) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Package not found' } });

  // Can't suggest on your own package
  if (pkg.owner_id === req.user.id) {
    return res.status(400).json({
      error: { code: 'OWN_PACKAGE', message: 'You own this package. Edit it directly with beepack publish.' },
    });
  }

  const result = db.prepare(
    'INSERT INTO suggestions (package_id, author_id, author_handle, title, description, code_diff) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(pkg.id, req.user.id, req.user.login, title, description, codeDiff || null);

  res.json({ success: true, id: result.lastInsertRowid, message: 'Suggestion submitted. The package owner will review it.' });
});

// Review a suggestion (accept/reject) - only package owner
app.patch('/api/v1/suggestions/:id', authMiddleware, requireAuth, (req, res) => {
  const { status, comment } = req.body;

  if (!['accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Status must be "accepted" or "rejected"' } });
  }

  const suggestion = db.prepare('SELECT s.*, p.owner_id FROM suggestions s JOIN packages p ON p.id = s.package_id WHERE s.id = ?').get(req.params.id);
  if (!suggestion) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Suggestion not found' } });

  if (suggestion.owner_id !== req.user.id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the package owner can review suggestions' } });
  }

  db.prepare('UPDATE suggestions SET status = ?, review_comment = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, comment || null, req.params.id);

  res.json({ success: true, status, message: status === 'accepted' ? 'Suggestion accepted. Apply the changes in your next publish.' : 'Suggestion rejected.' });
});

// ============== BUNDLES ==============

// List bundles
app.get('/api/v1/bundles', (req, res) => {
  const bundles = db.prepare('SELECT * FROM bundles ORDER BY created_at DESC').all();

  res.json({
    bundles: bundles.map(b => {
      const packages = db.prepare(`
        SELECT p.slug, p.display_name as displayName, p.description, bp.role
        FROM bundle_packages bp
        JOIN packages p ON p.id = bp.package_id
        WHERE bp.bundle_id = ?
      `).all(b.id);

      return {
        slug: b.slug,
        displayName: b.display_name,
        description: b.description,
        useCase: b.use_case,
        owner: b.owner_handle,
        packages,
        packageCount: packages.length,
        createdAt: b.created_at,
      };
    }),
  });
});

// Get single bundle
app.get('/api/v1/bundles/:slug', (req, res) => {
  const bundle = db.prepare('SELECT * FROM bundles WHERE slug = ?').get(req.params.slug);
  if (!bundle) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Bundle not found' } });
  }

  const packages = db.prepare(`
    SELECT p.slug, p.display_name as displayName, p.description, p.keywords, p.capabilities, p.requires,
           p.stars_count, p.downloads_count, p.latest_version, p.owner_handle, bp.role
    FROM bundle_packages bp
    JOIN packages p ON p.id = bp.package_id
    WHERE bp.bundle_id = ?
  `).all(bundle.id);

  res.json({
    slug: bundle.slug,
    displayName: bundle.display_name,
    description: bundle.description,
    useCase: bundle.use_case,
    owner: bundle.owner_handle,
    packages: packages.map(p => ({
      slug: p.slug,
      displayName: p.displayName,
      description: p.description,
      role: p.role,
      version: p.latest_version,
      stats: { stars: p.stars_count, downloads: p.downloads_count },
      capabilities: JSON.parse(p.capabilities || '[]'),
      requires: JSON.parse(p.requires || '{}'),
    })),
    createdAt: bundle.created_at,
  });
});

// Create bundle (auth required)
app.post('/api/v1/bundles', authMiddleware, requireAuth, (req, res) => {
  const { slug, displayName, description, useCase, packages } = req.body;

  if (!slug || !displayName || !packages || packages.length < 2) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Bundle requires slug, displayName, and at least 2 packages' },
    });
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Slug must be lowercase alphanumeric with hyphens' },
    });
  }

  // Verify all packages exist
  const pkgIds = [];
  for (const p of packages) {
    const pkgSlug = typeof p === 'string' ? p : p.slug;
    const pkg = db.prepare('SELECT id FROM packages WHERE slug = ?').get(pkgSlug);
    if (!pkg) {
      return res.status(400).json({
        error: { code: 'PACKAGE_NOT_FOUND', message: 'Package "' + pkgSlug + '" not found' },
      });
    }
    pkgIds.push({ id: pkg.id, role: typeof p === 'object' ? p.role : null });
  }

  try {
    const result = db.prepare(
      'INSERT INTO bundles (slug, display_name, description, use_case, owner_id, owner_handle) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(slug, displayName, description || '', useCase || '', req.user.id, req.user.login);

    const insertBp = db.prepare('INSERT INTO bundle_packages (bundle_id, package_id, role) VALUES (?, ?, ?)');
    for (const p of pkgIds) {
      insertBp.run(result.lastInsertRowid, p.id, p.role);
    }

    res.json({ success: true, slug, packageCount: pkgIds.length });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: { code: 'ALREADY_EXISTS', message: 'Bundle "' + slug + '" already exists' } });
    }
    throw e;
  }
});

// Get linked packages
app.get('/api/v1/packages/:slug/links', (req, res) => {
  const pkg = db.prepare('SELECT id FROM packages WHERE slug = ?').get(req.params.slug);
  if (!pkg) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Package not found' } });

  const links = db.prepare(`
    SELECT p.slug, p.display_name as displayName, pl.reason
    FROM package_links pl
    JOIN packages p ON (p.id = CASE WHEN pl.from_package_id = ? THEN pl.to_package_id ELSE pl.from_package_id END)
    WHERE pl.from_package_id = ? OR pl.to_package_id = ?
  `).all(pkg.id, pkg.id, pkg.id);

  res.json({ links });
});

// Redirect /packages/:slug and /bundles/:slug
app.get('/packages/:slug', (req, res) => {
  res.redirect(301, `/package.html?slug=${req.params.slug}`);
});
app.get('/bundles/:slug', (req, res) => {
  res.redirect(301, `/bundle.html?slug=${req.params.slug}`);
});

// Catch-all for SPA (serve index.html for non-API routes)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/auth')) {
    res.sendFile(join(__dirname, 'site', 'index.html'));
  } else {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
        status: 404
      }
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`
🐝 Beepack Server running!
   
   Local:   http://localhost:${PORT}
   Network: http://0.0.0.0:${PORT}
   
   API:     http://localhost:${PORT}/api/v1/packages
   Site:    http://localhost:${PORT}
   Auth:    http://localhost:${PORT}/auth/github
   
   Features:
   - GitHub OAuth: ${process.env.GITHUB_CLIENT_ID ? '✅' : '⚠️  Set GITHUB_CLIENT_ID'}
   - Semantic Search: ${isEmbeddingsEnabled() ? '✅' : '⚠️  Set OPENAI_API_KEY'}
   - Vector DB: ${process.env.QDRANT_URL ? '✅ Qdrant' : '⚠️  SQLite fallback'}
   - MCP Server: ✅ (beepack mcp-server)
  `);
});
