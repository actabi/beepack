# Beepack

> Don't recode. Reuse.

The API library built by AI vibe coders, for AI vibe coders.

**https://beepack.dev**

## The Problem

- **84%** of developers use AI coding tools
- AIs constantly regenerate the same integrations (Notion, Stripe, etc.)
- No centralized platform to share reusable APIs
- AI code is often duplicated due to lack of context

## The Solution

Beepack enables AIs and developers to:
- **Discover** existing APIs in natural language
- **Install** in one command (`beepack install notion-sync`)
- **Integrate** directly into AI assistants via MCP
- **Publish** and share your own APIs with the community

## Quick Start

### Install the CLI

```bash
npm install -g beepack
```

### Search, install, publish

```bash
beepack search "sync with Notion"
beepack install notion-sync
beepack init
beepack publish
```

## For AIs (MCP)

### Remote (no install required)

Any AI can connect directly to Beepack - just add the MCP URL:

```json
{
  "mcpServers": {
    "beepack": {
      "url": "https://beepack.dev/mcp/sse?token=YOUR_TOKEN"
    }
  }
}
```

Get your token at https://beepack.dev/auth/github

### Local (via CLI)

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

### MCP Tools

| Tool | Description |
|------|-------------|
| `search_packages` | Natural language search |
| `list_packages` | Browse popular packages |
| `get_package_info` | Full package details and docs |
| `get_package_code` | Actual source code |

## HIVE.yaml

Every package has a `HIVE.yaml` manifest:

```yaml
name: notion-sync
version: 1.0.0
description: Bidirectional sync with Notion

keywords:
  - notion
  - sync

capabilities:
  - read_database
  - write_pages

requires:
  env:
    - NOTION_API_KEY

compatible:
  - cursor
  - copilot
  - claude
  - openclaw
```

## Self-host

```bash
git clone https://github.com/actabi/beepack.git
cd beepack
npm install
cp .env.example .env
# Edit .env with your GitHub OAuth keys
node server.js
```

### Environment variables

```bash
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=http://localhost:3011/auth/github/callback
OPENAI_API_KEY=sk-xxx  # optional, enables semantic search
```

## Project Structure

```
beepack/
├── server.js           # Express API server
├── auth.js             # GitHub OAuth
├── embeddings.js       # Semantic search (OpenAI + Qdrant)
├── mcp-remote.js       # Remote MCP server (SSE)
├── cli/                # npm CLI (published as "beepack")
│   ├── bin/beepack.js
│   └── src/
│       ├── commands.js
│       └── mcp-server.js
├── site/               # Static website
├── storage/            # Package files
└── data/               # SQLite database
```

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/packages` | List packages |
| `GET /api/v1/packages/:slug` | Package details |
| `GET /api/v1/search?q=...` | Search packages |
| `POST /api/v1/packages/:slug/upload` | Publish (auth required) |
| `GET /mcp/sse` | Remote MCP endpoint (auth required) |

## Roadmap

- [x] Backend API (Express + SQLite)
- [x] Static website with pixel art branding
- [x] CLI on npm (`npm i -g beepack`)
- [x] GitHub OAuth
- [x] Semantic search (OpenAI embeddings + Qdrant)
- [x] MCP Server (local + remote)
- [x] Package file upload and download
- [ ] Forks and pull requests
- [ ] Automatic security scan
- [ ] CI test badges
- [ ] Community features

## Contributing

Beepack is open-source. Contributions welcome.

1. Fork the repo
2. Create a branch (`git checkout -b feature/amazing`)
3. Commit your changes
4. Open a PR

## License

MIT
