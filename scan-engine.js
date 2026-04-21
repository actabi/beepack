/**
 * Scan Engine
 *
 * Orchestrates the skill safety scan pipeline:
 *   1. Parse SKILL.md + scripts → commands, URLs, packages, imports
 *   2. Validate npm packages (existence + metadata)
 *   3. Validate pypi packages (existence + metadata) - best effort, optional
 *   4. Validate URLs (blocklist, pastebin/tunnel, young domain)
 *   5. Detect typosquats against top-lists
 *   6. Aggregate into a single RED / YELLOW / GREEN verdict
 *
 * All heavy I/O (fetch, DB) is injectable for tests.
 */

import { randomUUID } from 'crypto';
import { parseSkill } from './skill-parser.js';
import { validateNpmPackages } from './validators/npm.js';
import { validateUrls } from './validators/urls.js';
import { detectTyposquats } from './validators/typosquat.js';
import { aggregateVerdict } from './verdict-aggregator.js';
import { createMemoryCache } from './validators/cache.js';

/**
 * @param {object} input
 * @param {string} input.markdown - SKILL.md content
 * @param {Array<{name:string, content:string}>} [input.scripts]
 * @param {string} [input.source] - provenance label (URL or filename) for display
 * @param {object} [opts]
 * @param {object} [opts.cache]
 * @param {typeof fetch} [opts.fetch]
 * @param {Set<string>} [opts.npmTop] - top-list Set for npm
 * @param {Set<string>} [opts.pipTop] - top-list Set for pypi
 * @param {Set<string>} [opts.blocklist] - URLhaus URLs
 * @param {Set<string>} [opts.blockedHosts] - URLhaus hosts
 * @param {boolean} [opts.skipNetwork] - if true, skip npm/url network validators (offline mode)
 * @param {boolean} [opts.validatePip] - if true, also validate pypi (default false for MVP)
 * @param {Date|number} [opts.now]
 * @returns {Promise<{
 *   scanId:string, scannedAt:string, source:string,
 *   verdict:'red'|'yellow'|'green', summary:string,
 *   findings:Array<object>, stats:object
 * }>}
 */
export async function scanSkill(input, opts = {}) {
  const cache = opts.cache || createMemoryCache();
  const fetchImpl = opts.fetch || globalThis.fetch;
  const now = opts.now instanceof Date ? opts.now : new Date(opts.now || Date.now());
  const scanId = opts.scanId || randomUUID();

  const parsed = parseSkill(input.markdown || '', input.scripts || []);

  // npm validation (unique names)
  let npm = [];
  if (!opts.skipNetwork && parsed.npmPackages.length) {
    const names = [...new Set(parsed.npmPackages.map(p => p.name))];
    npm = await validateNpmPackages(names, { cache, fetch: fetchImpl });
  }

  // pip validation (optional - defer to v2 if not requested)
  const pip = [];

  // URL validation
  let urls = [];
  if (parsed.urls.length) {
    const urlStrings = parsed.urls.map(u => u.url);
    urls = await validateUrls(urlStrings, {
      cache,
      fetch: fetchImpl,
      blocklist: opts.blocklist,
      blockedHosts: opts.blockedHosts,
      now: now.getTime(),
      skipWhois: !!opts.skipNetwork,
    });
  }

  // Typosquat detection (uses injected top-lists)
  const candidates = [
    ...parsed.npmPackages.map(p => ({ name: p.name, ecosystem: 'npm' })),
    ...parsed.pipPackages.map(p => ({ name: p.name, ecosystem: 'pypi' })),
  ];
  const typosquats = detectTyposquats(candidates, {
    npmTop: opts.npmTop,
    pipTop: opts.pipTop,
  });

  const verdict = aggregateVerdict(parsed, { npm, pip, urls, typosquats });

  return {
    scanId,
    scannedAt: now.toISOString(),
    source: input.source || 'paste',
    verdict: verdict.verdict,
    summary: verdict.summary,
    findings: verdict.findings,
    stats: {
      shellCommands: parsed.shellCommands.length,
      urls: parsed.urls.length,
      npmPackages: parsed.npmPackages.length,
      pipPackages: parsed.pipPackages.length,
      imports: parsed.imports.length,
    },
    parsed,
  };
}
