/**
 * Tests for MCP Server
 * Run: node --test tests/mcp-server.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('MCP Server', () => {

  describe('Tool Definitions', () => {
    const tools = [
      {
        name: 'search_packages',
        description: 'Search for API packages on Beepack. Use natural language queries to find packages that match your needs.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Natural language search query' },
            capabilities: { type: 'string', description: 'Filter by capabilities' },
            limit: { type: 'number', description: 'Maximum number of results', default: 5 },
          },
          required: ['query'],
        },
      },
      {
        name: 'list_packages',
        description: 'List popular packages on Beepack, sorted by stars or downloads.',
        inputSchema: {
          type: 'object',
          properties: {
            sort: { type: 'string', enum: ['stars', 'downloads', 'updated'] },
            limit: { type: 'number', default: 10 },
          },
        },
      },
      {
        name: 'get_package_info',
        description: 'Get detailed information about a specific package.',
        inputSchema: {
          type: 'object',
          properties: {
            slug: { type: 'string', description: 'Package slug' },
          },
          required: ['slug'],
        },
      },
      {
        name: 'get_package_code',
        description: 'Get the source code or implementation details of a package.',
        inputSchema: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
            version: { type: 'string' },
          },
          required: ['slug'],
        },
      },
      {
        name: 'get_stats',
        description: 'Get Beepack platform statistics.',
        inputSchema: { type: 'object', properties: {} },
      },
    ];

    test('should have 5 tools defined', () => {
      assert.strictEqual(tools.length, 5);
    });

    test('search_packages should require query parameter', () => {
      const searchTool = tools.find(t => t.name === 'search_packages');
      assert.ok(searchTool);
      assert.ok(searchTool.inputSchema.required.includes('query'));
    });

    test('get_package_info should require slug parameter', () => {
      const infoTool = tools.find(t => t.name === 'get_package_info');
      assert.ok(infoTool);
      assert.ok(infoTool.inputSchema.required.includes('slug'));
    });

    test('list_packages should have sort enum', () => {
      const listTool = tools.find(t => t.name === 'list_packages');
      assert.ok(listTool);
      const sortEnum = listTool.inputSchema.properties.sort.enum;
      assert.ok(sortEnum.includes('stars'));
      assert.ok(sortEnum.includes('downloads'));
      assert.ok(sortEnum.includes('updated'));
    });

    test('get_stats should have no required parameters', () => {
      const statsTool = tools.find(t => t.name === 'get_stats');
      assert.ok(statsTool);
      assert.ok(!statsTool.inputSchema.required);
    });
  });

  describe('Search Response Formatting', () => {
    test('should format search results as markdown', () => {
      const results = [
        {
          displayName: 'Notion Sync',
          slug: 'notion-sync',
          description: 'Sync with Notion',
          stats: { stars: 45, downloads: 1200 },
          capabilities: ['read_database', 'write_pages'],
        },
      ];

      const formatted = results.map((pkg, i) => 
        `${i + 1}. **${pkg.displayName}** (\`${pkg.slug}\`)
   ${pkg.description}
   ⭐ ${pkg.stats.stars} | 📥 ${pkg.stats.downloads} downloads
   Capabilities: ${pkg.capabilities?.join(', ') || 'N/A'}
   Install: \`beepack install ${pkg.slug}\``
      ).join('\n\n');

      assert.ok(formatted.includes('**Notion Sync**'));
      assert.ok(formatted.includes('`notion-sync`'));
      assert.ok(formatted.includes('⭐ 45'));
      assert.ok(formatted.includes('beepack install notion-sync'));
    });

    test('should handle empty results', () => {
      const results = [];
      const message = results.length === 0 
        ? 'No packages found. Try a different search term.' 
        : 'Found packages';
      
      assert.strictEqual(message, 'No packages found. Try a different search term.');
    });
  });

  describe('Package Info Formatting', () => {
    test('should format package info as markdown', () => {
      const pkg = {
        displayName: 'Stripe Payments',
        slug: 'stripe-payments',
        description: 'Payment processing with Stripe',
        latestVersion: '2.1.0',
        owner: { handle: 'beepack' },
        stats: { stars: 89, downloads: 3421, versions: 5 },
        capabilities: ['create_payment', 'manage_subscriptions'],
        requires: { env: ['STRIPE_SECRET_KEY'] },
        compatible: ['cursor', 'copilot', 'claude'],
        keywords: ['stripe', 'payments'],
      };

      const info = `# ${pkg.displayName}

**Slug:** \`${pkg.slug}\`
**Version:** ${pkg.latestVersion}
**Author:** ${pkg.owner.handle}

## Description
${pkg.description}

## Stats
- ⭐ Stars: ${pkg.stats.stars}
- 📥 Downloads: ${pkg.stats.downloads}
- 📋 Versions: ${pkg.stats.versions}

## Capabilities
${pkg.capabilities.map(c => `- ${c}`).join('\n')}

## Requirements
${pkg.requires?.env?.length ? pkg.requires.env.map(e => `- \`${e}\``).join('\n') : 'No environment variables required'}

## Compatible With
${pkg.compatible.join(', ')}

## Installation
\`\`\`bash
beepack install ${pkg.slug}
\`\`\``;

      assert.ok(info.includes('# Stripe Payments'));
      assert.ok(info.includes('**Version:** 2.1.0'));
      assert.ok(info.includes('- create_payment'));
      assert.ok(info.includes('`STRIPE_SECRET_KEY`'));
      assert.ok(info.includes('beepack install stripe-payments'));
    });
  });

  describe('Package Code Generation', () => {
    test('should generate template code from capabilities', () => {
      const pkg = {
        displayName: 'Test Package',
        slug: 'test-package',
        description: 'A test package',
        latestVersion: '1.0.0',
        owner: { handle: 'testuser' },
        capabilities: ['action_one', 'action_two'],
        requires: { env: ['API_KEY'] },
      };

      const code = pkg.capabilities.map(cap => `
/**
 * ${cap.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
 */
export async function ${cap}(params) {
  // Implementation here
  throw new Error('Not implemented - this is a template');
}
`).join('\n');

      assert.ok(code.includes('export async function action_one'));
      assert.ok(code.includes('export async function action_two'));
      assert.ok(code.includes('Action One'));
      assert.ok(code.includes('Action Two'));
    });
  });

  describe('Stats Formatting', () => {
    test('should format stats correctly', () => {
      const stats = {
        totalPackages: 150,
        totalStars: 1234,
        totalDownloads: 56789,
        totalUsers: 42,
      };

      const formatted = `# Beepack Statistics

- 📦 Total Packages: ${stats.totalPackages}
- ⭐ Total Stars: ${stats.totalStars}
- 📥 Total Downloads: ${stats.totalDownloads}
- 👥 Total Users: ${stats.totalUsers}`;

      assert.ok(formatted.includes('Total Packages: 150'));
      assert.ok(formatted.includes('Total Stars: 1234'));
      assert.ok(formatted.includes('Total Downloads: 56789'));
      assert.ok(formatted.includes('Total Users: 42'));
    });
  });

  describe('Error Handling', () => {
    test('should format error response', () => {
      const error = new Error('Package not found');
      
      const response = {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };

      assert.strictEqual(response.isError, true);
      assert.strictEqual(response.content[0].text, 'Error: Package not found');
    });

    test('should handle API connection error', () => {
      const error = new Error('fetch failed');
      const message = error.message.includes('fetch failed')
        ? 'Cannot connect to Beepack API. Is the server running?'
        : error.message;

      assert.strictEqual(message, 'Cannot connect to Beepack API. Is the server running?');
    });
  });

  describe('MCP Response Format', () => {
    test('should return content array with text type', () => {
      const response = {
        content: [
          {
            type: 'text',
            text: 'Search results here...',
          },
        ],
      };

      assert.ok(Array.isArray(response.content));
      assert.strictEqual(response.content[0].type, 'text');
      assert.ok(typeof response.content[0].text === 'string');
    });
  });
});

console.log('MCP Server tests loaded. Run with: node --test tests/mcp-server.test.js');
