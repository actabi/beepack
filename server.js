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

  CREATE INDEX IF NOT EXISTS idx_packages_slug ON packages(slug);
  CREATE INDEX IF NOT EXISTS idx_packages_owner ON packages(owner_id);
  CREATE INDEX IF NOT EXISTS idx_packages_status ON packages(moderation_status);

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
    updatedAt: pkg.updated_at
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

    // Check package ownership or create new
    let pkg = db.prepare('SELECT * FROM packages WHERE slug = ?').get(slug);
    
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
app.get('/api/v1/packages/:slug/download', authMiddleware, requireAuth, async (req, res) => {
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
app.get('/api/v1/packages/:slug/files', authMiddleware, requireAuth, (req, res) => {
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
app.get('/api/v1/packages/:slug/files/*', authMiddleware, requireAuth, (req, res) => {
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

// Redirect /packages/:slug to /package.html?slug=:slug
app.get('/packages/:slug', (req, res) => {
  res.redirect(301, `/package.html?slug=${req.params.slug}`);
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
