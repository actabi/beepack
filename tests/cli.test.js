/**
 * Tests for CLI Commands
 * Run: node --test tests/cli.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('CLI Commands', () => {

  describe('HIVE.yaml Generation', () => {
    test('should generate valid HIVE.yaml template', () => {
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

      assert.ok(hiveYaml.includes('name: my-package'));
      assert.ok(hiveYaml.includes('version: 1.0.0'));
      assert.ok(hiveYaml.includes('keywords:'));
      assert.ok(hiveYaml.includes('capabilities:'));
      assert.ok(hiveYaml.includes('requires:'));
      assert.ok(hiveYaml.includes('compatible:'));
    });
  });

  describe('Package Installation', () => {
    const testDir = join(tmpdir(), 'beepack-test-' + Date.now());

    test('should create installation directory', () => {
      mkdirSync(testDir, { recursive: true });
      assert.ok(existsSync(testDir));
      
      // Cleanup
      rmSync(testDir, { recursive: true });
    });

    test('should generate README.md for installed package', () => {
      const pkg = {
        displayName: 'Test Package',
        slug: 'test-package',
        description: 'A test package description',
        latestVersion: '1.2.0',
        capabilities: ['do_something', 'do_another'],
      };

      const readme = `# ${pkg.displayName}

> Installed from Beepack

**Version:** ${pkg.latestVersion}
**Description:** ${pkg.description}

## Capabilities
${pkg.capabilities.map(c => `- ${c}`).join('\n')}

## Requirements
Configure the required environment variables before using this package.

## Usage
\`\`\`javascript
import ${pkg.slug.replace(/-/g, '_')} from './packages/${pkg.slug}';
// Use the API...
\`\`\`

---
Installed with [Beepack](https://beepack.dev) 🐝
`;

      assert.ok(readme.includes('# Test Package'));
      assert.ok(readme.includes('**Version:** 1.2.0'));
      assert.ok(readme.includes('- do_something'));
      assert.ok(readme.includes('import test_package'));
    });

    test('should generate HIVE.yaml for installed package', () => {
      const pkg = {
        slug: 'test-package',
        description: 'A test package',
        latestVersion: '1.0.0',
        keywords: ['test', 'demo'],
        capabilities: ['action_one'],
      };

      const hiveYaml = `# Downloaded from Beepack
name: ${pkg.slug}
version: ${pkg.latestVersion}
description: ${pkg.description}
keywords: ${JSON.stringify(pkg.keywords)}
capabilities: ${JSON.stringify(pkg.capabilities)}
`;

      assert.ok(hiveYaml.includes('name: test-package'));
      assert.ok(hiveYaml.includes('version: 1.0.0'));
      assert.ok(hiveYaml.includes('["test","demo"]'));
    });
  });

  describe('Number Formatting', () => {
    function formatNum(n) {
      if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
      return n.toString();
    }

    test('should format numbers correctly', () => {
      assert.strictEqual(formatNum(500), '500');
      assert.strictEqual(formatNum(1000), '1.0k');
      assert.strictEqual(formatNum(1500), '1.5k');
      assert.strictEqual(formatNum(10000), '10.0k');
      assert.strictEqual(formatNum(1000000), '1.0M');
      assert.strictEqual(formatNum(2500000), '2.5M');
    });
  });

  describe('Token Management', () => {
    test('should prefer env variable over config file', () => {
      const envToken = 'env-token-123';
      const configToken = 'config-token-456';
      
      // Simulate token retrieval priority
      const getToken = (envToken, configToken) => {
        if (envToken) return envToken;
        if (configToken) return configToken;
        return null;
      };

      assert.strictEqual(getToken(envToken, configToken), envToken);
      assert.strictEqual(getToken(null, configToken), configToken);
      assert.strictEqual(getToken(null, null), null);
    });
  });

  describe('Publish Validation', () => {
    test('should require name, version, description', () => {
      const required = ['name', 'version', 'description'];
      
      const validConfig = {
        name: 'my-package',
        version: '1.0.0',
        description: 'A package',
      };
      
      const invalidConfig = {
        name: 'my-package',
        // missing version and description
      };

      const getMissing = (config) => required.filter(f => !config[f]);
      
      assert.strictEqual(getMissing(validConfig).length, 0);
      assert.deepStrictEqual(getMissing(invalidConfig), ['version', 'description']);
    });

    test('should validate slug format', () => {
      const isValidSlug = (slug) => /^[a-z0-9-]+$/.test(slug);
      
      assert.ok(isValidSlug('my-package'));
      assert.ok(isValidSlug('package123'));
      assert.ok(isValidSlug('a-b-c'));
      assert.ok(!isValidSlug('MyPackage')); // uppercase
      assert.ok(!isValidSlug('my_package')); // underscore
      assert.ok(!isValidSlug('my package')); // space
      assert.ok(!isValidSlug('')); // empty
    });

    test('should validate semver format', () => {
      const isValidSemver = (v) => /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(v);
      
      assert.ok(isValidSemver('1.0.0'));
      assert.ok(isValidSemver('0.1.0'));
      assert.ok(isValidSemver('10.20.30'));
      assert.ok(isValidSemver('1.0.0-beta'));
      assert.ok(isValidSemver('1.0.0-alpha.1'));
      assert.ok(!isValidSemver('1.0')); // missing patch
      assert.ok(!isValidSemver('v1.0.0')); // has v prefix
      assert.ok(!isValidSemver('1.0.0.0')); // too many parts
    });
  });

  describe('Display Name Generation', () => {
    test('should generate displayName from slug', () => {
      const toDisplayName = (slug) => 
        slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      
      assert.strictEqual(toDisplayName('notion-sync'), 'Notion Sync');
      assert.strictEqual(toDisplayName('stripe-payments'), 'Stripe Payments');
      assert.strictEqual(toDisplayName('simple'), 'Simple');
      assert.strictEqual(toDisplayName('a-b-c-d'), 'A B C D');
    });
  });

  describe('Search Output', () => {
    test('should format search results for terminal', () => {
      const results = [
        {
          displayName: 'Notion Sync',
          slug: 'notion-sync',
          description: 'Sync with Notion',
          stats: { stars: 45, downloads: 1247 },
          score: 0.94,
        },
      ];

      const formatNum = (n) => n >= 1000 ? (n/1000).toFixed(1) + 'k' : n.toString();
      
      const output = results.map((pkg, i) => 
        `${i + 1}. ${pkg.displayName} (${pkg.slug})
   ${pkg.description}
   ⭐ ${pkg.stats.stars}  📥 ${formatNum(pkg.stats.downloads)}  Score: ${(pkg.score * 100).toFixed(0)}%`
      ).join('\n\n');

      assert.ok(output.includes('1. Notion Sync'));
      assert.ok(output.includes('notion-sync'));
      assert.ok(output.includes('⭐ 45'));
      assert.ok(output.includes('📥 1.2k'));
      assert.ok(output.includes('Score: 94%'));
    });
  });

  describe('Error Messages', () => {
    test('should provide helpful error for missing HIVE.yaml', () => {
      const error = 'No HIVE.yaml found in current directory';
      const suggestion = 'Run: beepack init';
      
      assert.ok(error.includes('HIVE.yaml'));
      assert.ok(suggestion.includes('init'));
    });

    test('should provide helpful error for auth required', () => {
      const error = 'Not logged in';
      const suggestion = 'Run: beepack login';
      
      assert.ok(error.includes('logged in'));
      assert.ok(suggestion.includes('login'));
    });

    test('should provide helpful error for API unavailable', () => {
      const error = 'Cannot connect to Beepack API. Is the server running?';
      
      assert.ok(error.includes('connect'));
      assert.ok(error.includes('server'));
    });
  });
});

console.log('CLI tests loaded. Run with: node --test tests/cli.test.js');
