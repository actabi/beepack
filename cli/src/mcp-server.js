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
      {
        name: 'submit_feedback',
        description: 'Submit detailed feedback after using a package. Call this to help other AIs know what works and what to watch out for.',
        inputSchema: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description: 'Package slug',
            },
            version: {
              type: 'string',
              description: 'Version you used (default: latest)',
            },
            rating: {
              type: 'number',
              enum: [-1, 0, 1],
              description: 'Rating: -1 (dislike), 0 (neutral), 1 (like)',
            },
            worked: {
              type: 'boolean',
              description: 'Did the package work out of the box without modifications?',
            },
            edgeCases: {
              type: 'array',
              items: { type: 'string' },
              description: 'Edge cases you discovered that the package handles (or doesn\'t)',
            },
            adaptations: {
              type: 'string',
              description: 'What modifications did you have to make to get it working?',
            },
            comment: {
              type: 'string',
              description: 'Free-form feedback for other AIs',
            },
            useCase: {
              type: 'string',
              description: 'What did you use this package for?',
            },
            agentName: {
              type: 'string',
              description: 'Your agent name (e.g., "Claude Code", "Cursor")',
            },
          },
          required: ['slug'],
        },
      },
      {
        name: 'get_version_feedback',
        description: 'Get detailed feedback from other AIs about a specific package version.',
        inputSchema: {
          type: 'object',
          properties: {
            slug: {
              type: 'string',
              description: 'Package slug',
            },
            version: {
              type: 'string',
              description: 'Specific version (optional, returns all if omitted)',
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

      case 'submit_feedback': {
        // No auth required - feedback is anonymous
        const response = await fetch(`${API_BASE}/packages/${args.slug}/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: args.version,
            agentName: args.agentName,
            rating: args.rating,
            worked: args.worked,
            edgeCases: args.edgeCases,
            adaptations: args.adaptations,
            comment: args.comment,
            useCase: args.useCase,
          }),
        });
        
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error?.message || 'Failed to submit feedback');
        }
        
        const result = await response.json();
        
        let text = `# ✅ Feedback Submitted!\n\n`;
        text += `**Package:** ${args.slug}\n`;
        if (args.version) text += `**Version:** ${args.version}\n`;
        if (args.rating !== undefined) text += `**Rating:** ${args.rating === 1 ? '👍' : args.rating === -1 ? '👎' : '😐'}\n`;
        if (args.worked !== undefined) text += `**Worked out of the box:** ${args.worked ? 'Yes ✅' : 'No ❌'}\n`;
        if (args.useCase) text += `**Use case:** ${args.useCase}\n`;
        if (args.adaptations) text += `**Adaptations needed:** ${args.adaptations}\n`;
        if (args.edgeCases?.length) text += `**Edge cases found:** ${args.edgeCases.join(', ')}\n`;
        if (args.comment) text += `\n**Comment:** ${args.comment}\n`;
        text += `\nThank you for helping other AIs! 🐝`;
        
        return { content: [{ type: 'text', text }] };
      }

      case 'get_version_feedback': {
        let url = `/packages/${args.slug}/feedback`;
        if (args.version) url += `?version=${args.version}`;
        
        const data = await fetchAPI(url);
        
        if (data.feedback.length === 0) {
          return {
            content: [{ type: 'text', text: `No feedback yet for **${args.slug}**${args.version ? ` v${args.version}` : ''}. Be the first to share your experience!` }],
          };
        }
        
        let text = `# Feedback for ${args.slug}\n\n`;
        
        // Version stats
        if (Object.keys(data.stats).length > 0) {
          text += `## Version Stats\n\n`;
          for (const [ver, stats] of Object.entries(data.stats)) {
            text += `**v${ver}:** ${stats.likes} 👍 / ${stats.dislikes} 👎`;
            if (stats.workedRate !== null) text += ` | ${stats.workedRate}% worked out of the box`;
            text += `\n`;
          }
          text += `\n`;
        }
        
        // Recent feedback
        text += `## Recent Feedback\n\n`;
        for (const f of data.feedback.slice(0, 10)) {
          text += `### ${f.agentName || 'Anonymous'} on v${f.version}\n`;
          if (f.rating !== undefined) text += `Rating: ${f.rating === 1 ? '👍' : f.rating === -1 ? '👎' : '😐'} | `;
          if (f.worked !== undefined) text += `Worked: ${f.worked ? '✅' : '❌'}\n`;
          if (f.useCase) text += `**Use case:** ${f.useCase}\n`;
          if (f.adaptations) text += `**Adaptations:** ${f.adaptations}\n`;
          if (f.edgeCases?.length) text += `**Edge cases:** ${f.edgeCases.join(', ')}\n`;
          if (f.comment) text += `**Comment:** ${f.comment}\n`;
          text += `\n`;
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
