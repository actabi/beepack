/**
 * ClawHub Compatibility Layer
 * Exposes Beepack packages as OpenClaw skills via ClawHub-compatible API
 *
 * This allows OpenClaw users to:
 * - Discover Beepack packages with: clawhub search --registry https://beepack.dev
 * - Install packages as skills: clawhub install <slug> --registry https://beepack.dev
 * - Use Beepack packages directly in their OpenClaw workflows
 */

import { verifySessionToken } from './auth.js';
import { getFile } from './storage.js';

/**
 * Convert a Beepack package to a SKILL.md format
 */
function packageToSkillMd(pkg) {
  const requires = JSON.parse(pkg.requires || '{}');
  const keywords = JSON.parse(pkg.keywords || '[]');
  const capabilities = JSON.parse(pkg.capabilities || '[]');

  // Build frontmatter
  const frontmatter = {
    name: pkg.slug,
    description: pkg.description,
    version: pkg.latest_version || '1.0.0',
    metadata: {
      openclaw: {
        requires: {},
        author: pkg.owner_handle,
        homepage: `https://beepack.dev/packages/${pkg.slug}`,
      },
    },
  };

  if (requires.env && requires.env.length > 0) {
    frontmatter.metadata.openclaw.requires.env = requires.env;
  }
  if (requires.deps && requires.deps.length > 0) {
    frontmatter.metadata.openclaw.requires.bins = requires.deps;
  }

  // Build SKILL.md content
  const yamlStr = jsonToYaml(frontmatter);

  let content = `---\n${yamlStr}---\n\n`;
  content += `# ${pkg.display_name}\n\n`;
  content += `${pkg.description}\n\n`;

  if (capabilities.length > 0) {
    content += `## Capabilities\n\n`;
    capabilities.forEach(c => { content += `- ${c}\n`; });
    content += '\n';
  }

  if (requires.env && requires.env.length > 0) {
    content += `## Required Environment Variables\n\n`;
    requires.env.forEach(e => { content += `- \`${e}\`\n`; });
    content += '\n';
  }

  content += `## Installation\n\n`;
  content += '```bash\n';
  content += `beepack install ${pkg.slug}\n`;
  content += '```\n\n';

  if (pkg.readme) {
    // Strip first H1 to avoid duplication
    const readmeClean = pkg.readme.replace(/^#\s+.+\n/, '');
    content += readmeClean;
  }

  content += `\n\n---\nPublished on [Beepack](https://beepack.dev/packages/${pkg.slug})\n`;

  return content;
}

/**
 * Simple JSON to YAML converter (no dependencies)
 */
function jsonToYaml(obj, indent = 0) {
  let yaml = '';
  const pad = '  '.repeat(indent);

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      yaml += `${pad}${key}:\n`;
      value.forEach(item => {
        if (typeof item === 'object') {
          yaml += `${pad}  - ${jsonToYaml(item, indent + 2).trimStart()}`;
        } else {
          yaml += `${pad}  - ${item}\n`;
        }
      });
    } else if (typeof value === 'object') {
      yaml += `${pad}${key}:\n`;
      yaml += jsonToYaml(value, indent + 1);
    } else {
      yaml += `${pad}${key}: ${JSON.stringify(value)}\n`;
    }
  }

  return yaml;
}

/**
 * Setup ClawHub-compatible routes
 */
export function setupClawHubCompat(app, db) {

  // Well-known discovery endpoint
  app.get('/.well-known/clawhub.json', (req, res) => {
    res.json({
      apiBase: 'https://beepack.dev',
      authBase: 'https://beepack.dev',
      minCliVersion: '0.1.0',
    });
  });

  // Also support clawdhub.json alias
  app.get('/.well-known/clawdhub.json', (req, res) => {
    res.json({
      apiBase: 'https://beepack.dev',
      authBase: 'https://beepack.dev',
      minCliVersion: '0.1.0',
    });
  });

  // Search skills (ClawHub format)
  app.get('/api/v1/skills', (req, res) => {
    const { sort = 'updated', limit = 20, offset = 0 } = req.query;

    const sortColumn = {
      'updated': 'updated_at DESC',
      'downloads': 'downloads_count DESC',
      'trending': 'downloads_count DESC',
    }[sort] || 'updated_at DESC';

    const packages = db.prepare(`
      SELECT * FROM packages
      WHERE moderation_status = 'active'
      ORDER BY ${sortColumn}
      LIMIT ? OFFSET ?
    `).all(parseInt(limit), parseInt(offset));

    const total = db.prepare('SELECT COUNT(*) as count FROM packages WHERE moderation_status = ?').get('active');

    res.json({
      items: packages.map(p => packageToClawHubSkill(p)),
      total: total.count,
      page: Math.floor(parseInt(offset) / parseInt(limit)) + 1,
      perPage: parseInt(limit),
    });
  });

  // Get single skill (ClawHub format)
  app.get('/api/v1/skills/:slug', (req, res) => {
    const pkg = db.prepare('SELECT * FROM packages WHERE slug = ? AND moderation_status = ?').get(req.params.slug, 'active');
    if (!pkg) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    res.json(packageToClawHubSkill(pkg));
  });

  // Download skill as ZIP
  app.get('/api/v1/download', async (req, res) => {
    const { slug, version } = req.query;
    if (!slug) {
      return res.status(400).json({ error: 'slug is required' });
    }

    const pkg = db.prepare('SELECT * FROM packages WHERE slug = ?').get(slug);
    if (!pkg) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    // Generate SKILL.md from package data
    const skillMd = packageToSkillMd(pkg);

    // Get stored source files
    let files = [];
    try {
      files = db.prepare(
        'SELECT file_path, storage_path FROM package_files WHERE package_id = ? AND version = ?'
      ).all(pkg.id, version || pkg.latest_version);
    } catch (e) { /* table may not exist */ }

    // Return SKILL.md + source files as multipart or just SKILL.md
    // OpenClaw supports single-file skills (just SKILL.md)
    let fullContent = skillMd;

    // Append source files as code blocks in the SKILL.md
    for (const f of files) {
      const content = getFile(f.storage_path);
      if (content) {
        const ext = f.file_path.split('.').pop() || 'js';
        fullContent += `\n\n## Source: ${f.file_path}\n\n\`\`\`${ext}\n${content.toString('utf8')}\n\`\`\`\n`;
      }
    }

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="SKILL.md"`);
    res.send(fullContent);
  });

  // Resolve skill version by hash
  app.get('/api/v1/resolve', (req, res) => {
    const { slug } = req.query;
    if (!slug) {
      return res.status(400).json({ error: 'slug is required' });
    }

    const pkg = db.prepare('SELECT * FROM packages WHERE slug = ?').get(slug);
    if (!pkg) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    const versions = db.prepare(
      'SELECT version, created_at FROM package_versions WHERE package_id = ? ORDER BY created_at DESC'
    ).all(pkg.id);

    res.json({
      slug: pkg.slug,
      latestVersion: pkg.latest_version,
      versions: versions.map(v => ({
        version: v.version,
        createdAt: v.created_at,
      })),
    });
  });

  // Whoami (ClawHub format)
  app.get('/api/v1/whoami', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = verifySessionToken(authHeader.slice(7));
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.json({
      id: user.id,
      username: user.login,
      displayName: user.login,
    });
  });

  console.log('   - ClawHub Compat: https://beepack.dev/.well-known/clawhub.json');
}

/**
 * Convert a Beepack package DB row to ClawHub skill format
 */
function packageToClawHubSkill(pkg) {
  const keywords = JSON.parse(pkg.keywords || '[]');
  const capabilities = JSON.parse(pkg.capabilities || '[]');
  const requires = JSON.parse(pkg.requires || '{}');

  return {
    slug: pkg.slug,
    displayName: pkg.display_name,
    description: pkg.description,
    version: pkg.latest_version || '1.0.0',
    author: {
      username: pkg.owner_handle,
      avatarUrl: pkg.owner_avatar,
    },
    stats: {
      downloads: pkg.downloads_count || 0,
      likes: 0,
    },
    metadata: {
      openclaw: {
        requires: {
          env: requires.env || [],
        },
        author: pkg.owner_handle,
        homepage: `https://beepack.dev/packages/${pkg.slug}`,
      },
    },
    tags: keywords,
    capabilities: capabilities,
    license: 'MIT',
    createdAt: pkg.created_at,
    updatedAt: pkg.updated_at,
    moderation: { status: 'approved' },
  };
}
