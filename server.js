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
import { runStaticScan, runLLMEvaluation, runVirusTotalScan, buildModerationSnapshot, AUTO_HIDE_THRESHOLD, MAX_REPORTS_PER_USER } from './security-engine.js';

// Initialize storage
initStorage();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import rateLimit from 'express-rate-limit';

const app = express();
const PORT = process.env.PORT || 3011;

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting
const readLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 180, // 180 requests per minute for reads
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many requests. Try again in a minute.' } },
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 45, // 45 writes per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMIT', message: 'Too many write requests. Slow down.' } },
});

const publishLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 publishes per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'PUBLISH_LIMIT', message: 'Too many publishes. Max 10 per hour.' } },
});

// Apply rate limiters
app.use('/api/', readLimiter);
app.use((req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && req.path.startsWith('/api/')) {
    return writeLimiter(req, res, next);
  }
  next();
});

// Multer for file uploads (50MB total, 10MB per file)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 50 },
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

  CREATE TABLE IF NOT EXISTS security_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER REFERENCES packages(id),
    version TEXT,
    static_verdict TEXT,
    llm_verdict TEXT,
    vt_verdict TEXT,
    final_verdict TEXT,
    findings TEXT,
    scan_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER REFERENCES packages(id),
    reporter_id INTEGER REFERENCES users(id),
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'open' CHECK(status IN ('open', 'resolved', 'dismissed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(package_id, reporter_id)
  );

  CREATE INDEX IF NOT EXISTS idx_reports_package ON reports(package_id);
  CREATE INDEX IF NOT EXISTS idx_security_scans_package ON security_scans(package_id);

  -- Version-specific feedback from AIs
  CREATE TABLE IF NOT EXISTS version_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    package_id INTEGER REFERENCES packages(id),
    version TEXT NOT NULL,
    agent_name TEXT,
    agent_session TEXT,
    rating INTEGER CHECK(rating IN (-1, 0, 1)), -- -1 dislike, 0 neutral, 1 like
    worked INTEGER CHECK(worked IN (0, 1)), -- Did it work out of the box?
    edge_cases TEXT, -- JSON array of edge cases discovered
    adaptations TEXT, -- What did the AI have to change?
    comment TEXT, -- Free-form feedback
    use_case TEXT, -- What was it used for?
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_version_feedback_package ON version_feedback(package_id);
  CREATE INDEX IF NOT EXISTS idx_version_feedback_version ON version_feedback(package_id, version);

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

// Migration: add vt_verdict column if missing
try { db.exec('ALTER TABLE security_scans ADD COLUMN vt_verdict TEXT'); } catch (e) { /* column already exists */ }

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
  const { page = 1, limit = 20, sort = 'downloads' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const sortColumn = {
    'downloads': 'downloads_count DESC',
    'updated': 'updated_at DESC',
    'name': 'display_name ASC'
  }[sort] || 'downloads_count DESC';
  
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
        likes: db.prepare('SELECT COUNT(*) as c FROM ratings WHERE package_id = ? AND liked = 1').get(p.id).c,
        dislikes: db.prepare('SELECT COUNT(*) as c FROM ratings WHERE package_id = ? AND liked = 0').get(p.id).c,
        downloads: p.downloads_count
      },
      keywords: JSON.parse(p.keywords || '[]'),
      capabilities: JSON.parse(p.capabilities || '[]'),
      compatible: JSON.parse(p.compatible || '[]'),
      security: (() => {
        try {
          const scan = db.prepare('SELECT final_verdict FROM security_scans WHERE package_id = ? ORDER BY created_at DESC LIMIT 1').get(p.id);
          return scan ? scan.final_verdict : null;
        } catch (e) { return null; }
      })(),
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
      likes: db.prepare('SELECT COUNT(*) as c FROM ratings WHERE package_id = ? AND liked = 1').get(pkg.id).c,
      dislikes: db.prepare('SELECT COUNT(*) as c FROM ratings WHERE package_id = ? AND liked = 0').get(pkg.id).c,
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
    security: (() => {
      try {
        const scan = db.prepare('SELECT final_verdict, static_verdict, llm_verdict, created_at FROM security_scans WHERE package_id = ? ORDER BY created_at DESC LIMIT 1').get(pkg.id);
        return scan ? { verdict: scan.final_verdict, staticVerdict: scan.static_verdict, llmVerdict: scan.llm_verdict, scannedAt: scan.created_at } : null;
      } catch (e) { return null; }
    })(),
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
      COALESCE(SUM(downloads_count), 0) as totalDownloads
    FROM packages
    WHERE moderation_status = 'active'
  `).get();

  const totalLikes = db.prepare('SELECT COUNT(*) as c FROM ratings WHERE liked = 1').get().c;

  const users = db.prepare('SELECT COUNT(*) as count FROM users').get();

  res.json({
    totalPackages: stats.totalPackages,
    totalLikes: totalLikes,
    totalDownloads: stats.totalDownloads,
    totalUsers: users.count
  });
});

// ============== AUTHENTICATED ROUTES ==============

// Publish a package (create or update)
app.post('/api/v1/packages', authMiddleware, requireAuth, (req, res) => {
  const { slug, displayName, description, keywords, capabilities, compatible, requires, version, readme, sourceCode, hiveYaml, repository_url } = req.body;
  
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
        repository_url = COALESCE(?, repository_url),
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
      repository_url || null,
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
      INSERT INTO packages (slug, display_name, owner_id, owner_handle, owner_avatar, description, readme, keywords, capabilities, compatible, requires, latest_version, version_count, repository_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
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
      version,
      repository_url || null
    );
    
    // Add version
    db.prepare(`
      INSERT INTO package_versions (package_id, version, hive_yaml, source_code, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(result.lastInsertRowid, version, hiveYaml || '', sourceCode || '', req.user.id);
    
    res.json({ success: true, action: 'created', slug });
  }
});

// Update package metadata (partial)
app.patch('/api/v1/packages/:slug', authMiddleware, requireAuth, (req, res) => {
  const { slug } = req.params;
  const pkg = db.prepare('SELECT * FROM packages WHERE slug = ?').get(slug);
  if (!pkg) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Package '${slug}' not found` } });
  }
  if (pkg.owner_id !== req.user.id) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not own this package' } });
  }

  const allowed = ['displayName', 'description', 'repository_url', 'homepage_url', 'keywords', 'capabilities', 'compatible', 'requires'];
  const updates = [];
  const values = [];

  const fieldMap = {
    displayName: 'display_name',
    description: 'description',
    repository_url: 'repository_url',
    homepage_url: 'homepage_url',
    keywords: 'keywords',
    capabilities: 'capabilities',
    compatible: 'compatible',
    requires: 'requires',
  };

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      const col = fieldMap[key];
      const val = ['keywords', 'capabilities', 'compatible', 'requires'].includes(key)
        ? JSON.stringify(req.body[key])
        : req.body[key];
      updates.push(`${col} = ?`);
      values.push(val);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' } });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(pkg.id);

  db.prepare(`UPDATE packages SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ success: true, slug });
});

// ============== FILE UPLOAD/DOWNLOAD ROUTES ==============

// Upload package files (multipart)
app.post('/api/v1/packages/:slug/upload', publishLimiter, authMiddleware, requireAuth, upload.array('files', 50), async (req, res) => {
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

    // Verify GitHub account age (14 days minimum)
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (user && user.github_id && user.github_id !== 'demo') {
      try {
        const ghRes = await fetch(`https://api.github.com/user/${user.github_id}`, {
          headers: { 'User-Agent': 'Beepack/1.0' },
          signal: AbortSignal.timeout(5000),
        });
        if (ghRes.ok) {
          const ghUser = await ghRes.json();
          const accountAge = (Date.now() - new Date(ghUser.created_at).getTime()) / (1000 * 60 * 60 * 24);
          if (accountAge < 14) {
            return res.status(403).json({
              error: { code: 'ACCOUNT_TOO_NEW', message: `GitHub account must be at least 14 days old to publish. Your account is ${Math.floor(accountAge)} days old.` },
            });
          }
        }
      } catch (e) { /* GitHub API unavailable - allow publish */ }
    }

    // Check daily publish limit (20 per day, bypassed for admins)
    const userRole = db.prepare('SELECT role FROM users WHERE id = ?').get(req.user.id);
    if (!userRole || userRole.role !== 'admin') {
      const today = new Date().toISOString().split('T')[0];
      const publishCount = db.prepare(
        "SELECT COUNT(*) as count FROM package_versions WHERE created_by = ? AND created_at >= ?"
      ).get(req.user.id, today + ' 00:00:00');
      if (publishCount.count >= 20) {
        return res.status(429).json({
          error: { code: 'DAILY_LIMIT', message: 'You have reached the daily publish limit (20 per day). Try again tomorrow.' },
        });
      }
    }

    // Validate file sizes (10MB per file max)
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        return res.status(400).json({
          error: { code: 'FILE_TOO_LARGE', message: `File "${file.originalname}" exceeds 10MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)` },
        });
      }
    }

    // Only allow text files
    const allowedExtensions = ['js', 'ts', 'mjs', 'cjs', 'json', 'yaml', 'yml', 'md', 'txt', 'html', 'css', 'sh', 'py', 'toml', 'cfg', 'ini', 'env.example'];
    for (const file of files) {
      const ext = file.originalname.split('.').pop()?.toLowerCase();
      if (ext && !allowedExtensions.includes(ext) && file.originalname !== 'LICENSE') {
        return res.status(400).json({
          error: { code: 'INVALID_FILE_TYPE', message: `Only text files are allowed. "${file.originalname}" is not a supported file type.` },
        });
      }
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
        error: { code: 'INVALID_LANGUAGE', message: 'Description must be written in English. French was detected. See https://beepack.ai/llms.txt for publishing guidelines.' },
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
          error: { code: 'INVALID_LANGUAGE', message: 'README.md must be written in English. French was detected. See https://beepack.ai/llms.txt for publishing guidelines.' },
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
      const repositoryUrl = req.body.repository || hiveContent.repository || null;
      const result = db.prepare(`
        INSERT INTO packages (slug, display_name, owner_id, owner_handle, owner_avatar, description, keywords, capabilities, compatible, requires, repository_url, latest_version, version_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
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
        repositoryUrl,
        version
      );
      pkg = { id: result.lastInsertRowid };
    }

    // Store files
    const { filesStored, totalSize } = storePackageFiles(db, pkg.id, slug, version, files);

    // Update package metadata
    const readmeFile = files.find(f => f.originalname.toLowerCase() === 'readme.md');
    const readme = readmeFile ? readmeFile.buffer.toString('utf8') : '';

    const repoUrl = req.body.repository || hiveContent.repository || null;
    db.prepare(`
      UPDATE packages SET
        display_name = ?,
        description = ?,
        readme = ?,
        keywords = ?,
        capabilities = ?,
        compatible = ?,
        requires = ?,
        repository_url = COALESCE(?, repository_url),
        latest_version = ?,
        repository_url = COALESCE(?, repository_url),
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
      repoUrl,
      version,
      hiveContent.source?.url || null,
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

    // Security scan (blocking - reject malicious packages)
    const filesToScan = files.map(f => ({ name: f.originalname, content: f.buffer }));
    const staticScan = runStaticScan(filesToScan);

    if (staticScan.verdict === 'malicious') {
      // Hide the package immediately
      db.prepare('UPDATE packages SET moderation_status = ? WHERE id = ?').run('hidden', pkg.id);
      console.error(`🚨 MALICIOUS package blocked: ${slug} by ${req.user.login}`);

      return res.status(403).json({
        error: {
          code: 'SECURITY_BLOCKED',
          message: 'Package blocked: critical security issues detected.',
          findings: staticScan.findings.filter(f => f.severity === 'critical'),
        },
      });
    }

    // Store scan results
    db.prepare(
      'INSERT INTO security_scans (package_id, version, static_verdict, final_verdict, findings, scan_data) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(pkg.id, version, staticScan.verdict, staticScan.verdict, JSON.stringify(staticScan.findings), JSON.stringify(staticScan));

    // Async security evaluations (LLM + VirusTotal, non-blocking)
    const openaiKey = process.env.OPENAI_API_KEY;
    const vtApiKey = process.env.VIRUSTOTAL_API_KEY;
    if (openaiKey || vtApiKey) {
      (async () => {
        try {
          const pkgMeta = db.prepare('SELECT * FROM packages WHERE id = ?').get(pkg.id);

          // Run LLM and VirusTotal in parallel
          const [llmEval, vtScan] = await Promise.all([
            openaiKey ? runLLMEvaluation({
              slug: pkgMeta.slug,
              displayName: pkgMeta.display_name,
              description: pkgMeta.description,
              requires: JSON.parse(pkgMeta.requires || '{}'),
              keywords: JSON.parse(pkgMeta.keywords || '[]'),
              capabilities: JSON.parse(pkgMeta.capabilities || '[]'),
            }, filesToScan, openaiKey) : Promise.resolve(null),
            vtApiKey ? runVirusTotalScan(filesToScan, vtApiKey) : Promise.resolve(null),
          ]);

          const snapshot = buildModerationSnapshot(staticScan, llmEval, vtScan);

          // Update scan with all results
          db.prepare(
            'UPDATE security_scans SET llm_verdict = ?, vt_verdict = ?, final_verdict = ?, findings = ?, scan_data = ? WHERE package_id = ? AND version = ?'
          ).run(
            llmEval?.verdict || null,
            vtScan?.verdict || null,
            snapshot.verdict,
            JSON.stringify(snapshot.findings),
            JSON.stringify(snapshot),
            pkg.id, version
          );

          // Auto-hide if final verdict is malicious
          if (snapshot.verdict === 'malicious') {
            db.prepare('UPDATE packages SET moderation_status = ? WHERE id = ?').run('hidden', pkg.id);
            console.error(`🚨 Package hidden after async evaluation: ${slug}`);
          }

          console.log(`🔒 Security scan for ${slug}: static=${staticScan.verdict}, llm=${llmEval?.verdict || 'skipped'}, vt=${vtScan?.verdict || 'skipped'}, final=${snapshot.verdict}`);
        } catch (e) {
          console.error(`⚠️ Async security eval failed for ${slug}:`, e.message);
        }
      })();
    }

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
      security: {
        staticVerdict: staticScan.verdict,
        findings: staticScan.findings.length,
        criticalCount: staticScan.criticalCount,
      },
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

// Get single file content - DISABLED: use beepack pull to download packages
// This ensures downloads are tracked and code isn't scraped without attribution
app.get('/api/v1/packages/:slug/files/*', (req, res) => {
  res.status(403).json({
    error: { 
      code: 'USE_PULL', 
      message: 'Direct file access is disabled. Use `beepack pull <package>` to download the source code. This ensures proper download tracking and attribution.' 
    },
    hint: `Run: beepack pull ${req.params.slug}`,
  });
});

// ============== SECURITY & REPORTING ==============

// Get security scan results for a package
app.get('/api/v1/packages/:slug/security', (req, res) => {
  const pkg = db.prepare('SELECT id FROM packages WHERE slug = ?').get(req.params.slug);
  if (!pkg) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Package not found' } });

  const scan = db.prepare(
    'SELECT * FROM security_scans WHERE package_id = ? ORDER BY created_at DESC LIMIT 1'
  ).get(pkg.id);

  if (!scan) return res.json({ verdict: 'unscanned', message: 'No security scan available' });

  const scanData = JSON.parse(scan.scan_data || '{}');

  res.json({
    verdict: scan.final_verdict,
    staticVerdict: scan.static_verdict,
    llmVerdict: scan.llm_verdict,
    vtVerdict: scan.vt_verdict || null,
    vtScan: scanData.vtScan || null,
    findings: JSON.parse(scan.findings || '[]'),
    scannedAt: scan.created_at,
  });
});

// Report a package
app.post('/api/v1/packages/:slug/report', authMiddleware, requireAuth, (req, res) => {
  const { reason } = req.body;

  if (!reason || reason.length < 10) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Reason is required (min 10 characters)' } });
  }

  if (reason.length > 500) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Reason too long (max 500 characters)' } });
  }

  const pkg = db.prepare('SELECT * FROM packages WHERE slug = ?').get(req.params.slug);
  if (!pkg) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Package not found' } });

  // Can't report your own package
  if (pkg.owner_id === req.user.id) {
    return res.status(400).json({ error: { code: 'OWN_PACKAGE', message: 'You cannot report your own package' } });
  }

  // Check report cap
  const userReportCount = db.prepare(
    'SELECT COUNT(*) as count FROM reports WHERE reporter_id = ? AND status = ?'
  ).get(req.user.id, 'open');

  if (userReportCount.count >= MAX_REPORTS_PER_USER) {
    return res.status(429).json({ error: { code: 'REPORT_LIMIT', message: 'You have reached the maximum number of active reports' } });
  }

  try {
    db.prepare('INSERT INTO reports (package_id, reporter_id, reason) VALUES (?, ?, ?)').run(pkg.id, req.user.id, reason);

    // Check if auto-hide threshold reached
    const reportCount = db.prepare(
      'SELECT COUNT(*) as count FROM reports WHERE package_id = ? AND status = ?'
    ).get(pkg.id, 'open');

    if (reportCount.count >= AUTO_HIDE_THRESHOLD) {
      db.prepare('UPDATE packages SET moderation_status = ? WHERE id = ?').run('hidden', pkg.id);
      console.warn(`⚠️ Package auto-hidden: ${req.params.slug} (${reportCount.count} reports)`);
    }

    res.json({
      success: true,
      message: 'Report submitted. Thank you for helping keep Beepack safe.',
      totalReports: reportCount.count,
      autoHidden: reportCount.count >= AUTO_HIDE_THRESHOLD,
    });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.json({ success: true, message: 'You have already reported this package' });
    }
    throw e;
  }
});

// ============== VERSION FEEDBACK (AI Ratings & Comments) ==============

// Get feedback for a package (all versions)
app.get('/api/v1/packages/:slug/feedback', (req, res) => {
  const { version } = req.query;
  const pkg = db.prepare('SELECT id FROM packages WHERE slug = ?').get(req.params.slug);
  if (!pkg) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Package not found' } });

  let query = 'SELECT * FROM version_feedback WHERE package_id = ?';
  const params = [pkg.id];
  
  if (version) {
    query += ' AND version = ?';
    params.push(version);
  }
  
  query += ' ORDER BY created_at DESC LIMIT 100';
  
  const feedback = db.prepare(query).all(...params);

  // Compute stats
  const stats = db.prepare(`
    SELECT 
      version,
      COUNT(*) as total,
      SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as likes,
      SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END) as dislikes,
      SUM(CASE WHEN worked = 1 THEN 1 ELSE 0 END) as worked_count,
      SUM(CASE WHEN worked = 0 THEN 1 ELSE 0 END) as failed_count
    FROM version_feedback 
    WHERE package_id = ?
    GROUP BY version
  `).all(pkg.id);

  res.json({
    feedback: feedback.map(f => ({
      id: f.id,
      version: f.version,
      agentName: f.agent_name,
      rating: f.rating,
      worked: f.worked === 1,
      edgeCases: f.edge_cases ? JSON.parse(f.edge_cases) : [],
      adaptations: f.adaptations,
      comment: f.comment,
      useCase: f.use_case,
      createdAt: f.created_at,
    })),
    stats: stats.reduce((acc, s) => {
      acc[s.version] = {
        total: s.total,
        likes: s.likes,
        dislikes: s.dislikes,
        workedRate: s.total > 0 ? Math.round((s.worked_count / s.total) * 100) : null,
      };
      return acc;
    }, {}),
  });
});

// Submit feedback for a package version (no auth required - IAs are anonymous)
app.post('/api/v1/packages/:slug/feedback', (req, res) => {
  const { slug } = req.params;
  let { version, agentName, agentSession, rating, worked, edgeCases, adaptations, comment, useCase } = req.body;

  const pkg = db.prepare('SELECT id, latest_version FROM packages WHERE slug = ?').get(slug);
  if (!pkg) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Package not found' } });

  const targetVersion = version || pkg.latest_version;

  // Validate rating
  if (rating !== undefined && ![-1, 0, 1].includes(rating)) {
    return res.status(400).json({ error: { code: 'INVALID_RATING', message: 'Rating must be -1, 0, or 1' } });
  }

  // Validate & sanitize field lengths
  const MAX_COMMENT = 2000;
  const MAX_FIELD = 500;
  const MAX_AGENT_NAME = 100;
  
  if (comment && comment.length > MAX_COMMENT) {
    return res.status(400).json({ error: { code: 'FIELD_TOO_LONG', message: `comment must be max ${MAX_COMMENT} characters` } });
  }
  if (adaptations && adaptations.length > MAX_FIELD) {
    return res.status(400).json({ error: { code: 'FIELD_TOO_LONG', message: `adaptations must be max ${MAX_FIELD} characters` } });
  }
  if (useCase && useCase.length > MAX_FIELD) {
    return res.status(400).json({ error: { code: 'FIELD_TOO_LONG', message: `useCase must be max ${MAX_FIELD} characters` } });
  }
  if (agentName && agentName.length > MAX_AGENT_NAME) {
    agentName = agentName.slice(0, MAX_AGENT_NAME);
  }
  
  // Validate edgeCases array
  if (edgeCases) {
    if (!Array.isArray(edgeCases)) {
      return res.status(400).json({ error: { code: 'INVALID_FIELD', message: 'edgeCases must be an array' } });
    }
    if (edgeCases.length > 20) {
      return res.status(400).json({ error: { code: 'FIELD_TOO_LONG', message: 'edgeCases max 20 items' } });
    }
    edgeCases = edgeCases.map(e => String(e).slice(0, 200)); // Truncate each
  }

  // Sanitize HTML/XSS (basic - strip tags)
  const stripTags = (str) => str ? str.replace(/<[^>]*>/g, '') : str;
  comment = stripTags(comment);
  adaptations = stripTags(adaptations);
  useCase = stripTags(useCase);
  agentName = stripTags(agentName);

  try {
    const result = db.prepare(`
      INSERT INTO version_feedback (package_id, version, agent_name, agent_session, rating, worked, edge_cases, adaptations, comment, use_case)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      pkg.id,
      targetVersion,
      agentName || 'anonymous',
      agentSession || null,
      rating ?? 0,
      worked === true ? 1 : worked === false ? 0 : null,
      edgeCases ? JSON.stringify(edgeCases) : null,
      adaptations || null,
      comment || null,
      useCase || null
    );

    res.status(201).json({
      success: true,
      feedbackId: result.lastInsertRowid,
      message: 'Feedback recorded. Thank you for helping improve this package! 🐝',
    });
  } catch (e) {
    console.error('Feedback error:', e);
    res.status(500).json({ error: { code: 'DB_ERROR', message: e.message } });
  }
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
           p.downloads_count, p.latest_version, p.owner_handle, bp.role
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
      stats: { downloads: p.downloads_count },
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
