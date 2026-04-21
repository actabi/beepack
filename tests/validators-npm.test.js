import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNpmPackage, validateNpmPackages, encodeNpmPackageName } from '../validators/npm.js';
import { createMemoryCache } from '../validators/cache.js';

function mockFetch(handlers) {
  return async function fetchMock(url) {
    for (const { match, respond } of handlers) {
      if (match(url)) return respond(url);
    }
    return jsonResponse(404, { error: 'not found' });
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

test('encodeNpmPackageName handles scoped packages', () => {
  assert.equal(encodeNpmPackageName('express'), 'express');
  assert.equal(encodeNpmPackageName('@scope/pkg'), '%40scope%2Fpkg');
});

test('validateNpmPackage returns exists:true with metadata for known package', async () => {
  const fetchImpl = mockFetch([
    {
      match: u => u.includes('registry.npmjs.org/express'),
      respond: () => jsonResponse(200, {
        'dist-tags': { latest: '4.19.2' },
        versions: { '4.19.2': { description: 'Fast web framework' } },
        time: { '4.19.2': '2024-03-25T00:00:00.000Z' },
        maintainers: [{ name: 'dougwilson' }, { name: 'wesleytodd' }],
      }),
    },
    {
      match: u => u.includes('downloads/point/last-week/express'),
      respond: () => jsonResponse(200, { downloads: 30000000 }),
    },
  ]);

  const result = await validateNpmPackage('express', { cache: createMemoryCache(), fetch: fetchImpl });
  assert.equal(result.exists, true);
  assert.equal(result.status, 200);
  assert.equal(result.latest, '4.19.2');
  assert.equal(result.lastPublishAt, '2024-03-25T00:00:00.000Z');
  assert.deepEqual(result.maintainers, ['dougwilson', 'wesleytodd']);
  assert.equal(result.weeklyDownloads, 30000000);
  assert.equal(result.description, 'Fast web framework');
});

test('validateNpmPackage returns exists:false for 404', async () => {
  const fetchImpl = mockFetch([
    { match: u => true, respond: () => jsonResponse(404, {}) },
  ]);
  const result = await validateNpmPackage('definitely-does-not-exist-xyz', { cache: createMemoryCache(), fetch: fetchImpl });
  assert.equal(result.exists, false);
  assert.equal(result.status, 404);
});

test('validateNpmPackage caches successful results', async () => {
  const cache = createMemoryCache();
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    if (url.includes('registry.npmjs.org/')) {
      return jsonResponse(200, { 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': {} }, time: { '1.0.0': '2025-01-01' } });
    }
    return jsonResponse(200, { downloads: 1 });
  };

  await validateNpmPackage('foo', { cache, fetch: fetchImpl });
  const callsAfterFirst = calls;
  await validateNpmPackage('foo', { cache, fetch: fetchImpl });
  assert.equal(calls, callsAfterFirst, 'second call should hit cache');
});

test('validateNpmPackage does NOT cache network errors', async () => {
  const cache = createMemoryCache();
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    throw new Error('network down');
  };
  const r1 = await validateNpmPackage('foo', { cache, fetch: fetchImpl });
  assert.equal(r1.exists, false);
  assert.equal(r1.error, 'network down');
  await validateNpmPackage('foo', { cache, fetch: fetchImpl });
  assert.equal(calls, 2, 'network failure should not be cached');
});

test('validateNpmPackage handles scoped package URL encoding', async () => {
  let seenUrl = null;
  const fetchImpl = async (url) => {
    seenUrl = url;
    return jsonResponse(200, { 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': {} }, time: {} });
  };
  await validateNpmPackage('@anthropic-ai/claude-code', { cache: createMemoryCache(), fetch: fetchImpl });
  assert.ok(seenUrl.includes('%40anthropic-ai%2Fclaude-code'), `expected encoded URL, got ${seenUrl}`);
});

test('validateNpmPackages batches and preserves order', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('downloads/')) return jsonResponse(200, { downloads: 0 });
    const m = url.match(/registry\.npmjs\.org\/(.+)$/);
    const name = decodeURIComponent(m[1]);
    if (name === 'missing') return jsonResponse(404, {});
    return jsonResponse(200, { 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': {} }, time: {} });
  };
  const results = await validateNpmPackages(['foo', 'missing', 'bar'], { cache: createMemoryCache(), fetch: fetchImpl, concurrency: 2 });
  assert.equal(results.length, 3);
  assert.equal(results[0].name, 'foo');
  assert.equal(results[0].exists, true);
  assert.equal(results[1].name, 'missing');
  assert.equal(results[1].exists, false);
  assert.equal(results[2].name, 'bar');
  assert.equal(results[2].exists, true);
});

test('validateNpmPackages dedupes identical names', async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    if (url.includes('downloads/')) return jsonResponse(200, { downloads: 0 });
    calls++;
    return jsonResponse(200, { 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': {} }, time: {} });
  };
  await validateNpmPackages(['foo', 'foo', 'foo'], { cache: createMemoryCache(), fetch: fetchImpl });
  assert.equal(calls, 1, 'dedupe before fetching');
});

test('validateNpmPackage rejects invalid name input', async () => {
  const r = await validateNpmPackage('', { cache: createMemoryCache(), fetch: async () => jsonResponse(200, {}) });
  assert.equal(r.exists, false);
  assert.equal(r.error, 'invalid_name');
});
