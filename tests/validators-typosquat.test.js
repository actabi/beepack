import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'os';
import { writeFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { levenshtein, detectTyposquats, loadTopList } from '../validators/typosquat.js';

test('levenshtein basic distances', () => {
  assert.equal(levenshtein('', ''), 0);
  assert.equal(levenshtein('abc', 'abc'), 0);
  assert.equal(levenshtein('abc', 'abd'), 1);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('flask', 'falsk'), 2);
  assert.equal(levenshtein('', 'foo'), 3);
});

test('detectTyposquats flags distance-1 against top-list', () => {
  const npmTop = new Set(['react', 'express', 'lodash', 'axios']);
  const findings = detectTyposquats(
    [
      { name: 'expresss', ecosystem: 'npm' }, // extra s
      { name: 'reactt', ecosystem: 'npm' },   // extra t
    ],
    { npmTop }
  );
  assert.equal(findings.length, 2);
  const ex = findings.find(f => f.name === 'expresss');
  assert.equal(ex.likelyTarget, 'express');
  assert.equal(ex.distance, 1);
  assert.equal(ex.confidence, 0.95);
  assert.equal(ex.reason, 'levenshtein');
});

test('detectTyposquats skips packages in the top-list', () => {
  const npmTop = new Set(['react', 'express']);
  const findings = detectTyposquats(
    [{ name: 'react', ecosystem: 'npm' }, { name: 'express', ecosystem: 'npm' }],
    { npmTop }
  );
  assert.equal(findings.length, 0);
});

test('detectTyposquats ignores unrelated names', () => {
  const npmTop = new Set(['react', 'express', 'lodash']);
  const findings = detectTyposquats(
    [{ name: 'siret-utils', ecosystem: 'npm' }],
    { npmTop }
  );
  assert.equal(findings.length, 0);
});

test('detectTyposquats flags suspicious suffix -js', () => {
  const npmTop = new Set(['stripe']);
  const findings = detectTyposquats(
    [{ name: 'stripe-js', ecosystem: 'npm' }],
    { npmTop }
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].likelyTarget, 'stripe');
  assert.equal(findings[0].reason, 'suspicious_suffix:-js');
});

test('detectTyposquats strips scope when comparing stems', () => {
  const npmTop = new Set(['claude-code']);
  const findings = detectTyposquats(
    [{ name: '@fake-ai/claude-cod', ecosystem: 'npm' }], // distance 1 from claude-code
    { npmTop }
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].likelyTarget, 'claude-code');
  assert.equal(findings[0].distance, 1);
});

test('detectTyposquats uses pipTop for pypi ecosystem', () => {
  const pipTop = new Set(['requests', 'flask']);
  const findings = detectTyposquats(
    [
      { name: 'reqeusts', ecosystem: 'pypi' }, // swapped letters
      { name: 'falsk', ecosystem: 'pypi' },
    ],
    { pipTop }
  );
  assert.ok(findings.find(f => f.name === 'reqeusts'));
  assert.ok(findings.find(f => f.name === 'falsk'));
});

test('detectTyposquats returns no findings when top-list is empty', () => {
  const findings = detectTyposquats(
    [{ name: 'anything', ecosystem: 'npm' }],
    {}
  );
  assert.equal(findings.length, 0);
});

test('loadTopList reads a .txt file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'beepack-top-'));
  const path = join(dir, 'top.txt');
  writeFileSync(path, '# comment\nreact\nexpress  3000000\n\n# another\nlodash\n', 'utf-8');
  const set = loadTopList(path);
  assert.equal(set.size, 3);
  assert.ok(set.has('react'));
  assert.ok(set.has('express'));
  assert.ok(set.has('lodash'));
});

test('loadTopList reads a JSON array', () => {
  const dir = mkdtempSync(join(tmpdir(), 'beepack-top-'));
  const path = join(dir, 'top.json');
  writeFileSync(path, JSON.stringify(['react', 'express']), 'utf-8');
  const set = loadTopList(path);
  assert.equal(set.size, 2);
});

test('loadTopList reads a JSON object { packages: [...] }', () => {
  const dir = mkdtempSync(join(tmpdir(), 'beepack-top-'));
  const path = join(dir, 'top.json');
  writeFileSync(path, JSON.stringify({ packages: ['react', 'vue'] }), 'utf-8');
  const set = loadTopList(path);
  assert.ok(set.has('react'));
  assert.ok(set.has('vue'));
});

test('loadTopList returns empty set for missing file', () => {
  const set = loadTopList('/path/does/not/exist.txt');
  assert.equal(set.size, 0);
});
