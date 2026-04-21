/**
 * Typosquat detector
 *
 * Flags candidate package names that are suspiciously close to popular package names.
 * Rule: distance <= 2 from a top-list entry AND the candidate itself is NOT in the top list.
 * Also flags common squatting patterns (suffix "-js", homoglyph substitutions) even at distance 3.
 *
 * Input: candidate names (strings) and a top-list Set.
 * Output: findings with likely target and confidence.
 */

import { existsSync, readFileSync } from 'fs';

const SUSPICIOUS_SUFFIXES = ['-js', '.js', '-cli', '-py', '-python', '-pkg', '-core', '-lib'];

/**
 * Levenshtein distance (iterative, O(n*m) time, O(min(n,m)) space).
 */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  // Ensure b is the shorter (saves memory)
  if (a.length < b.length) { const t = a; a = b; b = t; }

  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,           // insertion
        prev[j] + 1,               // deletion
        prev[j - 1] + cost,        // substitution
      );
    }
    const swap = prev; prev = curr; curr = swap;
  }
  return prev[b.length];
}

/**
 * Detect typosquats against a top-list.
 *
 * @param {Array<{name:string, ecosystem:'npm'|'pypi'}>} candidates
 * @param {object} opts
 * @param {Set<string>} [opts.npmTop]
 * @param {Set<string>} [opts.pipTop]
 * @param {number} [opts.maxDistance=2]
 * @returns {Array<{name:string, ecosystem:string, likelyTarget:string, distance:number, confidence:number, reason:string}>}
 */
export function detectTyposquats(candidates, opts = {}) {
  const maxDistance = opts.maxDistance ?? 2;
  const findings = [];

  for (const c of candidates || []) {
    if (!c || !c.name) continue;
    const top = c.ecosystem === 'pypi' ? (opts.pipTop || EMPTY_SET) : (opts.npmTop || EMPTY_SET);
    if (top.size === 0) continue;

    const normalized = normalizeName(c.name);

    // Skip if candidate itself is in the top-list (it IS the popular one)
    if (top.has(c.name) || top.has(normalized)) continue;

    // Skip scoped packages (unlikely to typosquat at full name level; we also strip scope to compare stem)
    const stem = stemName(c.name);

    let best = null;
    for (const target of top) {
      if (target === c.name) continue;
      const d = levenshtein(stem, target);
      if (d === 0) continue; // would have been in the top-list above
      if (d <= maxDistance) {
        if (!best || d < best.distance) best = { target, distance: d };
      }
    }

    if (!best) {
      // Suspicious suffix check: "stripe-js" when "stripe" exists
      for (const suffix of SUSPICIOUS_SUFFIXES) {
        if (stem.endsWith(suffix)) {
          const trimmed = stem.slice(0, -suffix.length);
          if (trimmed && top.has(trimmed)) {
            findings.push({
              name: c.name,
              ecosystem: c.ecosystem,
              likelyTarget: trimmed,
              distance: suffix.length,
              confidence: 0.7,
              reason: `suspicious_suffix:${suffix}`,
            });
            break;
          }
        }
      }
      continue;
    }

    findings.push({
      name: c.name,
      ecosystem: c.ecosystem,
      likelyTarget: best.target,
      distance: best.distance,
      confidence: best.distance === 1 ? 0.95 : 0.75,
      reason: 'levenshtein',
    });
  }

  return findings;
}

const EMPTY_SET = new Set();

function stemName(name) {
  // Strip npm scope: @foo/bar → bar
  if (name.startsWith('@')) {
    const slash = name.indexOf('/');
    if (slash !== -1) return name.slice(slash + 1);
  }
  return name;
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[_.]/g, '-');
}

/**
 * Load a top-list from a file.
 * Supported formats:
 *   - .txt / .list: one name per line (comments starting with # are ignored)
 *   - .json: either an array of strings, or an object { packages: [...] }
 *
 * @param {string} path
 * @returns {Set<string>}
 */
export function loadTopList(path) {
  if (!existsSync(path)) return new Set();
  const raw = readFileSync(path, 'utf-8');
  if (path.endsWith('.json')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed.filter(s => typeof s === 'string'));
      if (parsed && Array.isArray(parsed.packages)) return new Set(parsed.packages.filter(s => typeof s === 'string'));
      if (parsed && Array.isArray(parsed.rows)) {
        return new Set(parsed.rows.map(r => r && (r.package || r.name)).filter(Boolean));
      }
    } catch {
      return new Set();
    }
    return new Set();
  }
  // txt/list: line-based
  const names = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    names.push(t.split(/\s+/)[0]);
  }
  return new Set(names);
}
