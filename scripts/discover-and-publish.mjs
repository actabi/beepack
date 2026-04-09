#!/usr/bin/env node
/**
 * Beepack - GitHub Discovery & Auto-Publish
 *
 * Finds popular JS/TS repos on GitHub and publishes them as
 * standalone Beepack packages with generated wrapper code.
 *
 * Usage: node scripts/discover-and-publish.mjs
 *
 * Env vars:
 *   BEEPACK_API     - API URL (default: https://beepack.ai/api/v1)
 *   BEEPACK_TOKEN   - Auth token (required)
 *   GH_TOKEN        - GitHub token (required)
 *   PACKAGES_PER_RUN - Max packages per run (default: 50)
 *   OPENAI_API_KEY  - OpenAI key for code generation (required)
 */

// ── Config ───────────────────────────────────────────────────
const API = process.env.BEEPACK_API || 'https://beepack.ai/api/v1';
const TOKEN = process.env.BEEPACK_TOKEN;
const GH_TOKEN = process.env.GH_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MAX_PACKAGES = parseInt(process.env.PACKAGES_PER_RUN || '50', 10);

if (!TOKEN || !GH_TOKEN || !OPENAI_KEY) {
  console.error('[error] Missing env vars. Need: BEEPACK_TOKEN, GH_TOKEN, OPENAI_API_KEY');
  process.exit(1);
}

// ── Categories (rotate 3 per day) ────────────────────────────
const CATEGORIES = [
  { q: 'oauth authentication login', topic: 'auth' },
  { q: 'stripe payments checkout billing', topic: 'payments' },
  { q: 'email smtp transactional', topic: 'email' },
  { q: 'database orm query builder', topic: 'database' },
  { q: 'file upload storage s3 cloud', topic: 'storage' },
  { q: 'openai llm ai embeddings', topic: 'ai-llm' },
  { q: 'monitoring metrics logging observability', topic: 'monitoring' },
  { q: 'api client sdk rest graphql', topic: 'api-utils' },
  { q: 'devops ci cd deploy docker', topic: 'devops' },
  { q: 'testing jest vitest mock', topic: 'testing' },
  { q: 'validation schema zod joi', topic: 'validation' },
  { q: 'image processing resize sharp', topic: 'image' },
  { q: 'pdf generate parse', topic: 'pdf' },
  { q: 'websocket realtime socket', topic: 'realtime' },
  { q: 'cache redis memcached', topic: 'caching' },
  { q: 'search elasticsearch algolia', topic: 'search' },
  { q: 'queue jobs background worker', topic: 'queue' },
  { q: 'webhook verify signature', topic: 'webhooks' },
  { q: 'csv excel spreadsheet parse', topic: 'spreadsheets' },
  { q: 'markdown parse render', topic: 'markdown' },
  { q: 'date time timezone moment', topic: 'date-time' },
  { q: 'cli command line terminal', topic: 'cli-tools' },
  { q: 'seo meta sitemap', topic: 'seo' },
  { q: 'cms headless content', topic: 'cms' },
  { q: 'ecommerce cart checkout', topic: 'e-commerce' },
  { q: 'i18n internationalization translation', topic: 'i18n' },
  { q: 'charts graphs visualization', topic: 'charts' },
  { q: 'maps geolocation geocoding', topic: 'maps' },
  { q: 'notifications push mobile', topic: 'notifications' },
  { q: 'scraping crawler puppeteer', topic: 'scraping' },
];

function todaysCategories() {
  const day = Math.floor(Date.now() / 86400000);
  const cats = [];
  for (let i = 0; i < 3; i++) {
    cats.push(CATEGORIES[(day * 3 + i) % CATEGORIES.length]);
  }
  return cats;
}

// ── GitHub search ────────────────────────────────────────────
async function ghApi(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Beepack-Discovery/1.0',
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${path}`);
  return res.json();
}

async function searchRepos(category) {
  const q = encodeURIComponent(`${category.q} language:javascript language:typescript stars:>100`);
  const data = await ghApi(`/search/repositories?q=${q}&sort=stars&order=desc&per_page=30`);
  return (data.items || []).map(r => ({
    owner: r.owner.login,
    name: r.name,
    fullName: r.full_name,
    description: r.description || '',
    stars: r.stargazers_count,
    license: r.license?.spdx_id || 'Unknown',
    url: r.html_url,
    topics: r.topics || [],
    language: r.language,
    updatedAt: r.updated_at,
    topic: category.topic,
  }));
}

async function getLatestVersion(owner, name) {
  try {
    const data = await ghApi(`/repos/${owner}/${name}/releases/latest`);
    return data.tag_name?.replace(/^v/, '') || null;
  } catch {
    try {
      const tags = await ghApi(`/repos/${owner}/${name}/tags?per_page=1`);
      return tags[0]?.name?.replace(/^v/, '') || null;
    } catch {
      return null;
    }
  }
}

async function getReadmeContent(owner, name) {
  try {
    const data = await ghApi(`/repos/${owner}/${name}/readme`);
    return Buffer.from(data.content, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

// ── Deduplication ────────────────────────────────────────────
async function getExistingSlugs() {
  const res = await fetch(`${API}/packages?limit=500`);
  if (!res.ok) return new Set();
  const data = await res.json();
  return new Set((data.packages || data).map(p => p.slug));
}

function repoToSlug(repo) {
  return repo.name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/\.js$|\.ts$|-js$|-ts$|-node$/, '');
}

// ── Code generation via OpenAI ───────────────────────────────
async function generatePackageCode(repo, version, readmeSource) {
  const prompt = `You are generating a standalone Beepack package from a popular GitHub repo.

REPO: ${repo.fullName}
DESCRIPTION: ${repo.description}
STARS: ${repo.stars}
LICENSE: ${repo.license}
URL: ${repo.url}
VERSION: ${version}
TOPICS: ${repo.topics.join(', ')}

SOURCE README (first 3000 chars):
${readmeSource.slice(0, 3000)}

Generate THREE files. Respond in JSON with keys: hiveYaml, indexJs, readmeMd

1. HIVE.yaml - Valid YAML with:
   - name: "${repoToSlug(repo)}"
   - version: "${version}"
   - displayName: human-readable title (2-4 words, NOT just the repo name)
   - description: one-line English description of what this does
   - keywords: 3-6 relevant keywords
   - capabilities: 3-6 specific things this code can do (snake_case)
   - requires.env: list of env var names needed (e.g. API_KEY)
   - compatible: ["cursor", "copilot", "claude", "windsurf", "openclaw"]
   - repository: "${repo.url}"
   - source: { repo: "${repo.fullName}", url: "${repo.url}", stars: ${repo.stars}, license: "${repo.license}" }

2. index.js - Standalone ESM module:
   - Zero npm dependencies, use native fetch
   - Wrap the 2-3 most common use cases of this library
   - Full JSDoc with @param and @returns
   - Proper error handling
   - Export named functions (not default)
   - MINIMUM 80 lines of real, working code
   - The code should be a lightweight standalone client that talks to the same API/service the original library wraps
   - Do NOT just re-export or import the original package

3. README.md - Documentation:
   - Title with package name
   - Source section: link to GitHub, author, stars, license
   - What it does (2-3 sentences)
   - Environment variables needed
   - Installation: \`beepack pull ${repoToSlug(repo)}\`
   - 3+ usage examples with code blocks
   - API reference for exported functions
   - MINIMUM 40 lines

Return ONLY valid JSON: {"hiveYaml": "...", "indexJs": "...", "readmeMd": "..."}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
  const data = await res.json();
  const content = JSON.parse(data.choices[0].message.content);

  // Validate minimum lengths
  if (!content.hiveYaml || !content.indexJs || !content.readmeMd) {
    throw new Error('Missing files in generated content');
  }
  if (content.indexJs.split('\n').length < 40) {
    throw new Error(`index.js too short: ${content.indexJs.split('\n').length} lines`);
  }
  if (content.readmeMd.split('\n').length < 20) {
    throw new Error(`README.md too short: ${content.readmeMd.split('\n').length} lines`);
  }

  return content;
}

// ── Publish to Beepack (multipart) ──────────────────────────
async function publishPackage(slug, version, files, repositoryUrl) {
  const boundary = '----BeepackBoundary' + Date.now();

  function textPart(name, value) {
    return `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
  }

  function filePart(name, filename, content) {
    return `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n${content}\r\n`;
  }

  let body = '';
  body += textPart('version', version);
  body += textPart('repository', repositoryUrl);
  body += filePart('files', 'HIVE.yaml', files.hiveYaml);
  body += filePart('files', 'index.js', files.indexJs);
  body += filePart('files', 'README.md', files.readmeMd);
  body += `--${boundary}--\r\n`;

  const res = await fetch(`${API}/packages/${slug}/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
    signal: AbortSignal.timeout(30000),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
  return data;
}

// ── Verify publication ───────────────────────────────────────
async function verifyPackage(slug) {
  const res = await fetch(`${API}/packages/${slug}/files`);
  if (!res.ok) return false;
  const data = await res.json();
  const fileCount = (data.files || []).length;
  return fileCount >= 3;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  const categories = todaysCategories();
  console.log(`[discover] Categories: ${categories.map(c => c.topic).join(', ')}`);

  // 1. Search GitHub
  let allRepos = [];
  for (const cat of categories) {
    try {
      const repos = await searchRepos(cat);
      allRepos.push(...repos);
      console.log(`[discover] ${cat.topic}: ${repos.length} repos found`);
    } catch (e) {
      console.error(`[discover] ${cat.topic}: search failed - ${e.message}`);
    }
  }

  // Deduplicate by repo name
  const seen = new Set();
  allRepos = allRepos.filter(r => {
    const key = r.fullName;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 2. Filter out existing packages
  const existing = await getExistingSlugs();
  const newRepos = allRepos.filter(r => !existing.has(repoToSlug(r)));
  console.log(`[discover] Found ${allRepos.length} repos, ${newRepos.length} after dedup`);

  // 3. Limit
  const toProcess = newRepos.slice(0, MAX_PACKAGES);

  let published = 0;
  let skipped = 0;
  let failed = 0;

  // 4. Process each repo
  for (let i = 0; i < toProcess.length; i++) {
    const repo = toProcess[i];
    const slug = repoToSlug(repo);
    const prefix = `[publish] ${i + 1}/${toProcess.length} ${repo.fullName}`;

    try {
      // Get version
      const version = await getLatestVersion(repo.owner, repo.name) || '1.0.0';

      // Get source README for context
      const readmeSource = await getReadmeContent(repo.owner, repo.name);

      // Generate code
      console.log(`${prefix} v${version} -> generating...`);
      const files = await generatePackageCode(repo, version, readmeSource);

      // Publish
      await publishPackage(slug, version, files, repo.url);

      // Verify
      const ok = await verifyPackage(slug);
      if (ok) {
        console.log(`${prefix} v${version} -> OK (3 files)`);
        published++;
      } else {
        console.error(`${prefix} v${version} -> PUBLISHED BUT FILES MISSING`);
        failed++;
      }

      // Rate limit: small delay between publishes
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      const msg = e.message || String(e);
      if (msg.includes('SIMILAR_EXISTS') || msg.includes('already exist')) {
        console.log(`${prefix} -> SKIP (similar exists)`);
        skipped++;
      } else {
        console.error(`${prefix} -> FAIL: ${msg}`);
        failed++;
      }
    }
  }

  console.log(`\n[done] ${published} published, ${skipped} skipped, ${failed} failed`);
}

main().catch(e => {
  console.error('[fatal]', e);
  process.exit(1);
});
