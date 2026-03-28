/**
 * Beepack Remote MCP Server
 * Exposes MCP protocol over SSE so any AI can connect directly to beepack.ai
 * No CLI install required - just add the URL to your MCP config
 */

// Tool definitions
const TOOLS = [
  {
    name: 'search_packages',
    description: 'Search for API packages on Beepack. Use natural language queries to find packages that match your needs.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query (e.g., "sync with Notion", "payment processing")' },
        limit: { type: 'number', description: 'Max results (default: 5)', default: 5 },
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
        sort: { type: 'string', enum: ['downloads', 'updated'], default: 'downloads' },
        limit: { type: 'number', default: 10 },
      },
    },
  },
  {
    name: 'get_package_info',
    description: 'Get detailed information about a specific package including capabilities, requirements, and documentation.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Package slug (e.g., "company-lookup-fr")' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'get_package_code',
    description: 'Get the actual source code of a package to integrate it into your project.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Package slug' },
        file: { type: 'string', description: 'Specific file path (default: all files)' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'list_bundles',
    description: 'List available bundles - curated groups of packages that work well together for specific use cases.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_bundle',
    description: 'Get details about a specific bundle including all packages, their roles, and the use case.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Bundle slug' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'suggest_improvement',
    description: 'Suggest an improvement to an existing package instead of publishing a duplicate. Use this when a similar package already exists but could be better.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Package slug to improve' },
        title: { type: 'string', description: 'Short title for the suggestion' },
        description: { type: 'string', description: 'Detailed description of the improvement' },
        codeDiff: { type: 'string', description: 'Code changes or new code to add (optional)' },
      },
      required: ['slug', 'title', 'description'],
    },
  },
];

// Internal API fetch (calls own Express routes)
async function apiGet(port, path) {
  const res = await fetch(`http://localhost:${port}/api/v1${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }
  return res.json();
}

// Handle tool calls
async function handleToolCall(port, name, args) {
  switch (name) {
    case 'search_packages': {
      const data = await apiGet(port, `/search?q=${encodeURIComponent(args.query)}`);
      const results = (data.results || []).slice(0, args.limit || 5);
      if (results.length === 0) {
        return `No packages found for "${args.query}". Try a different search term or use list_packages.`;
      }
      return results.map((pkg, i) =>
        `${i + 1}. **${pkg.displayName}** (\`${pkg.slug}\`)\n   ${pkg.description}\n   Likes: ${pkg.stats.likes || 0} | Dislikes: ${pkg.stats.dislikes || 0} | Downloads: ${pkg.stats.downloads}\n   Capabilities: ${pkg.capabilities?.join(', ') || 'N/A'}`
      ).join('\n\n');
    }

    case 'list_packages': {
      const data = await apiGet(port, `/packages?sort=${args.sort || 'downloads'}&limit=${args.limit || 10}`);
      return data.packages.map((pkg, i) =>
        `${i + 1}. **${pkg.displayName}** v${pkg.version} - ${pkg.description}\n   Likes: ${pkg.stats.likes || 0} | Downloads: ${pkg.stats.downloads} | by ${pkg.owner.handle}`
      ).join('\n\n');
    }

    case 'get_package_info': {
      const pkg = await apiGet(port, `/packages/${args.slug}`);
      return `# ${pkg.displayName}

**Version:** ${pkg.latestVersion}
**Author:** ${pkg.owner.handle}

## Description
${pkg.description}

## Stats
- Likes: ${pkg.stats.likes || 0}
- Dislikes: ${pkg.stats.dislikes || 0}
- Downloads: ${pkg.stats.downloads}

## Capabilities
${pkg.capabilities.map(c => `- ${c}`).join('\n')}

## Requirements
${pkg.requires?.env?.length ? pkg.requires.env.map(e => `- \`${e}\``).join('\n') : 'No environment variables required'}

## Compatible With
${pkg.compatible.join(', ')}

## README
${pkg.readme || 'No README available.'}`;
    }

    case 'get_package_code': {
      const filesData = await apiGet(port, `/packages/${args.slug}/files`);
      if (!filesData.files || filesData.files.length === 0) {
        return `No files found for package "${args.slug}".`;
      }

      if (args.file) {
        const res = await fetch(`http://localhost:${port}/api/v1/packages/${args.slug}/files/${args.file}`);
        if (!res.ok) return `File "${args.file}" not found.`;
        const content = await res.text();
        return `# ${args.file}\n\n\`\`\`\n${content}\n\`\`\``;
      }

      // Return all files
      const output = [];
      for (const f of filesData.files) {
        const res = await fetch(`http://localhost:${port}/api/v1/packages/${args.slug}/files/${f.path}`);
        if (res.ok) {
          const content = await res.text();
          output.push(`## ${f.path}\n\n\`\`\`\n${content}\n\`\`\``);
        }
      }
      return output.join('\n\n') || 'Could not read package files.';
    }

    case 'list_bundles': {
      const data = await apiGet(port, '/bundles');
      if (!data.bundles || data.bundles.length === 0) {
        return 'No bundles available yet.';
      }
      return data.bundles.map(b =>
        `**${b.displayName}** (\`${b.slug}\`)\n${b.description}\nPackages: ${b.packages.map(p => p.displayName || p.slug).join(', ')}`
      ).join('\n\n');
    }

    case 'get_bundle': {
      const bundle = await apiGet(port, `/bundles/${args.slug}`);
      return `# ${bundle.displayName}

${bundle.description}
${bundle.useCase ? `\n**Use case:** ${bundle.useCase}` : ''}

## Packages (${bundle.packages.length})

${bundle.packages.map(p => `### ${p.displayName} (\`${p.slug}\`)${p.role ? ' - ' + p.role : ''}
${p.description}
- Capabilities: ${p.capabilities.join(', ')}
- Version: ${p.version}`).join('\n\n')}

## Install all
\`\`\`bash
${bundle.packages.map(p => `beepack install ${p.slug}`).join('\n')}
\`\`\``;
    }

    case 'suggest_improvement': {
      const res = await fetch(`http://localhost:${port}/api/v1/packages/${args.slug}/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: args.title, description: args.description, codeDiff: args.codeDiff }),
      });
      if (!res.ok) {
        const err = await res.json();
        return `Error: ${err.error?.message || 'Failed to submit suggestion'}`;
      }
      const result = await res.json();
      return `Suggestion #${result.id} submitted for "${args.slug}". ${result.message}`;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

import { verifySessionToken } from './auth.js';

/**
 * Setup remote MCP endpoints on Express app
 */
export function setupRemoteMCP(app, port, db) {
  const sessions = new Map();

  // SSE endpoint - client connects here first (requires Bearer token)
  app.get('/mcp/sse', (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = req.query.token || (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);

    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Pass your PACKBEE_TOKEN as Bearer token or ?token= query param.' });
    }

    const user = verifySessionToken(token);
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token. Login again at https://packbee.dev/auth/github' });
    }

    const sessionId = crypto.randomUUID();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    sessions.set(sessionId, res);

    // Send the endpoint URL for JSON-RPC messages
    res.write(`event: endpoint\ndata: /mcp/message?sessionId=${sessionId}\n\n`);

    req.on('close', () => {
      sessions.delete(sessionId);
    });
  });

  // JSON-RPC message endpoint
  app.post('/mcp/message', async (req, res) => {
    const { sessionId } = req.query;
    const sseRes = sessions.get(sessionId);

    if (!sseRes) {
      return res.status(400).json({ error: 'Invalid or expired session. Reconnect to /mcp/sse.' });
    }

    const message = req.body;
    let response;

    try {
      if (message.method === 'initialize') {
        response = {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'packbee', version: '1.0.0' },
          },
        };
      } else if (message.method === 'notifications/initialized') {
        // Acknowledge, no response needed
        res.status(202).end();
        return;
      } else if (message.method === 'tools/list') {
        response = {
          jsonrpc: '2.0',
          id: message.id,
          result: { tools: TOOLS },
        };
      } else if (message.method === 'tools/call') {
        const { name, arguments: args } = message.params;
        try {
          const text = await handleToolCall(port, name, args || {});
          response = {
            jsonrpc: '2.0',
            id: message.id,
            result: { content: [{ type: 'text', text }] },
          };
        } catch (e) {
          response = {
            jsonrpc: '2.0',
            id: message.id,
            result: { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true },
          };
        }
      } else {
        response = {
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32601, message: `Method not found: ${message.method}` },
        };
      }
    } catch (e) {
      response = {
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32603, message: e.message },
      };
    }

    if (response) {
      // Send response via SSE
      sseRes.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
    }

    res.status(202).end();
  });

  console.log('   - MCP Remote: https://packbee.dev/mcp/sse');
}
