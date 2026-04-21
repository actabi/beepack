/**
 * npm package existence validator
 *
 * Validates that a package exists on the public npm registry.
 * Returns metadata useful to the verdict aggregator: exists flag, latest version,
 * last publish date, maintainers, weekly downloads.
 *
 * Caches results for 24h in the provided cache interface (see validators/cache.js).
 */

import { createMemoryCache, CACHE_TTL_24H } from './cache.js';

const REGISTRY_URL = 'https://registry.npmjs.org';
const DOWNLOADS_URL = 'https://api.npmjs.org/downloads/point/last-week';

const DEFAULT_CONCURRENCY = 10;
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Validate a single npm package.
 *
 * @param {string} name - package name (may include scope)
 * @param {object} [opts]
 * @param {object} [opts.cache] - cache interface from validators/cache.js
 * @param {typeof fetch} [opts.fetch] - fetch implementation (for tests)
 * @param {number} [opts.timeoutMs]
 * @returns {Promise<{name:string, exists:boolean, status:number, latest?:string,
 *   lastPublishAt?:string, maintainers?:string[], weeklyDownloads?:number, error?:string}>}
 */
export async function validateNpmPackage(name, opts = {}) {
  const cache = opts.cache || createMemoryCache();
  const fetchImpl = opts.fetch || globalThis.fetch;
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

  if (!name || typeof name !== 'string') {
    return { name: String(name), exists: false, status: 0, error: 'invalid_name' };
  }

  const cacheKey = `npm:${name}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const encoded = encodeNpmPackageName(name);
  let result;
  try {
    const res = await fetchWithTimeout(`${REGISTRY_URL}/${encoded}`, fetchImpl, timeoutMs);
    if (res.status === 404) {
      result = { name, exists: false, status: 404 };
    } else if (!res.ok) {
      return { name, exists: false, status: res.status, error: `registry_${res.status}` };
    } else {
      const data = await res.json();
      const latest = data['dist-tags'] && data['dist-tags'].latest;
      const versionMeta = latest && data.versions ? data.versions[latest] : undefined;
      const time = data.time || {};
      const maintainers = Array.isArray(data.maintainers)
        ? data.maintainers.map(m => m.name || m.email).filter(Boolean)
        : [];
      result = {
        name,
        exists: true,
        status: 200,
        latest,
        lastPublishAt: latest ? time[latest] : (time.modified || time.created),
        maintainers,
        description: versionMeta && versionMeta.description,
      };

      // Best-effort weekly downloads lookup (separate endpoint, failures non-fatal)
      try {
        const dlRes = await fetchWithTimeout(`${DOWNLOADS_URL}/${encoded}`, fetchImpl, timeoutMs);
        if (dlRes.ok) {
          const dlData = await dlRes.json();
          if (typeof dlData.downloads === 'number') result.weeklyDownloads = dlData.downloads;
        }
      } catch {
        // ignore
      }
    }
  } catch (err) {
    // Network error: do not cache, return transient failure
    return { name, exists: false, status: 0, error: err && err.message ? err.message : 'network_error' };
  }

  cache.set(cacheKey, result, CACHE_TTL_24H);
  return result;
}

/**
 * Batch-validate npm packages with bounded concurrency.
 *
 * @param {string[]} names - unique package names
 * @param {object} [opts] - same as validateNpmPackage + { concurrency }
 * @returns {Promise<Array<Awaited<ReturnType<typeof validateNpmPackage>>>>}
 */
export async function validateNpmPackages(names, opts = {}) {
  const unique = [...new Set(names || [])];
  const concurrency = Math.max(1, opts.concurrency || DEFAULT_CONCURRENCY);
  const results = new Array(unique.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= unique.length) return;
      results[i] = await validateNpmPackage(unique[i], opts);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, unique.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Encode a package name for the registry URL.
 * Scoped packages: `@scope/name` → `@scope%2Fname`.
 */
export function encodeNpmPackageName(name) {
  if (name.startsWith('@')) {
    const slash = name.indexOf('/');
    if (slash === -1) return encodeURIComponent(name);
    return encodeURIComponent(name.slice(0, slash)) + '%2F' + encodeURIComponent(name.slice(slash + 1));
  }
  return encodeURIComponent(name);
}

async function fetchWithTimeout(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { signal: controller.signal, headers: { 'Accept': 'application/json', 'User-Agent': 'beepack-scan/0.1' } });
  } finally {
    clearTimeout(timer);
  }
}
