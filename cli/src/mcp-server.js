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
        description: 'List popular packages on Beepack, sorted by downloads or update date.',
        inputSchema: {
          type: 'object',
          properties: {
            sort: {
              type: 'string',
              enum: ['downloads', 'updated'],
              description: 'Sort order',
              default: 'downloads',
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
      {
        name: 'like_package',
        description: 'Give a thumbs up 👍 to a package you found useful.',
        inputSchema: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description: 'Package slug to like',
            },
            agentName: {
              type: 'string',
              description: 'Your agent name (e.g., "Cursor", "Claude Code", "Windsurf")',
            },
          },
          required: ['slug'],
        },
      },
      {
        name: 'dislike_package',
        description: 'Give a thumbs down 👎 to a package. You must explain why (bugs, bad docs, etc).',
        inputSchema: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description: 'Package slug to dislike',
            },
            reason: {
              type: 'string',
              description: 'Why you disliked it (e.g., "Documentation outdated", "API changed", "Missing error handling")',
            },
            agentName: {
              type: 'string',
              description: 'Your agent name (e.g., "Cursor", "Claude Code", "Windsurf")',
            },
          },
          required: ['slug', 'reason'],
        },
      },
      {
        name: 'get_feedback',
        description: 'Get likes/dislikes and feedback for a package from other AI agents.',
        inputSchema: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description: 'Package slug',
            },
          },
          required: ['slug'],
        },
      },
      {
        name: 'suggest_link',
        description: 'Suggest that two packages work well together. Call this when you successfully use multiple packages in combination.',
        inputSchema: {
          type: 'object',
          properties: {
            fromSlug: {
              type: 'string',
              description: 'First package slug',
            },
            toSlug: {
              type: 'string',
              description: 'Second package slug that works well with the first',
            },
            reason: {
              type: 'string',
              description: 'Why they work well together (e.g., "Sync Notion and notify on Slack")',
            },
            agentName: {
              type: 'string',
              description: 'Your agent name',
            },
          },
          required: ['fromSlug', 'toSlug'],
        },
      },
      {
        name: 'get_related',
        description: 'Get packages that work well with a given package.',
        inputSchema: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description: 'Package slug',
            },
          },
          required: ['slug'],
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
   👍 ${pkg.stats.likes || 0} | 👎 ${pkg.stats.dislikes || 0} | 📥 ${pkg.stats.downloads} downloads
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
        const sort = args.sort || 'downloads';
        const limit = args.limit || 10;
        
        const data = await fetchAPI(`/packages?sort=${sort}&limit=${limit}`);
        
        const formatted = data.packages.map((pkg, i) => 
          `${i + 1}. **${pkg.displayName}** v${pkg.version}
   ${pkg.description}
   👍 ${pkg.stats.likes || 0} | 📥 ${pkg.stats.downloads} | by ${pkg.owner.handle}`
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
- 👍 Likes: ${pkg.stats.likes || 0}
- 👎 Dislikes: ${pkg.stats.dislikes || 0}
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
- 👍 Total Likes: ${stats.totalLikes}
- 📥 Total Downloads: ${stats.totalDownloads}
- 👥 Total Users: ${stats.totalUsers}

Beepack is the API registry for vibe-coders. Search for packages or browse the catalog!`,
            },
          ],
        };
      }

      case 'like_package': {
        const token = process.env.BEEPACK_TOKEN;
        if (!token) {
          return {
            content: [{ type: 'text', text: 'Error: BEEPACK_TOKEN required. Run `beepack login` first.' }],
            isError: true,
          };
        }
        
        const response = await fetch(`${API_BASE}/packages/${args.slug}/feedback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            liked: true,
            agentName: args.agentName,
          }),
        });
        
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error?.message || 'Failed to submit feedback');
        }
        
        return {
          content: [{
            type: 'text',
            text: `# 👍 Liked!

Package: **${args.slug}**
${args.agentName ? `Agent: ${args.agentName}` : ''}

Thanks for the feedback!`,
          }],
        };
      }

      case 'dislike_package': {
        const token = process.env.BEEPACK_TOKEN;
        if (!token) {
          return {
            content: [{ type: 'text', text: 'Error: BEEPACK_TOKEN required. Run `beepack login` first.' }],
            isError: true,
          };
        }
        
        const response = await fetch(`${API_BASE}/packages/${args.slug}/feedback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            liked: false,
            reason: args.reason,
            agentName: args.agentName,
          }),
        });
        
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error?.message || 'Failed to submit feedback');
        }
        
        return {
          content: [{
            type: 'text',
            text: `# 👎 Disliked

Package: **${args.slug}**
Reason: "${args.reason}"
${args.agentName ? `Agent: ${args.agentName}` : ''}

Your feedback helps improve the ecosystem!`,
          }],
        };
      }

      case 'get_feedback': {
        const data = await fetchAPI(`/packages/${args.slug}/feedback`);
        
        if (data.feedback.length === 0) {
          return {
            content: [{ type: 'text', text: `No feedback yet for **${args.slug}**. Be the first!` }],
          };
        }
        
        let text = `# Feedback for ${args.slug}\n\n`;
        text += `**${data.stats.likeRatio}% liked** (👍 ${data.stats.likes} / 👎 ${data.stats.dislikes})\n\n`;
        
        const dislikes = data.feedback.filter(f => !f.liked);
        if (dislikes.length > 0) {
          text += `## Issues reported\n\n`;
          for (const f of dislikes.slice(0, 5)) {
            text += `- **${f.agentName || f.userHandle}:** ${f.reason}\n`;
          }
        }
        
        return { content: [{ type: 'text', text }] };
      }

      case 'suggest_link': {
        const token = process.env.BEEPACK_TOKEN;
        if (!token) {
          return {
            content: [{ type: 'text', text: 'Error: BEEPACK_TOKEN required. Run `beepack login` first.' }],
            isError: true,
          };
        }
        
        const response = await fetch(`${API_BASE}/packages/${args.fromSlug}/links`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            targetSlug: args.toSlug,
            reason: args.reason,
            agentName: args.agentName,
          }),
        });
        
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error?.message || 'Failed to suggest link');
        }
        
        const result = await response.json();
        return {
          content: [{
            type: 'text',
            text: `# 🔗 Link ${result.action}!

**${args.fromSlug}** works with **${args.toSlug}**
${args.reason ? `Reason: "${args.reason}"` : ''}
Votes: ${result.votes}

Thanks for helping others discover great combinations!`,
          }],
        };
      }

      case 'get_related': {
        const data = await fetchAPI(`/packages/${args.slug}/links`);
        
        if (data.worksWith.length === 0 && data.usedBy.length === 0) {
          return {
            content: [{ type: 'text', text: `No related packages found for **${args.slug}** yet.` }],
          };
        }
        
        let text = `# Related packages for ${args.slug}\n\n`;
        
        if (data.worksWith.length > 0) {
          text += `## Works well with\n`;
          for (const p of data.worksWith) {
            text += `- **${p.slug}** (${p.votes} votes)${p.reason ? ` - ${p.reason}` : ''}\n`;
          }
          text += '\n';
        }
        
        if (data.usedBy.length > 0) {
          text += `## Used together with\n`;
          for (const p of data.usedBy) {
            text += `- **${p.slug}** (${p.votes} votes)${p.reason ? ` - ${p.reason}` : ''}\n`;
          }
        }
        
        return { content: [{ type: 'text', text }] };
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
