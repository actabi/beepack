import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateUrls,
  isTrustedHost,
  isPastebinOrTunnel,
  registrableDomain,
  parseUrlhausFile,
} from '../validators/urls.js';
import { createMemoryCache } from '../validators/cache.js';

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

test('isTrustedHost matches whitelist and subdomains', () => {
  assert.equal(isTrustedHost('github.com'), true);
  assert.equal(isTrustedHost('raw.githubusercontent.com'), true);
  assert.equal(isTrustedHost('docs.anthropic.com'), true);
  assert.equal(isTrustedHost('evil.com'), false);
  assert.equal(isTrustedHost('githubusercontent.com'), false); // not exact, not subdomain of trusted
});

test('isPastebinOrTunnel detects hosts and suffixes', () => {
  assert.equal(isPastebinOrTunnel('pastebin.com'), true);
  assert.equal(isPastebinOrTunnel('abc123.ngrok.io'), true);
  assert.equal(isPastebinOrTunnel('foo.trycloudflare.com'), true);
  assert.equal(isPastebinOrTunnel('example.com'), false);
});

test('registrableDomain strips subdomains and handles multi-level TLDs', () => {
  assert.equal(registrableDomain('example.com'), 'example.com');
  assert.equal(registrableDomain('foo.example.com'), 'example.com');
  assert.equal(registrableDomain('foo.bar.example.co.uk'), 'example.co.uk');
});

test('validateUrls marks trusted hosts as trusted, emits no findings', async () => {
  const fetchImpl = async () => { throw new Error('should not call'); };
  const results = await validateUrls(['https://github.com/foo/bar', 'https://raw.githubusercontent.com/x'], { fetch: fetchImpl, skipWhois: true });
  assert.equal(results.length, 2);
  assert.ok(results.every(r => r.trusted));
  assert.ok(results.every(r => r.findings.length === 0));
});

test('validateUrls flags pastebin/tunnel domains', async () => {
  const results = await validateUrls(['https://abc123.ngrok.io/script.sh'], { skipWhois: true });
  assert.equal(results.length, 1);
  const f = results[0].findings.find(x => x.type === 'pastebin_or_tunnel');
  assert.ok(f, 'should flag ngrok tunnel');
  assert.equal(f.severity, 'warn');
});

test('validateUrls emits block finding for URLhaus match', async () => {
  const results = await validateUrls(
    ['https://malicious.example/script.sh'],
    { blocklist: new Set(['https://malicious.example/script.sh']), skipWhois: true }
  );
  const block = results[0].findings.find(f => f.type === 'urlhaus_match');
  assert.ok(block);
  assert.equal(block.severity, 'block');
});

test('validateUrls emits block finding for URLhaus host match', async () => {
  const results = await validateUrls(
    ['https://bad-host.example/anything'],
    { blockedHosts: new Set(['bad-host.example']), skipWhois: true }
  );
  const block = results[0].findings.find(f => f.type === 'urlhaus_match');
  assert.ok(block);
});

test('validateUrls flags young domain via RDAP', async () => {
  const cache = createMemoryCache();
  const now = Date.parse('2026-04-20T00:00:00Z');
  const registered = new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(); // 10 days ago
  const fetchImpl = async () => jsonResponse(200, {
    events: [{ eventAction: 'registration', eventDate: registered }],
  });
  const results = await validateUrls(['https://fresh-domain.example/foo'], { cache, fetch: fetchImpl, now });
  const young = results[0].findings.find(f => f.type === 'young_domain');
  assert.ok(young);
  assert.ok(young.detail.includes('10d'));
});

test('validateUrls does not flag old domains', async () => {
  const cache = createMemoryCache();
  const now = Date.parse('2026-04-20T00:00:00Z');
  const old = new Date(now - 5 * 365 * 24 * 60 * 60 * 1000).toISOString();
  const fetchImpl = async () => jsonResponse(200, {
    events: [{ eventAction: 'registration', eventDate: old }],
  });
  const results = await validateUrls(['https://old-domain.example/foo'], { cache, fetch: fetchImpl, now });
  assert.equal(results[0].findings.filter(f => f.type === 'young_domain').length, 0);
});

test('validateUrls caches RDAP lookups across calls', async () => {
  const cache = createMemoryCache();
  let calls = 0;
  const fetchImpl = async () => { calls++; return jsonResponse(200, { events: [] }); };
  await validateUrls(['https://example.test/a'], { cache, fetch: fetchImpl });
  await validateUrls(['https://example.test/b'], { cache, fetch: fetchImpl });
  assert.equal(calls, 1, 'second lookup for same domain should hit cache');
});

test('validateUrls handles invalid URL gracefully', async () => {
  const results = await validateUrls(['not a url'], { skipWhois: true });
  assert.equal(results[0].findings[0].type, 'invalid_url');
});

test('validateUrls dedupes identical URLs', async () => {
  const results = await validateUrls(['https://example.test/a', 'https://example.test/a'], { skipWhois: true });
  assert.equal(results.length, 1);
});

test('parseUrlhausFile parses CSV rows', () => {
  const csv = [
    '# comment',
    '"1","2025-01-01","http://bad.example/a","online","malware","tag","link","reporter"',
    '"2","2025-01-02","http://bad.example/b","online","c2","","",""',
  ].join('\n');
  const { urls, hosts } = parseUrlhausFile(csv);
  assert.ok(urls.has('http://bad.example/a'));
  assert.ok(urls.has('http://bad.example/b'));
  assert.ok(hosts.has('bad.example'));
});

test('parseUrlhausFile handles plain URL-per-line format', () => {
  const txt = 'https://x.example/1\nhttps://y.example/2\n# comment\n';
  const { urls, hosts } = parseUrlhausFile(txt);
  assert.equal(urls.size, 2);
  assert.ok(hosts.has('x.example'));
});
