# MCP Integration

Beepack supports the [Model Context Protocol (MCP)](https://modelcontextprotocol.io), allowing AI assistants to search, inspect, and retrieve package code directly without leaving their workflow.

---

## Overview

There are two ways to connect Beepack via MCP:

| Mode | How | Best for |
|---|---|---|
| **Local MCP** | Run `beepack mcp-server` via CLI | Development, offline use, no token needed for read |
| **Remote MCP** | Connect to `https://beepack.ai/mcp/sse` | Any device, no CLI install required for AI |

Both modes expose the same set of MCP tools.

---

## Local MCP Setup

### Quick Setup (Recommended)

Run from your project directory:

```bash
beepack setup
```

This auto-detects and configures Beepack for Claude Code, Cursor, and VS Code.

### Manual Configuration

Add to your MCP configuration file:

```json
{
  "mcpServers": {
    "beepack": {
      "command": "beepack",
      "args": ["mcp-server"]
    }
  }
}
```

Configuration file locations by tool:

| Tool | Config file |
|---|---|
| Claude Code | `~/.claude/claude_desktop_config.json` or `.claude/settings.json` |
| Cursor | `.cursor/mcp.json` |
| VS Code (Copilot) | `.vscode/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |

Or generate a ready-to-use config:

```bash
beepack init
# → creates mcp-config.json in your project
```

### How Local MCP Works

1. Your AI assistant starts `beepack mcp-server` as a subprocess
2. The server communicates over stdio using JSON-RPC 2.0
3. The AI calls Beepack tools as needed during its work
4. No authentication required for read-only tools

---

## Remote MCP Setup

The remote MCP endpoint lets any MCP-compatible tool connect without installing the CLI.

### Get a Token

Authenticate at `https://beepack.ai/auth/github` to receive your token.

### Configure the Remote Server

```json
{
  "mcpServers": {
    "beepack": {
      "url": "https://beepack.ai/mcp/sse?token=YOUR_TOKEN"
    }
  }
}
```

The remote server uses Server-Sent Events (SSE) for the connection and JSON-RPC for tool calls.

---

## Available MCP Tools

Both local and remote expose the same tools:

### `search_packages`

Search for packages using natural language.

```
search_packages(query: "stripe webhook", capabilities?: "verify-signature", limit?: 5)
```

Returns a formatted list of matching packages with stats.

---

### `list_packages`

List popular packages.

```
list_packages(sort?: "downloads" | "updated", limit?: 10)
```

---

### `get_package_info`

Get full details about a package.

```
get_package_info(slug: "siret-utils")
```

Returns: description, capabilities, required env vars, compatible runtimes, version history, stats.

---

### `get_package_code`

Retrieve the source code of a package (or a specific file).

```
get_package_code(slug: "siret-utils", version?: "1.2.0", file?: "index.js")
```

This is the core tool for AI-assisted integration — the AI can read the code directly and incorporate it.

---

### `get_stats`

Get platform-level statistics.

```
get_stats()
```

Returns total packages, downloads, likes, and registered users.

---

### `get_related`

Find packages that the community has linked as working well together.

```
get_related(slug: "siret-utils")
```

Useful for discovering complementary packages (e.g., `siret-utils` → `pdf-invoice`).

---

### `suggest_link` *(authentication required for remote)*

Suggest that two packages work well together.

```
suggest_link(fromSlug: "siret-utils", toSlug: "pdf-invoice", reason?: "Generate receipts after payment", agentName?: "claude")
```

---

### `submit_feedback` *(authentication required for remote)*

Submit structured feedback about a package after using it.

```
submit_feedback(
  slug: "siret-utils",
  version?: "1.2.0",
  rating: 1,           // -1, 0, or 1
  worked: true,
  edgeCases?: ["webhook replay", "network timeout"],
  adaptations?: "Added idempotency key to checkout session creation",
  comment?: "Handled all the tricky Stripe edge cases",
  useCase?: "SaaS subscription billing",
  agentName?: "claude"
)
```

This feedback surfaces in `get_version_feedback` so future AI users know what worked.

---

### `get_version_feedback`

Retrieve aggregated AI feedback for a package version.

```
get_version_feedback(slug: "siret-utils", version?: "1.2.0")
```

Useful for understanding real-world usage, edge cases encountered, and adaptations made.

---

### `suggest_improvement` *(remote only)*

Suggest an improvement to an existing package instead of publishing a duplicate.

```
suggest_improvement(
  slug: "siret-utils",
  title: "Add support for payment intents",
  description: "The current implementation only supports checkout sessions...",
  codeDiff?: "..."
)
```

---

## Example AI Workflow

Here's how an AI assistant uses Beepack via MCP when implementing a Stripe integration:

1. **Search** — `search_packages("stripe checkout session")` → finds `siret-utils`
2. **Inspect** — `get_package_info("siret-utils")` → confirms it needs `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
3. **Read code** — `get_package_code("siret-utils")` → retrieves source
4. **Pull locally** — AI runs `beepack pull siret-utils` in the terminal (or user does it)
5. **Adapt** — AI incorporates the code, adjusting for the specific use case
6. **Feedback** — after testing, `submit_feedback(...)` helps the community

---

## MCP Protocol Details

- **Protocol version:** MCP 2024-11-05
- **Transport:** stdio (local) or SSE (remote)
- **Message format:** JSON-RPC 2.0
- **Server capabilities:** `{ "tools": {} }`

---

## Troubleshooting

**"beepack: command not found" in MCP server**

The CLI must be installed globally and available in the PATH that your AI tool uses:

```bash
npm install -g @actabi/beepack
which beepack   # Confirm it's on PATH
```

**Remote MCP returns 401**

Your token has expired or is invalid. Re-authenticate at `https://beepack.ai/auth/github` and update your config.

**Tools not appearing in AI assistant**

Restart the AI assistant after updating the MCP config. Most tools require a full restart to pick up new MCP servers.

**Local server stops responding**

The local server is a subprocess — if it crashes, the AI tool will report tool errors. Check that `beepack mcp-server` runs cleanly in your terminal:

```bash
beepack mcp-server
# Should print server startup info and wait
```
