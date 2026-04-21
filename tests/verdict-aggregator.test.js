import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateVerdict } from '../verdict-aggregator.js';

const emptyParsed = { shellCommands: [], urls: [], npmPackages: [], pipPackages: [], imports: [], fileRefs: [] };

test('aggregateVerdict returns yellow for empty skill', () => {
  const v = aggregateVerdict(emptyParsed, {});
  assert.equal(v.verdict, 'yellow');
  assert.ok(v.findings.some(f => f.type === 'nothing_to_scan'));
});

test('aggregateVerdict returns green when everything is clean', () => {
  const parsed = { ...emptyParsed, npmPackages: [{ name: 'react', reason: 'import', source: 'SKILL.md', line: 3 }] };
  const v = aggregateVerdict(parsed, {
    npm: [{ name: 'react', exists: true, status: 200 }],
    urls: [],
    typosquats: [],
  });
  assert.equal(v.verdict, 'green');
  assert.equal(v.findings.length, 0);
});

test('aggregateVerdict returns red for missing npm package', () => {
  const parsed = { ...emptyParsed, npmPackages: [{ name: 'hallucinated-pkg', reason: 'npx', source: 'SKILL.md', line: 5 }] };
  const v = aggregateVerdict(parsed, {
    npm: [{ name: 'hallucinated-pkg', exists: false, status: 404 }],
    urls: [],
    typosquats: [],
  });
  assert.equal(v.verdict, 'red');
  const miss = v.findings.find(f => f.type === 'package_does_not_exist');
  assert.equal(miss.severity, 'block');
  assert.equal(miss.package, 'hallucinated-pkg');
  assert.deepEqual(miss.locations, [{ source: 'SKILL.md', line: 5, reason: 'npx' }]);
});

test('aggregateVerdict returns red for high-confidence typosquat (distance 1)', () => {
  const parsed = { ...emptyParsed, npmPackages: [{ name: 'expresss', reason: 'npx', source: 'SKILL.md', line: 2 }] };
  const v = aggregateVerdict(parsed, {
    npm: [{ name: 'expresss', exists: true, status: 200 }], // exists but typosquat
    urls: [],
    typosquats: [{ name: 'expresss', ecosystem: 'npm', likelyTarget: 'express', distance: 1, confidence: 0.9, reason: 'levenshtein' }],
  });
  // confidence > 0.9 means strictly greater; 0.9 is warn. Test with 0.95 for block.
  assert.equal(v.verdict, 'yellow');

  const v2 = aggregateVerdict(parsed, {
    npm: [{ name: 'expresss', exists: true, status: 200 }],
    urls: [],
    typosquats: [{ name: 'expresss', ecosystem: 'npm', likelyTarget: 'express', distance: 1, confidence: 0.95, reason: 'levenshtein' }],
  });
  assert.equal(v2.verdict, 'red');
});

test('aggregateVerdict returns red for URLhaus block', () => {
  const parsed = { ...emptyParsed, urls: [{ url: 'https://bad.example/x', source: 'SKILL.md', line: 1 }] };
  const v = aggregateVerdict(parsed, {
    npm: [],
    urls: [{ url: 'https://bad.example/x', host: 'bad.example', trusted: false, findings: [{ severity: 'block', type: 'urlhaus_match', detail: 'listed' }] }],
    typosquats: [],
  });
  assert.equal(v.verdict, 'red');
  assert.ok(v.findings.find(f => f.type === 'urlhaus_match' && f.severity === 'block'));
});

test('aggregateVerdict returns yellow for young domain only', () => {
  const parsed = { ...emptyParsed, urls: [{ url: 'https://new-domain.example/x', source: 'SKILL.md', line: 1 }] };
  const v = aggregateVerdict(parsed, {
    npm: [],
    urls: [{ url: 'https://new-domain.example/x', host: 'new-domain.example', trusted: false, findings: [{ severity: 'warn', type: 'young_domain', detail: 'registered 5d ago' }] }],
    typosquats: [],
  });
  assert.equal(v.verdict, 'yellow');
  const yd = v.findings.find(f => f.type === 'young_domain');
  assert.equal(yd.severity, 'warn');
  assert.ok(yd.message.includes('recently registered'));
});

test('aggregateVerdict returns yellow for pastebin/tunnel URL', () => {
  const parsed = { ...emptyParsed, urls: [{ url: 'https://abc.ngrok.io/x', source: 'SKILL.md', line: 1 }] };
  const v = aggregateVerdict(parsed, {
    npm: [],
    urls: [{ url: 'https://abc.ngrok.io/x', host: 'abc.ngrok.io', trusted: false, findings: [{ severity: 'warn', type: 'pastebin_or_tunnel', detail: 'abc.ngrok.io' }] }],
    typosquats: [],
  });
  assert.equal(v.verdict, 'yellow');
});

test('aggregateVerdict escalates red when multiple severities present', () => {
  const parsed = { ...emptyParsed, npmPackages: [{ name: 'fake', reason: 'npx', source: 'SKILL.md', line: 1 }] };
  const v = aggregateVerdict(parsed, {
    npm: [{ name: 'fake', exists: false, status: 404 }],
    urls: [{ url: 'https://abc.ngrok.io/x', host: 'abc.ngrok.io', trusted: false, findings: [{ severity: 'warn', type: 'pastebin_or_tunnel' }] }],
    typosquats: [],
  });
  assert.equal(v.verdict, 'red');
  assert.ok(v.summary.includes('critical'));
});

test('aggregateVerdict summary mentions first issue when green/yellow/red', () => {
  const parsed = { ...emptyParsed, npmPackages: [{ name: 'foo', reason: 'npx', source: 'SKILL.md', line: 1 }] };
  const green = aggregateVerdict(parsed, { npm: [{ name: 'foo', exists: true, status: 200 }] });
  assert.equal(green.summary, 'All checks passed');
});
