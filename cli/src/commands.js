/**
 * Beepack CLI Commands
 */

import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, statSync, createWriteStream } from 'fs';
import { join, relative } from 'path';
import { homedir } from 'os';
import { parse as parseYaml } from 'yaml';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import * as tar from 'tar';

const API_BASE = process.env.BEEPACK_API || 'https://beepack.dev/api/v1';
const CONFIG_DIR = join(homedir(), '.beepack');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

// Get auth token
export function getToken() {
  // Check env first
  if (process.env.BEEPACK_TOKEN) {
    return process.env.BEEPACK_TOKEN;
  }
  
  // Check config file
  if (existsSync(CONFIG_FILE)) {
    try {
      const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
      return config.token;
    } catch (e) {
      return null;
    }
  }
  
  return null;
}

// Save token to config
function saveToken(token, user) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify({ token, user }, null, 2));
}

// Helper to fetch from API
async function fetchAPI(endpoint, options = {}) {
  try {
    const headers = { ...options.headers };
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }
    
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'API error');
    }
    return await response.json();
  } catch (e) {
    if (e.message.includes('fetch failed')) {
      throw new Error('Cannot connect to Beepack API. Is the server running?');
    }
    throw e;
  }
}

// Format number
function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n.toString();
}

// SEARCH
export async function search(query, options) {
  const spinner = ora('Searching...').start();
  
  try {
    let url = `/search?q=${encodeURIComponent(query)}`;
    if (options.capabilities) url += `&capabilities=${options.capabilities}`;
    if (options.compatible) url += `&compatible=${options.compatible}`;
    
    const data = await fetchAPI(url);
    spinner.stop();
    
    if (data.results.length === 0) {
      console.log(chalk.yellow(`No packages found for "${query}"`));
      return;
    }
    
    console.log(chalk.green(`\n🔍 ${data.results.length} package(s) found for "${query}" (${data.searchTime}ms)\n`));
    
    data.results.slice(0, parseInt(options.limit)).forEach((pkg, i) => {
      console.log(chalk.bold(`${i + 1}. ${pkg.displayName}`) + chalk.gray(` (${pkg.slug})`));
      console.log(`   ${pkg.description}`);
      console.log(chalk.gray(`   👍 ${pkg.stats.likes || 0}  👎 ${pkg.stats.dislikes || 0}  📥 ${formatNum(pkg.stats.downloads)}  Score: ${(pkg.score * 100).toFixed(0)}%`));
      console.log();
    });
    
    console.log(chalk.gray(`Install with: beepack install <package-name>`));
  } catch (e) {
    spinner.fail(chalk.red(e.message));
  }
}

// LIST
export async function list(options) {
  const spinner = ora('Loading packages...').start();
  
  try {
    const data = await fetchAPI(`/packages?sort=${options.sort}&limit=${options.limit}`);
    spinner.stop();
    
    console.log(chalk.green(`\n📦 ${data.packages.length} packages\n`));
    
    data.packages.forEach((pkg, i) => {
      console.log(
        chalk.bold(`${String(i + 1).padStart(2)}. ${pkg.displayName}`) + 
        chalk.gray(` v${pkg.version}`)
      );
      console.log(`    ${pkg.description.slice(0, 60)}${pkg.description.length > 60 ? '...' : ''}`);
      console.log(chalk.gray(`    👍 ${pkg.stats.likes || 0}  👎 ${pkg.stats.dislikes || 0}  📥 ${formatNum(pkg.stats.downloads)}  by ${pkg.owner.handle}`));
      console.log();
    });
  } catch (e) {
    spinner.fail(chalk.red(e.message));
  }
}

// INFO
export async function info(packageSlug) {
  const spinner = ora(`Loading ${packageSlug}...`).start();
  
  try {
    const pkg = await fetchAPI(`/packages/${packageSlug}`);
    spinner.stop();
    
    console.log();
    console.log(chalk.bold.yellow(`📦 ${pkg.displayName}`) + chalk.gray(` (${pkg.slug})`));
    console.log(chalk.gray('─'.repeat(50)));
    console.log();
    console.log(pkg.description);
    console.log();
    console.log(chalk.bold('Stats'));
    console.log(`  👍 Likes:     ${pkg.stats.likes || 0}`);
    console.log(`  👎 Dislikes:  ${pkg.stats.dislikes || 0}`);
    console.log(`  📥 Downloads: ${formatNum(pkg.stats.downloads)}`);
    console.log(`  📋 Versions:  ${pkg.stats.versions}`);
    console.log();
    console.log(chalk.bold('Version'));
    console.log(`  Latest: ${chalk.green(pkg.latestVersion)}`);
    console.log(`  All:    ${pkg.versions.join(', ') || pkg.latestVersion}`);
    console.log();
    console.log(chalk.bold('Keywords'));
    console.log(`  ${pkg.keywords.join(', ')}`);
    console.log();
    console.log(chalk.bold('Capabilities'));
    console.log(`  ${pkg.capabilities.join(', ')}`);
    console.log();
    console.log(chalk.bold('Compatible With'));
    console.log(`  ${pkg.compatible.join(', ')}`);
    console.log();
    console.log(chalk.bold('Author'));
    console.log(`  ${pkg.owner.handle}`);
    console.log();
    console.log(chalk.gray(`Install: beepack install ${pkg.slug}`));
  } catch (e) {
    spinner.fail(chalk.red(e.message));
  }
}

// INSTALL
export async function install(packageSlug, options) {
  const spinner = ora(`Installing ${packageSlug}...`).start();
  
  try {
    // Get package info first
    const pkg = await fetchAPI(`/packages/${packageSlug}`);
    const version = options.version || pkg.latestVersion;
    
    spinner.text = `Downloading ${pkg.displayName} v${version}...`;
    
    // Create directory
    const installDir = join(process.cwd(), options.dir, packageSlug);
    if (!existsSync(installDir)) {
      mkdirSync(installDir, { recursive: true });
    }
    
    // Try to download actual files
    try {
      const downloadUrl = `${API_BASE}/packages/${packageSlug}/download${options.version ? `?version=${options.version}` : ''}`;
      const response = await fetch(downloadUrl);
      
      if (response.ok && response.headers.get('content-type')?.includes('gzip')) {
        // Extract tar.gz to install directory
        spinner.text = `Extracting ${pkg.displayName}...`;
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Write temp file and extract
        const tempFile = join(installDir, '.download.tar.gz');
        writeFileSync(tempFile, buffer);
        
        await tar.extract({
          file: tempFile,
          cwd: installDir,
        });
        
        // Clean up temp file
        const { unlinkSync } = await import('fs');
        unlinkSync(tempFile);
        
        spinner.succeed(chalk.green(`Installed ${pkg.displayName} v${version} to ${options.dir}/${packageSlug}`));
        
        // List installed files
        const installedFiles = collectFiles(installDir);
        console.log(chalk.gray(`   ${installedFiles.length} files extracted`));
      } else {
        // Fallback: no files uploaded yet, create placeholder
        throw new Error('No files available');
      }
    } catch (downloadError) {
      // Fallback to placeholder if download fails
      spinner.text = `Creating placeholder for ${pkg.displayName}...`;
      
      const placeholder = `# ${pkg.displayName}

> Installed from Beepack

**Version:** ${version}
**Description:** ${pkg.description}

## Capabilities
${pkg.capabilities.map(c => `- ${c}`).join('\n')}

## Requirements
Configure the required environment variables before using this package.

## Note
This package was installed as metadata only. The source files haven't been uploaded yet.
Contact the package author to upload the actual source code.

---
Installed with [Beepack](https://beepack.dev) 🐝
`;
      
      writeFileSync(join(installDir, 'README.md'), placeholder);
      writeFileSync(join(installDir, 'HIVE.yaml'), `# Downloaded from Beepack
name: ${packageSlug}
version: ${version}
description: ${pkg.description}
keywords: ${JSON.stringify(pkg.keywords)}
capabilities: ${JSON.stringify(pkg.capabilities)}
`);
      
      spinner.succeed(chalk.yellow(`Installed ${pkg.displayName} v${version} (metadata only)`));
      console.log(chalk.gray(`   ⚠️  Source files not available - placeholder created`));
    }
    
    console.log();
    console.log(chalk.gray('Next steps:'));
    console.log(chalk.gray(`  1. Check ${options.dir}/${packageSlug}/`));
    console.log(chalk.gray(`  2. Configure required environment variables`));
    console.log(chalk.gray(`  3. Import and use in your project`));
  } catch (e) {
    spinner.fail(chalk.red(e.message));
  }
}

// INIT
export async function init(options) {
  console.log(chalk.yellow('\n🐝 Initialize new Beepack package\n'));
  
  const hiveYaml = `# HIVE.yaml - Beepack Package Definition
name: my-package
version: 1.0.0
description: Description of your API

# Help others find your package
keywords:
  - keyword1
  - keyword2

# What your API can do (important for AI discovery)
capabilities:
  - main_action
  - secondary_action

# Environment variables your API needs
requires:
  env:
    - API_KEY

# Compatible runtimes
compatible:
  - cursor
  - copilot
  - claude
  - openclaw
`;

  writeFileSync('HIVE.yaml', hiveYaml);
  
  console.log(chalk.green('✅ Created HIVE.yaml'));
  console.log();
  console.log(chalk.gray('Next steps:'));
  console.log(chalk.gray('  1. Edit HIVE.yaml with your package details'));
  console.log(chalk.gray('  2. Add your source code'));
  console.log(chalk.gray('  3. Create a README.md'));
  console.log(chalk.gray('  4. Run: beepack publish'));
}

// Collect files recursively
function collectFiles(dir, baseDir = dir, ignore = []) {
  const files = [];
  const defaultIgnore = ['node_modules', '.git', '.env', '.DS_Store', '*.log'];
  const patterns = [...defaultIgnore, ...ignore];
  
  function shouldIgnore(name) {
    return patterns.some(p => {
      if (p.includes('*')) {
        const regex = new RegExp('^' + p.replace(/\*/g, '.*') + '$');
        return regex.test(name);
      }
      return name === p;
    });
  }
  
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldIgnore(entry.name)) continue;
    
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, baseDir, ignore));
    } else {
      const relativePath = relative(baseDir, fullPath);
      files.push({
        path: relativePath,
        fullPath,
        size: statSync(fullPath).size,
      });
    }
  }
  return files;
}

// PUBLISH
export async function publish(options) {
  if (!existsSync('HIVE.yaml')) {
    console.log(chalk.red('❌ No HIVE.yaml found in current directory'));
    console.log(chalk.gray('Run: beepack init'));
    return;
  }
  
  // Parse HIVE.yaml
  let hiveConfig;
  try {
    const content = readFileSync('HIVE.yaml', 'utf8');
    hiveConfig = parseYaml(content);
  } catch (e) {
    console.log(chalk.red(`❌ Error parsing HIVE.yaml: ${e.message}`));
    return;
  }
  
  // Validate required fields
  const required = ['name', 'version', 'description'];
  const missing = required.filter(f => !hiveConfig[f]);
  if (missing.length > 0) {
    console.log(chalk.red(`❌ Missing required fields in HIVE.yaml: ${missing.join(', ')}`));
    return;
  }
  
  // Collect files
  const files = collectFiles(process.cwd());
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  
  if (options.dryRun) {
    console.log(chalk.yellow('🔍 Dry run - validating package...\n'));
    console.log(chalk.bold('Package info:'));
    console.log(`  Name: ${hiveConfig.name}`);
    console.log(`  Version: ${hiveConfig.version}`);
    console.log(`  Description: ${hiveConfig.description}`);
    console.log(`  Keywords: ${(hiveConfig.keywords || []).join(', ')}`);
    console.log(`  Capabilities: ${(hiveConfig.capabilities || []).join(', ')}`);
    console.log();
    console.log(chalk.bold('Files to upload:'));
    files.forEach(f => console.log(`  ${f.path} (${(f.size / 1024).toFixed(1)}KB)`));
    console.log();
    console.log(`  Total: ${files.length} files, ${(totalSize / 1024).toFixed(1)}KB`);
    console.log();
    console.log(chalk.green('✅ Package is valid'));
    console.log(chalk.gray('Remove --dry-run to publish'));
    return;
  }
  
  // Check auth
  const token = getToken();
  if (!token) {
    console.log(chalk.red('❌ Not logged in'));
    console.log(chalk.gray('Run: beepack login'));
    return;
  }
  
  // Check size limit (50MB)
  if (totalSize > 50 * 1024 * 1024) {
    console.log(chalk.red(`❌ Package too large: ${(totalSize / 1024 / 1024).toFixed(1)}MB (max 50MB)`));
    return;
  }
  
  const spinner = ora(`Publishing ${files.length} files to Beepack...`).start();
  
  try {
    // Build multipart form data
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    
    form.append('version', hiveConfig.version);
    form.append('changelog', options.changelog || '');
    
    for (const file of files) {
      form.append('files', readFileSync(file.fullPath), {
        filename: file.path,
        contentType: 'application/octet-stream',
      });
    }
    
    // Convert form to buffer (Node.js fetch doesn't stream form-data correctly)
    const formBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      form.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      form.on('end', () => resolve(Buffer.concat(chunks)));
      form.on('error', reject);
      form.resume();
    });

    // Upload
    const response = await fetch(`${API_BASE}/packages/${hiveConfig.name}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...form.getHeaders(),
        'Content-Length': String(formBuffer.length),
      },
      body: formBuffer,
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Upload failed');
    }
    
    const result = await response.json();
    
    spinner.succeed(chalk.green(`✅ Published ${hiveConfig.name}@${hiveConfig.version}`));
    console.log(chalk.gray(`   ${result.filesStored} files, ${(result.totalSize / 1024).toFixed(1)}KB`));
    console.log();
    console.log(chalk.gray(`View at: ${API_BASE.replace('/api/v1', '')}/packages/${hiveConfig.name}`));
    console.log(chalk.gray(`Install: beepack install ${hiveConfig.name}`));
  } catch (e) {
    spinner.fail(chalk.red(`❌ ${e.message}`));
  }
}

// LOGIN
export async function login(options) {
  console.log(chalk.yellow('\n🔐 Login to Beepack\n'));
  
  // Check if token provided directly
  if (options.token) {
    const spinner = ora('Verifying token...').start();
    try {
      process.env.BEEPACK_TOKEN = options.token;
      const result = await fetchAPI('/me');
      saveToken(options.token, result.user);
      spinner.succeed(chalk.green(`Logged in as ${result.user.login}`));
    } catch (e) {
      spinner.fail(chalk.red('Invalid token'));
    }
    return;
  }
  
  const apiUrl = API_BASE.replace('/api/v1', '');
  console.log(`1. Open: ${chalk.cyan(apiUrl + '/auth/github')}`);
  console.log(`2. Authorize with GitHub`);
  console.log(`3. Copy your token`);
  console.log(`4. Run: ${chalk.cyan('beepack login --token YOUR_TOKEN')}`);
  console.log();
  console.log(chalk.gray(`Or set environment variable: export BEEPACK_TOKEN=YOUR_TOKEN`));
}

// WHOAMI
export async function whoami() {
  const token = getToken();
  
  if (!token) {
    console.log(chalk.yellow('Not logged in'));
    console.log(chalk.gray('Run: beepack login'));
    return;
  }
  
  const spinner = ora('Checking...').start();
  try {
    const result = await fetchAPI('/me');
    spinner.stop();
    console.log();
    console.log(chalk.green(`🐝 Logged in as ${chalk.bold(result.user.login)}`));
    if (result.user.email) {
      console.log(chalk.gray(`   ${result.user.email}`));
    }
  } catch (e) {
    spinner.stop();
    console.log(chalk.yellow('Session expired or invalid'));
    console.log(chalk.gray('Run: beepack login'));
  }
}

// LINK - Link two packages together
export async function link(fromSlug, toSlug, options) {
  const token = getToken();
  
  if (!token) {
    console.log(chalk.red('Not logged in'));
    console.log(chalk.gray('Run: beepack login'));
    return;
  }
  
  if (!fromSlug || !toSlug) {
    console.log(chalk.red('Usage: beepack link <package1> <package2> [--reason "why they work together"]'));
    return;
  }
  
  const spinner = ora(`Linking ${fromSlug} ↔ ${toSlug}...`).start();
  
  try {
    const result = await fetchAPI(`/packages/${fromSlug}/links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        targetSlug: toSlug,
        reason: options.reason || null,
        agentName: options.agent || 'CLI',
      }),
    });
    
    spinner.succeed(`Linked! ${chalk.cyan(fromSlug)} 🔗 ${chalk.cyan(toSlug)}`);
    if (options.reason) {
      console.log(chalk.gray(`  "${options.reason}"`));
    }
    console.log(chalk.gray(`  Votes: ${result.votes}`));
  } catch (e) {
    spinner.fail('Failed to link packages');
    console.log(chalk.red(e.message));
  }
}

// LIKE - Like a package
export async function like(slug) {
  const token = getToken();
  
  if (!token) {
    console.log(chalk.red('Not logged in. Run: beepack login'));
    return;
  }
  
  const spinner = ora(`Liking ${slug}...`).start();
  
  try {
    await fetchAPI(`/packages/${slug}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ liked: true, agentName: 'CLI' }),
    });
    
    spinner.succeed(`👍 Liked ${chalk.cyan(slug)}!`);
  } catch (e) {
    spinner.fail('Failed');
    console.log(chalk.red(e.message));
  }
}

// DISLIKE - Dislike a package with reason
export async function dislike(slug, options) {
  const token = getToken();
  
  if (!token) {
    console.log(chalk.red('Not logged in. Run: beepack login'));
    return;
  }
  
  if (!options.reason) {
    console.log(chalk.red('Please provide a reason: beepack dislike <package> --reason "why"'));
    return;
  }
  
  const spinner = ora(`Submitting feedback for ${slug}...`).start();
  
  try {
    await fetchAPI(`/packages/${slug}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ liked: false, reason: options.reason, agentName: 'CLI' }),
    });
    
    spinner.succeed(`👎 Feedback submitted for ${chalk.cyan(slug)}`);
    console.log(chalk.gray(`  "${options.reason}"`));
  } catch (e) {
    spinner.fail('Failed');
    console.log(chalk.red(e.message));
  }
}
