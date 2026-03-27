/**
 * Beepack MCP Server
 * Allows AI assistants to discover and install packages via MCP protocol
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const API_BASE = process.env.BEEPACK_API || 'http://localhost:3011/api/v1';

// Helper to fetch from API
async function fetchAPI(endpoint) {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`);
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

// Create MCP server
const server = new Server(
  {
    name: 'beepack',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_packages',
        description: 'Search for API packages on Beepack. Use natural language queries to find packages that match your needs.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Natural language search query (e.g., "sync with Notion", "payment processing", "send emails")',
            },
            capabilities: {
              type: 'string',
              description: 'Filter by capabilities (comma-separated)',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 5)',
              default: 5,
            },
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
            sort: {
              type: 'string',
              enum: ['stars', 'downloads', 'updated'],
              description: 'Sort order',
              default: 'stars',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 10)',
              default: 10,
            },
          },
        },
      },
      {
        name: 'get_package_info',
        description: 'Get detailed information about a specific package, including capabilities, requirements, and usage examples.',
        inputSchema: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description: 'Package slug (e.g., "notion-sync", "stripe-payments")',
            },
          },
          required: ['slug'],
        },
      },
      {
        name: 'get_package_code',
        description: 'Get the source code or implementation details of a package to integrate it into your project.',
        inputSchema: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description: 'Package slug',
            },
            version: {
              type: 'string',
              description: 'Specific version (default: latest)',
            },
          },
          required: ['slug'],
        },
      },
      {
        name: 'get_stats',
        description: 'Get Beepack platform statistics.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'search_packages': {
        const limit = args.limit || 5;
        let url = `/search?q=${encodeURIComponent(args.query)}`;
        if (args.capabilities) url += `&capabilities=${args.capabilities}`;
        
        const data = await fetchAPI(url);
        const results = data.results.slice(0, limit);
        
        if (results.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: `No packages found for "${args.query}". Try a different search term or browse with list_packages.`,
              },
            ],
          };
        }
        
        const formatted = results.map((pkg, i) => 
          `${i + 1}. **${pkg.displayName}** (\`${pkg.slug}\`)
   ${pkg.description}
   ⭐ ${pkg.stats.stars} | 📥 ${pkg.stats.downloads} downloads
   Capabilities: ${pkg.capabilities?.join(', ') || 'N/A'}
   Install: \`beepack install ${pkg.slug}\``
        ).join('\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `Found ${results.length} package(s) for "${args.query}":\n\n${formatted}\n\nUse get_package_info for more details or get_package_code to see the implementation.`,
            },
          ],
        };
      }

      case 'list_packages': {
        const sort = args.sort || 'stars';
        const limit = args.limit || 10;
        
        const data = await fetchAPI(`/packages?sort=${sort}&limit=${limit}`);
        
        const formatted = data.packages.map((pkg, i) => 
          `${i + 1}. **${pkg.displayName}** v${pkg.version}
   ${pkg.description}
   ⭐ ${pkg.stats.stars} | 📥 ${pkg.stats.downloads} | by ${pkg.owner.handle}`
        ).join('\n\n');
        
        return {
          content: [
            {
              type: 'text',
              text: `Top ${data.packages.length} packages (sorted by ${sort}):\n\n${formatted}`,
            },
          ],
        };
      }

      case 'get_package_info': {
        const pkg = await fetchAPI(`/packages/${args.slug}`);
        
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

## Keywords
${pkg.keywords.join(', ')}

## Installation
\`\`\`bash
beepack install ${pkg.slug}
\`\`\`

Use \`get_package_code\` to see the implementation.`;
        
        return {
          content: [{ type: 'text', text: info }],
        };
      }

      case 'get_package_code': {
        const pkg = await fetchAPI(`/packages/${args.slug}`);
        
        // In production, this would return actual source code
        // For now, return a template based on package capabilities
        const code = `/**
 * ${pkg.displayName}
 * ${pkg.description}
 * 
 * @version ${pkg.latestVersion}
 * @author ${pkg.owner.handle}
 * @license MIT
 */

// HIVE.yaml configuration
const HIVE_CONFIG = {
  name: "${pkg.slug}",
  version: "${pkg.latestVersion}",
  capabilities: ${JSON.stringify(pkg.capabilities)},
  requires: {
    env: ${JSON.stringify(pkg.requires?.env || [])}
  }
};

// Example implementation
${pkg.capabilities.map(cap => `
/**
 * ${cap.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
 */
export async function ${cap}(params) {
  // Implementation here
  throw new Error('Not implemented - this is a template');
}
`).join('\n')}

// Export capabilities
export default {
  ${pkg.capabilities.join(',\n  ')}
};
`;
        
        return {
          content: [
            {
              type: 'text',
              text: `# ${pkg.displayName} - Source Code\n\n\`\`\`javascript\n${code}\n\`\`\`\n\n**Note:** This is a template. In production, actual source code would be returned.`,
            },
          ],
        };
      }

      case 'get_stats': {
        const stats = await fetchAPI('/stats');
        
        return {
          content: [
            {
              type: 'text',
              text: `# Beepack Statistics

- 📦 Total Packages: ${stats.totalPackages}
- ⭐ Total Stars: ${stats.totalStars}
- 📥 Total Downloads: ${stats.totalDownloads}
- 👥 Total Users: ${stats.totalUsers}

Beepack is the API registry for vibe-coders. Search for packages or browse the catalog!`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
export async function startMCPServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Beepack MCP Server running on stdio');
}

// Run if called directly
startMCPServer().catch(console.error);
