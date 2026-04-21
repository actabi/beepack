/**
 * Verdict aggregator
 *
 * Combines results from validators into a single RED / YELLOW / GREEN verdict
 * with a readable summary and a flat list of findings.
 *
 * Rules (in evaluation order):
 *   RED:
 *     - any npm/pip package returns 404 (does_not_exist)
 *     - any typosquat with confidence > 0.9 (distance 1 from a popular package)
 *     - any URL with a 'block' severity finding (URLhaus match)
 *   YELLOW:
 *     - any typosquat with confidence <= 0.9
 *     - any URL with young_domain or pastebin_or_tunnel finding
 *     - skill has no detectable dependencies or commands ("nothing to scan")
 *   GREEN:
 *     - all packages exist, no typosquats, no URL warnings
 */

const SEVERITY = { block: 'red', warn: 'yellow', info: 'green' };

/**
 * @param {object} parsed - output from parseSkill
 * @param {object} inputs
 * @param {Array} inputs.npm - npm validator results
 * @param {Array} inputs.pip - pip validator results (optional - may be empty)
 * @param {Array} inputs.urls - url validator results
 * @param {Array} inputs.typosquats - typosquat finder output
 * @returns {{verdict:'red'|'yellow'|'green', summary:string, findings:Array<object>}}
 */
export function aggregateVerdict(parsed, inputs) {
  const findings = [];
  const npm = inputs.npm || [];
  const pip = inputs.pip || [];
  const urls = inputs.urls || [];
  const typosquats = inputs.typosquats || [];

  // 1. Missing packages (RED)
  for (const r of npm) {
    if (!r.exists && r.status === 404) {
      const locations = locateNpmUsage(parsed, r.name);
      findings.push({
        severity: 'block',
        type: 'package_does_not_exist',
        ecosystem: 'npm',
        package: r.name,
        message: `npm package "${r.name}" does not exist on the registry`,
        locations,
      });
    }
  }
  for (const r of pip) {
    if (!r.exists && r.status === 404) {
      const locations = locatePipUsage(parsed, r.name);
      findings.push({
        severity: 'block',
        type: 'package_does_not_exist',
        ecosystem: 'pypi',
        package: r.name,
        message: `pypi package "${r.name}" does not exist on PyPI`,
        locations,
      });
    }
  }

  // 2. Typosquats
  for (const t of typosquats) {
    const severity = t.confidence > 0.9 ? 'block' : 'warn';
    findings.push({
      severity,
      type: 'possible_typosquat',
      ecosystem: t.ecosystem,
      package: t.name,
      likelyTarget: t.likelyTarget,
      distance: t.distance,
      confidence: t.confidence,
      message: `"${t.name}" looks like "${t.likelyTarget}" (distance ${t.distance}, ${t.reason})`,
      locations: t.ecosystem === 'pypi' ? locatePipUsage(parsed, t.name) : locateNpmUsage(parsed, t.name),
    });
  }

  // 3. URL findings
  for (const u of urls) {
    for (const f of u.findings || []) {
      findings.push({
        severity: f.severity === 'block' ? 'block' : 'warn',
        type: f.type,
        url: u.url,
        host: u.host,
        message: describeUrlFinding(u, f),
        detail: f.detail,
      });
    }
  }

  // 4. Empty skill (YELLOW)
  const hasSomething =
    (parsed.npmPackages?.length || 0) +
    (parsed.pipPackages?.length || 0) +
    (parsed.urls?.length || 0) +
    (parsed.shellCommands?.length || 0) > 0;

  if (!hasSomething) {
    findings.push({
      severity: 'warn',
      type: 'nothing_to_scan',
      message: 'skill has no detectable dependencies, URLs, or shell commands',
    });
  }

  // Decide verdict
  const verdict = findings.some(f => f.severity === 'block')
    ? 'red'
    : findings.some(f => f.severity === 'warn')
      ? 'yellow'
      : 'green';

  return {
    verdict,
    summary: summarize(verdict, findings),
    findings,
  };
}

function describeUrlFinding(u, f) {
  switch (f.type) {
    case 'urlhaus_match':
      return `URL matches URLhaus blocklist: ${u.url}`;
    case 'pastebin_or_tunnel':
      return `URL uses pastebin or tunnel host (${u.host}): ${u.url}`;
    case 'young_domain':
      return `Domain ${u.host} is recently registered (${f.detail})`;
    case 'invalid_url':
      return `Invalid URL: ${u.url}`;
    default:
      return `URL issue (${f.type}): ${u.url}`;
  }
}

function summarize(verdict, findings) {
  if (findings.length === 0) return 'All checks passed';
  const blocks = findings.filter(f => f.severity === 'block');
  const warns = findings.filter(f => f.severity === 'warn');
  const parts = [];
  if (blocks.length) parts.push(`${blocks.length} critical`);
  if (warns.length) parts.push(`${warns.length} warning${warns.length > 1 ? 's' : ''}`);
  const lead = parts.join(', ');
  const top = (blocks[0] || warns[0]);
  return top ? `${lead}: ${top.message}` : lead;
}

function locateNpmUsage(parsed, name) {
  const hits = [];
  for (const p of parsed.npmPackages || []) {
    if (p.name === name) hits.push({ source: p.source, line: p.line, reason: p.reason });
  }
  return hits;
}

function locatePipUsage(parsed, name) {
  const hits = [];
  for (const p of parsed.pipPackages || []) {
    if (p.name === name) hits.push({ source: p.source, line: p.line, reason: p.reason });
  }
  return hits;
}
