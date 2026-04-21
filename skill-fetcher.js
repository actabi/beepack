/**
 * Skill fetcher
 *
 * Resolves a user-supplied URL to a skill payload: SKILL.md plus any referenced
 * scripts (.sh, .py, .js, .ts) inside the same folder.
 *
 * Supported URL shapes:
 *   - https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>.md → single file
 *   - https://github.com/<owner>/<repo>/blob/<branch>/<path>.md → single file (converted to raw)
 *   - https://github.com/<owner>/<repo>                       → fetches SKILL.md from root + scripts in same dir
 *   - https://github.com/<owner>/<repo>/tree/<branch>/<path>  → folder scan
 *   - https://gist.github.com/<user>/<id>                     → first .md file from the gist
 *
 * Anything else is fetched as a plain text resource (best effort).
 */

const MAX_BYTES = 512 * 1024;          // 512KB per file
const MAX_TOTAL_BYTES = 2 * 1024 * 1024; // 2MB total payload
const MAX_FILES = 20;
const FETCH_TIMEOUT_MS = 10000;

const SCRIPT_EXTS = ['.sh', '.bash', '.zsh', '.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'];

export async function fetchSkill(rawUrl, { fetch: fetchImpl = globalThis.fetch, githubToken } = {}) {
  if (!rawUrl) throw new Error('url required');

  let url;
  try { url = new URL(rawUrl); } catch { throw new Error('invalid url'); }

  const host = url.host.toLowerCase();
  const headers = { 'User-Agent': 'beepack-scan/0.1', 'Accept': 'application/vnd.github.v3+json' };
  if (githubToken) headers.Authorization = `Bearer ${githubToken}`;

  if (host === 'raw.githubusercontent.com') {
    const markdown = await fetchText(rawUrl, fetchImpl);
    return { markdown, scripts: [], source: rawUrl };
  }

  if (host === 'github.com' || host === 'www.github.com') {
    return await fetchFromGitHub(url, { fetchImpl, headers });
  }

  if (host === 'gist.github.com') {
    return await fetchFromGist(url, { fetchImpl, headers });
  }

  // Fallback: fetch as plain text
  const markdown = await fetchText(rawUrl, fetchImpl);
  return { markdown, scripts: [], source: rawUrl };
}

async function fetchFromGitHub(url, { fetchImpl, headers }) {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) throw new Error('invalid github url');
  const [owner, repo, type, branch, ...rest] = parts;

  // /owner/repo → treat as root
  if (!type) {
    return await fetchRepoPath(owner, repo, null, '', { fetchImpl, headers });
  }

  if (type === 'blob' && branch) {
    const path = rest.join('/');
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
    const markdown = await fetchText(rawUrl, fetchImpl);
    // Also fetch sibling scripts
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    const scripts = await fetchSiblingScripts(owner, repo, branch, dir, path, { fetchImpl, headers });
    return { markdown, scripts, source: rawUrl };
  }

  if (type === 'tree' && branch) {
    const path = rest.join('/');
    return await fetchRepoPath(owner, repo, branch, path, { fetchImpl, headers });
  }

  // Fallback: treat whole URL as a blob by swapping to raw
  throw new Error(`unsupported github url shape: ${url.pathname}`);
}

async function fetchRepoPath(owner, repo, branch, path, { fetchImpl, headers }) {
  // Resolve default branch if not given
  if (!branch) {
    const repoInfo = await fetchJson(`https://api.github.com/repos/${owner}/${repo}`, fetchImpl, headers);
    branch = repoInfo && repoInfo.default_branch ? repoInfo.default_branch : 'main';
  }

  const contentsUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
  const contents = await fetchJson(contentsUrl, fetchImpl, headers);
  if (!Array.isArray(contents)) throw new Error('path is not a directory');

  const mdFile = contents.find(f => /^skill\.md$/i.test(f.name)) || contents.find(f => f.name.toLowerCase().endsWith('.md'));
  if (!mdFile) throw new Error('no SKILL.md or markdown file found');

  const markdown = await fetchText(mdFile.download_url, fetchImpl);
  const scripts = [];
  let totalBytes = markdown.length;
  for (const f of contents) {
    if (f.type !== 'file') continue;
    if (f.name === mdFile.name) continue;
    if (!SCRIPT_EXTS.some(ext => f.name.toLowerCase().endsWith(ext))) continue;
    if (scripts.length >= MAX_FILES) break;
    if (f.size && f.size > MAX_BYTES) continue;
    const content = await fetchText(f.download_url, fetchImpl);
    totalBytes += content.length;
    if (totalBytes > MAX_TOTAL_BYTES) break;
    scripts.push({ name: f.name, content });
  }

  const source = `https://github.com/${owner}/${repo}${path ? `/tree/${branch}/${path}` : ''}`;
  return { markdown, scripts, source };
}

async function fetchSiblingScripts(owner, repo, branch, dir, blobPath, { fetchImpl, headers }) {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodePath(dir)}?ref=${encodeURIComponent(branch)}`;
    const contents = await fetchJson(url, fetchImpl, headers);
    if (!Array.isArray(contents)) return [];
    const scripts = [];
    let total = 0;
    for (const f of contents) {
      if (f.type !== 'file') continue;
      const full = dir ? `${dir}/${f.name}` : f.name;
      if (full === blobPath) continue;
      if (!SCRIPT_EXTS.some(ext => f.name.toLowerCase().endsWith(ext))) continue;
      if (scripts.length >= MAX_FILES) break;
      if (f.size && f.size > MAX_BYTES) continue;
      const content = await fetchText(f.download_url, fetchImpl);
      total += content.length;
      if (total > MAX_TOTAL_BYTES) break;
      scripts.push({ name: f.name, content });
    }
    return scripts;
  } catch {
    return [];
  }
}

async function fetchFromGist(url, { fetchImpl, headers }) {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) throw new Error('invalid gist url');
  const gistId = parts[1];
  const api = `https://api.github.com/gists/${encodeURIComponent(gistId)}`;
  const data = await fetchJson(api, fetchImpl, headers);
  const files = data && data.files ? Object.values(data.files) : [];
  const md = files.find(f => f.language === 'Markdown') || files.find(f => f.filename && f.filename.toLowerCase().endsWith('.md')) || files[0];
  if (!md || !md.content) throw new Error('gist has no markdown file');
  const scripts = files
    .filter(f => f !== md && f.filename && SCRIPT_EXTS.some(ext => f.filename.toLowerCase().endsWith(ext)))
    .slice(0, MAX_FILES)
    .map(f => ({ name: f.filename, content: f.content || '' }));
  return { markdown: md.content, scripts, source: url.toString() };
}

async function fetchText(url, fetchImpl) {
  const res = await withTimeout(fetchImpl(url, { headers: { 'User-Agent': 'beepack-scan/0.1' } }), FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`fetch failed ${res.status} for ${url}`);
  const text = await res.text();
  if (text.length > MAX_BYTES * 4) throw new Error(`file too large (${text.length} bytes)`);
  return text;
}

async function fetchJson(url, fetchImpl, headers) {
  const res = await withTimeout(fetchImpl(url, { headers }), FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`fetch failed ${res.status} for ${url}`);
  return await res.json();
}

async function withTimeout(promise, ms) {
  return await Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('fetch timeout')), ms)),
  ]);
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}
