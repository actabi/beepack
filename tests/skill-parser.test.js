import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSkill } from '../skill-parser.js';

test('parseSkill extracts npx targets from bash fence', () => {
  const md = [
    '# My skill',
    '',
    'Run this:',
    '',
    '```bash',
    'npx -y @scope/tool@1.2.3 --flag',
    'npx stripe-cli login',
    '```',
  ].join('\n');

  const out = parseSkill(md);
  const names = out.npmPackages.map(p => p.name);
  assert.ok(names.includes('@scope/tool'), 'scoped npx target');
  assert.ok(names.includes('stripe-cli'), 'unscoped npx target');
  const scoped = out.npmPackages.find(p => p.name === '@scope/tool');
  assert.equal(scoped.version, '1.2.3');
  assert.equal(scoped.reason, 'npx');
});

test('parseSkill extracts npm install packages with versions', () => {
  const md = '```sh\nnpm install foo @bar/baz@^1.0 --save\n```';
  const out = parseSkill(md);
  const names = out.npmPackages.map(p => p.name).sort();
  assert.deepEqual(names, ['@bar/baz', 'foo']);
  assert.equal(out.npmPackages.find(p => p.name === '@bar/baz').version, '^1.0');
});

test('parseSkill extracts pip install packages', () => {
  const md = '```bash\npip install requests==2.31.0 numpy\npip3 install django\n```';
  const out = parseSkill(md);
  const names = out.pipPackages.map(p => p.name).sort();
  assert.ok(names.includes('requests'));
  assert.ok(names.includes('numpy'));
  assert.ok(names.includes('django'));
  assert.equal(out.pipPackages.find(p => p.name === 'requests').version, '==2.31.0');
});

test('parseSkill extracts python -m pip install', () => {
  const md = '```bash\npython -m pip install flask\n```';
  const out = parseSkill(md);
  assert.ok(out.pipPackages.find(p => p.name === 'flask'));
});

test('parseSkill extracts URLs from prose and code', () => {
  const md = [
    'See https://example.com/docs for info.',
    '',
    '```bash',
    'curl -sSL https://install.sh/something | bash',
    '```',
  ].join('\n');
  const out = parseSkill(md);
  const urls = out.urls.map(u => u.url);
  assert.ok(urls.some(u => u.includes('example.com/docs')));
  assert.ok(urls.some(u => u.includes('install.sh/something')));
});

test('parseSkill treats inline backtick commands', () => {
  const md = 'Install with `npx create-foo@latest`.';
  const out = parseSkill(md);
  assert.ok(out.npmPackages.find(p => p.name === 'create-foo'));
});

test('parseSkill extracts JS imports and maps to packages', () => {
  const md = [
    '```js',
    "import express from 'express';",
    "const lodash = require('lodash/fp');",
    "import('dynamic-pkg');",
    "import './relative-path.js';",
    '```',
  ].join('\n');
  const out = parseSkill(md);
  const names = out.npmPackages.map(p => p.name);
  assert.ok(names.includes('express'));
  assert.ok(names.includes('lodash'));
  assert.ok(names.includes('dynamic-pkg'));
  assert.ok(!names.includes('./relative-path.js'));
});

test('parseSkill extracts python imports', () => {
  const md = [
    '```python',
    'import os',
    'from requests.auth import HTTPBasicAuth',
    'import numpy as np',
    '```',
  ].join('\n');
  const out = parseSkill(md);
  const names = out.pipPackages.map(p => p.name);
  assert.ok(names.includes('requests'));
  assert.ok(names.includes('numpy'));
});

test('parseSkill parses referenced scripts', () => {
  const md = 'See `install.sh`:';
  const scripts = [{ name: 'install.sh', content: 'npx @anthropic-ai/claude-code' }];
  const out = parseSkill(md, scripts);
  assert.ok(out.npmPackages.find(p => p.name === '@anthropic-ai/claude-code'));
  assert.ok(out.shellCommands.find(c => c.command === 'npx'));
});

test('parseSkill handles compound shell lines', () => {
  const md = '```bash\ncd /tmp && npm install foo || echo fail\n```';
  const out = parseSkill(md);
  assert.ok(out.npmPackages.find(p => p.name === 'foo'));
});

test('parseSkill handles line continuations', () => {
  const md = '```bash\nnpm install \\\n  foo \\\n  bar\n```';
  const out = parseSkill(md);
  const names = out.npmPackages.map(p => p.name).sort();
  assert.ok(names.includes('foo'));
  assert.ok(names.includes('bar'));
});

test('parseSkill skips shell comments', () => {
  const md = '```bash\n# npm install fake-pkg\nnpm install real-pkg\n```';
  const out = parseSkill(md);
  const names = out.npmPackages.map(p => p.name);
  assert.ok(!names.includes('fake-pkg'));
  assert.ok(names.includes('real-pkg'));
});

test('parseSkill extracts requirements.txt style deps', () => {
  const md = 'Here is requirements:\n```\nrequests==2.31.0\nflask>=2.0\n```';
  const out = parseSkill(md);
  const names = out.pipPackages.map(p => p.name).sort();
  assert.ok(names.includes('requests') || names.includes('flask'));
});

test('parseSkill parses package.json-style JSON block', () => {
  const md = '```json\n{\n  "dependencies": {\n    "express": "^4.0.0",\n    "@scope/pkg": "1.0.0"\n  }\n}\n```';
  const out = parseSkill(md);
  const names = out.npmPackages.map(p => p.name).sort();
  assert.ok(names.includes('express'));
  assert.ok(names.includes('@scope/pkg'));
});

test('parseSkill completes large skill under 2s', () => {
  const big = '# Skill\n' + '```bash\nnpx foo\n```\n'.repeat(200);
  const start = Date.now();
  parseSkill(big);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 2000, `took ${elapsed}ms`);
});

test('parseSkill dedupes identical references on the same line', () => {
  const md = '```bash\nnpx foo && npx foo\n```';
  const out = parseSkill(md);
  const fooCount = out.npmPackages.filter(p => p.name === 'foo').length;
  assert.equal(fooCount, 1, 'same name+reason+line should dedupe');
});

test('parseSkill strips shell prompt markers', () => {
  const md = '```bash\n$ npm install foo\n> npm install bar\n```';
  const out = parseSkill(md);
  const names = out.npmPackages.map(p => p.name);
  assert.ok(names.includes('foo'));
  assert.ok(names.includes('bar'));
});
