/**
 * URL / domain risk validator
 *
 * Per URL:
 *   - Whitelist check (npm/pypi/github/anthropic) → no finding, mark trusted
 *   - Pastebin / tunnel host check (ngrok, localtunnel, pastebin, ...) → WARN
 *   - URLhaus blocklist check (static Set passed in) → RED
 *   - Domain age via RDAP (<30 days old) → WARN
 *
 * All network I/O is injected via `fetch` for testability.
 * Domain age lookups are cached for 24h.
 */

import { createMemoryCache, CACHE_TTL_24H } from './cache.js';

const TRUSTED_HOSTS = new Set([
  'npmjs.org', 'www.npmjs.com', 'registry.npmjs.org',
  'pypi.org', 'files.pythonhosted.org',
  'github.com', 'raw.githubusercontent.com', 'objects.githubusercontent.com', 'gist.github.com',
  'anthropic.com', 'www.anthropic.com', 'docs.anthropic.com', 'claude.ai', 'api.anthropic.com',
  'aikido.dev', 'www.aikido.dev',
]);

const PASTEBIN_TUNNEL_HOSTS = new Set([
  'pastebin.com', 'hastebin.com', 'paste.ee', 'paste.rs', 'ghostbin.com', 'termbin.com',
  'transfer.sh', 'file.io', 'catbox.moe', 'litterbox.catbox.moe',
  'ngrok.io', 'ngrok-free.app', 'ngrok.app',
  'loca.lt', 'localtunnel.me',
  'serveo.net', 'tunnelto.dev', 'tunnel.pyjam.as',
  'bore.pub',
  'trycloudflare.com',
]);

// Matches e.g. *.ngrok.io, *.ngrok-free.app etc.
const PASTEBIN_TUNNEL_SUFFIXES = [
  '.ngrok.io', '.ngrok-free.app', '.ngrok.app',
  '.loca.lt', '.localtunnel.me',
  '.serveo.net', '.tunnelto.dev',
  '.trycloudflare.com',
  '.herokuapp.com', // publicly registrable subdomains often used for C2 redirects
];

const YOUNG_DOMAIN_DAYS = 30;
const YOUNG_DOMAIN_MS = YOUNG_DOMAIN_DAYS * 24 * 60 * 60 * 1000;

/**
 * Validate a list of URLs.
 *
 * @param {string[]} urls
 * @param {object} [opts]
 * @param {Set<string>} [opts.blocklist] - URLhaus blocklist (full URLs or host+path keys)
 * @param {Set<string>} [opts.blockedHosts] - raw host blocklist
 * @param {object} [opts.cache] - TTL cache (validators/cache.js)
 * @param {typeof fetch} [opts.fetch]
 * @param {Date|number} [opts.now]
 * @param {boolean} [opts.skipWhois] - skip domain age lookups (useful for offline mode)
 * @returns {Promise<Array<{
 *   url:string, host:string, trusted:boolean,
 *   findings: Array<{severity:'warn'|'block', type:string, detail?:string}>
 * }>>}
 */
export async function validateUrls(urls, opts = {}) {
  const cache = opts.cache || createMemoryCache();
  const fetchImpl = opts.fetch || globalThis.fetch;
  const now = opts.now ? (opts.now instanceof Date ? opts.now.getTime() : opts.now) : Date.now();
  const blocklist = opts.blocklist || new Set();
  const blockedHosts = opts.blockedHosts || new Set();

  const unique = [...new Set(urls || [])];
  const out = [];

  for (const rawUrl of unique) {
    out.push(await validateSingleUrl(rawUrl, { cache, fetchImpl, now, blocklist, blockedHosts, skipWhois: !!opts.skipWhois }));
  }

  return out;
}

async function validateSingleUrl(rawUrl, ctx) {
  const parsed = tryParseUrl(rawUrl);
  if (!parsed) {
    return { url: rawUrl, host: '', trusted: false, findings: [{ severity: 'warn', type: 'invalid_url' }] };
  }
  const host = parsed.host.toLowerCase();
  const findings = [];

  // Blocklist: full URL or host
  if (ctx.blocklist.has(rawUrl) || ctx.blocklist.has(rawUrl.toLowerCase())) {
    findings.push({ severity: 'block', type: 'urlhaus_match', detail: 'exact URL on URLhaus blocklist' });
  }
  if (ctx.blockedHosts.has(host)) {
    findings.push({ severity: 'block', type: 'urlhaus_match', detail: 'host on URLhaus blocklist' });
  }

  const trusted = isTrustedHost(host);
  if (trusted) {
    return { url: rawUrl, host, trusted: true, findings };
  }

  // Pastebin / tunnel
  if (isPastebinOrTunnel(host)) {
    findings.push({ severity: 'warn', type: 'pastebin_or_tunnel', detail: host });
  }

  // Domain age via RDAP (cached)
  if (!ctx.skipWhois) {
    try {
      const age = await lookupDomainAge(host, ctx);
      if (age && age.registeredAt) {
        const ageMs = ctx.now - Date.parse(age.registeredAt);
        if (!Number.isNaN(ageMs) && ageMs < YOUNG_DOMAIN_MS) {
          const days = Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000)));
          findings.push({ severity: 'warn', type: 'young_domain', detail: `registered ${days}d ago` });
        }
      }
    } catch {
      // network failure is non-fatal; no finding
    }
  }

  return { url: rawUrl, host, trusted: false, findings };
}

export function isTrustedHost(host) {
  if (!host) return false;
  if (TRUSTED_HOSTS.has(host)) return true;
  for (const trusted of TRUSTED_HOSTS) {
    if (host.endsWith('.' + trusted)) return true;
  }
  return false;
}

export function isPastebinOrTunnel(host) {
  if (!host) return false;
  if (PASTEBIN_TUNNEL_HOSTS.has(host)) return true;
  return PASTEBIN_TUNNEL_SUFFIXES.some(s => host.endsWith(s));
}

/**
 * Look up domain registration date via RDAP.
 * Returns { registeredAt: ISO string } or null.
 * Uses cache with 24h TTL.
 */
export async function lookupDomainAge(host, ctx) {
  const key = `rdap:${registrableDomain(host)}`;
  const cached = ctx.cache.get(key);
  if (cached) return cached;

  const domain = registrableDomain(host);
  if (!domain) return null;

  const url = `https://rdap.org/domain/${encodeURIComponent(domain)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await ctx.fetchImpl(url, { signal: controller.signal, headers: { Accept: 'application/rdap+json' } });
    if (!res.ok) {
      const miss = { registeredAt: null, status: res.status };
      ctx.cache.set(key, miss, CACHE_TTL_24H);
      return miss;
    }
    const data = await res.json();
    const registration = findEvent(data, 'registration');
    const result = { registeredAt: registration || null };
    ctx.cache.set(key, result, CACHE_TTL_24H);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

function findEvent(data, action) {
  if (!data || !Array.isArray(data.events)) return null;
  const ev = data.events.find(e => e && e.eventAction === action);
  return ev && ev.eventDate ? ev.eventDate : null;
}

function tryParseUrl(u) {
  try { return new URL(u); } catch { return null; }
}

/**
 * Reduce a host to its registrable domain (public suffix list approximation).
 * Strips known multi-level TLDs (co.uk, com.br, ...).
 */
export function registrableDomain(host) {
  if (!host) return '';
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const last2 = parts.slice(-2).join('.');
  if (MULTI_LEVEL_TLDS.has(last2)) return parts.slice(-3).join('.');
  return last2;
}

const MULTI_LEVEL_TLDS = new Set([
  'co.uk', 'ac.uk', 'gov.uk', 'org.uk',
  'com.au', 'net.au', 'org.au',
  'co.jp', 'or.jp', 'ne.jp',
  'com.br', 'com.cn', 'com.mx',
  'co.nz', 'co.za', 'co.in',
]);

/**
 * Load a URLhaus-style blocklist from a CSV or plain-text file.
 * Accepts the official URLhaus CSV (https://urlhaus.abuse.ch/downloads/csv_recent/) format:
 *   "id","dateadded","url","url_status","threat","tags","urlhaus_link","reporter"
 * Or a plain text list with one URL per line.
 *
 * @param {string} raw - file contents
 * @returns {{urls:Set<string>, hosts:Set<string>}}
 */
export function parseUrlhausFile(raw) {
  const urls = new Set();
  const hosts = new Set();
  if (!raw) return { urls, hosts };
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Try CSV with quoted fields
    const quoted = trimmed.match(/^"[^"]*","[^"]*","([^"]+)"/);
    const url = quoted ? quoted[1] : trimmed.split(/\s+/)[0];
    if (!url || !/^https?:\/\//i.test(url)) continue;
    urls.add(url);
    const host = tryParseUrl(url);
    if (host) hosts.add(host.host.toLowerCase());
  }
  return { urls, hosts };
}
