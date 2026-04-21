import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { initScanStore, saveScan, getScan, listRecentScans, scanStats } from '../scan-store.js';

function freshDb() {
  const db = new Database(':memory:');
  initScanStore(db);
  return db;
}

function fakeScan(id, verdict, source = 'https://github.com/foo/bar', stats = {}) {
  return {
    scanId: id,
    scannedAt: new Date().toISOString(),
    source,
    verdict,
    summary: `${verdict} test`,
    findings: [],
    stats: { shellCommands: 1, urls: 0, npmPackages: 1, pipPackages: 0, imports: 0, ...stats },
  };
}

test('saveScan + getScan round-trips', () => {
  const db = freshDb();
  const s = fakeScan('abc-1', 'green');
  saveScan(db, s, { ipHash: 'hash1' });
  const back = getScan(db, 'abc-1');
  assert.equal(back.scanId, 'abc-1');
  assert.equal(back.verdict, 'green');
  assert.equal(back.source, 'https://github.com/foo/bar');
  assert.deepEqual(back.findings, []);
});

test('getScan returns null for missing id', () => {
  const db = freshDb();
  assert.equal(getScan(db, 'missing'), null);
});

test('listRecentScans returns DESC by created_at', () => {
  const db = freshDb();
  const now = Date.now();
  saveScan(db, { ...fakeScan('a', 'green'), scannedAt: new Date(now - 3000).toISOString() });
  saveScan(db, { ...fakeScan('b', 'yellow'), scannedAt: new Date(now - 1000).toISOString() });
  saveScan(db, { ...fakeScan('c', 'red'), scannedAt: new Date(now).toISOString() });
  const recent = listRecentScans(db, 10);
  assert.equal(recent.length, 3);
  assert.equal(recent[0].scanId, 'c');
  assert.equal(recent[2].scanId, 'a');
});

test('scanStats counts by verdict and unique IPs', () => {
  const db = freshDb();
  saveScan(db, fakeScan('a', 'green'), { ipHash: 'h1' });
  saveScan(db, fakeScan('b', 'red'), { ipHash: 'h1' });
  saveScan(db, fakeScan('c', 'red'), { ipHash: 'h2' });
  saveScan(db, fakeScan('d', 'yellow'), { ipHash: 'h3' });
  const stats = scanStats(db, { sinceMs: 0 });
  assert.equal(stats.total, 4);
  assert.equal(stats.uniqueIps, 3);
  assert.equal(stats.byVerdict.green, 1);
  assert.equal(stats.byVerdict.red, 2);
  assert.equal(stats.byVerdict.yellow, 1);
});

test('scanStats topSources excludes paste', () => {
  const db = freshDb();
  saveScan(db, fakeScan('a', 'green', 'https://github.com/x/a'));
  saveScan(db, fakeScan('b', 'green', 'https://github.com/x/a'));
  saveScan(db, fakeScan('c', 'green', 'paste'));
  const stats = scanStats(db, { sinceMs: 0 });
  const paste = stats.topSources.find(s => s.source === 'paste');
  assert.equal(paste, undefined);
  const github = stats.topSources.find(s => s.source === 'https://github.com/x/a');
  assert.equal(github.n, 2);
});
