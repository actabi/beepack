/**
 * beepack scan <url-or-path>
 *
 * Scans a Claude Code skill for hallucinated packages, typosquats, and risky URLs.
 * Calls the beepack.ai scan API (or local dev server if BEEPACK_API is set).
 *
 * Exit codes:
 *   0 → GREEN (safe)
 *   1 → YELLOW (warnings)
 *   2 → RED (block)
 *   3 → fetch / network error
 */

import chalk from 'chalk';
import ora from 'ora';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, basename, dirname, resolve } from 'path';

const API_BASE = process.env.BEEPACK_API || 'https://beepack.ai/api/v1';

const SCRIPT_EXTS = ['.sh', '.bash', '.zsh', '.py', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'];

export async function scan(target, opts = {}) {
  const spinner = ora('Scanning...').start();
  let payload;

  try {
    if (looksLikeUrl(target)) {
      payload = { url: target };
    } else {
      payload = buildLocalPayload(target);
    }
  } catch (err) {
    spinner.fail(err.message);
    process.exit(3);
  }

  let result;
  try {
    const res = await fetch(`${API_BASE}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      spinner.fail(`Scan failed: ${data.error?.message || res.statusText}`);
      process.exit(3);
    }
    result = data;
  } catch (err) {
    spinner.fail(`Network error: ${err.message}`);
    process.exit(3);
  }

  spinner.stop();

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    renderHuman(result);
  }

  // Exit codes
  if (result.verdict === 'red') process.exit(2);
  if (result.verdict === 'yellow') process.exit(opts.strict ? 2 : 1);
  process.exit(0);
}

function looksLikeUrl(s) {
  return /^https?:\/\//i.test(s);
}

function buildLocalPayload(targetPath) {
  const abs = resolve(targetPath);
  if (!existsSync(abs)) throw new Error(`path not found: ${targetPath}`);

  const stat = statSync(abs);
  if (stat.isFile()) {
    const markdown = readFileSync(abs, 'utf-8');
    return { markdown, source: basename(abs), scripts: [] };
  }

  // Directory: find SKILL.md (case-insensitive) + same-dir scripts
  const entries = readdirSync(abs);
  const mdName = entries.find(e => /^skill\.md$/i.test(e)) || entries.find(e => /\.md$/i.test(e));
  if (!mdName) throw new Error(`no SKILL.md found in ${targetPath}`);

  const markdown = readFileSync(join(abs, mdName), 'utf-8');
  const scripts = [];
  for (const name of entries) {
    if (name === mdName) continue;
    const p = join(abs, name);
    if (!statSync(p).isFile()) continue;
    if (!SCRIPT_EXTS.some(ext => name.toLowerCase().endsWith(ext))) continue;
    scripts.push({ name, content: readFileSync(p, 'utf-8') });
  }

  return { markdown, source: basename(abs), scripts };
}

function renderHuman(result) {
  const { verdict, summary, findings, stats, scanId } = result;
  const badge = verdict === 'red'
    ? chalk.bgRed.white.bold(' RED ')
    : verdict === 'yellow'
      ? chalk.bgYellow.black.bold(' YELLOW ')
      : chalk.bgGreen.white.bold(' GREEN ');

  console.log('');
  console.log(`${badge}  ${chalk.bold(summary)}`);
  console.log('');
  console.log(chalk.dim(
    `npm:${stats.npmPackages}  pip:${stats.pipPackages}  urls:${stats.urls}  shell:${stats.shellCommands}  imports:${stats.imports}`
  ));
  console.log('');

  if (!findings.length) {
    console.log(chalk.green('✓ No issues detected.'));
  } else {
    for (const f of findings) {
      const sev = f.severity === 'block'
        ? chalk.red.bold('BLOCK')
        : chalk.yellow.bold('WARN ');
      console.log(`  ${sev}  ${chalk.dim(f.type)}  ${f.message || ''}`);
      if (Array.isArray(f.locations) && f.locations.length) {
        for (const l of f.locations) {
          console.log(chalk.dim(`         at ${l.source}:${l.line} (${l.reason})`));
        }
      }
    }
  }

  console.log('');
  console.log(chalk.dim(`Scan ID: ${scanId}`));
  console.log(chalk.dim(`View online: ${API_BASE.replace('/api/v1', '')}/scan?id=${scanId}`));
}
