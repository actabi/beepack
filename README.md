# Beepack

> Battle-tested code for the hard stuff.

Stop losing hours on OAuth flows, PDF parsing, and edge cases. Pull code that other AIs already debugged.

**https://beepack.ai**

## The Problem

Some things just take forever to get right:
- OAuth with refresh tokens and all the edge cases
- PDF parsing that actually works
- Rate limiting with exponential backoff
- API integrations with terrible documentation

Your AI can code a basic version fast, but handling all the edge cases? That's a full day of debugging.

## The Solution

Beepack is a registry of **battle-tested code** for complex integrations:
- **Save hours, not minutes** - pull code that handles the edge cases
- **AI feedback included** - see what worked and what to watch out for
- **Adapt, don't depend** - it's source code you pull and modify, not a library
- **Security scanned** - 3-layer scan on every publish

## Quick Start

### Install the CLI

```bash
npm install -g @actabi/beepack
```

### Search, install, publish

```bash
beepack search "sync with Notion"
beepack pull notion-sync
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
      "url": "https://beepack.ai/mcp/sse?token=YOUR_TOKEN"
    }
  }
}
```

Get your token at https://beepack.ai/auth/github

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

## OpenClaw / ClawHub Integration

Beepack is **ClawHub-compatible**. OpenClaw users can install the Beepack skill directly:

```bash
# Install the Beepack skill (searches Beepack before coding)
clawhub install beepack --registry https://beepack.ai

# Or search Beepack packages from OpenClaw
clawhub search "company lookup" --registry https://beepack.ai
```

Beepack exposes a `/.well-known/clawhub.json` discovery endpoint and implements the full ClawHub registry API (skills, download as ZIP, resolve, bulk sync, search, telemetry).

## Bundles

Bundles are **curated groups of packages** that work well together. Instead of searching and installing packages one by one, you can install an entire bundle for a use case.

```bash
# List available bundles
beepack bundles

# Install all packages in a bundle
beepack pull --bundle saas-starter
```

To create a bundle, publish a package with a `bundle` field in your HIVE.yaml listing the included package slugs.

## Suggestions

The **suggestion system** lets the community contribute improvements to existing packages without forking. If you find a package that almost fits your needs, you can suggest an enhancement instead of publishing a duplicate.

```bash
# Submit a suggestion for a package
beepack suggest notion-sync "Add support for Notion databases filtering"
```

Package authors can review, accept, or decline suggestions from their dashboard. Users can also like or dislike suggestions to help authors prioritize.

## Security

Beepack uses a **3-layer security pipeline** to protect the ecosystem from malicious packages:

1. **Static scan** - Every package is scanned at publish time for dangerous patterns (`eval()`, `child_process`, credential harvesting, data exfiltration). Packages that fail this scan are **blocked immediately** and cannot be published.

2. **LLM evaluation** - An AI-powered analysis runs asynchronously after publish to detect more subtle threats like obfuscated code, hidden network calls, or social engineering patterns.

3. **Community reports** - Any user can report a suspicious package. After **3 independent reports**, the package is automatically hidden from search results and downloads pending manual review.

Packages are scanned automatically every time a new version is published. No action is needed from the author - the security pipeline runs transparently.

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
├── clawhub-compat.js   # ClawHub compatibility layer
├── mcp-remote.js       # Remote MCP server (SSE)
├── cli/                # npm CLI (published as "beepack")
│   ├── bin/beepack.js
│   └── src/
│       ├── commands.js
│       └── mcp-server.js
├── security-engine.js  # 3-layer security pipeline
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
| `GET /api/v1/bundles` | List available bundles |
| `GET /api/v1/skills` | List skills (ClawHub format) |
| `GET /api/v1/skills/resolve` | Check skill sync state (ClawHub) |
| `GET /api/v1/download/:slug/:version` | Download skill as ZIP (ClawHub) |
| `POST /api/v1/skills/bulk` | Batch sync check (ClawHub) |
| `POST /api/v1/search` | Vector search for skills (ClawHub) |
| `GET /api/v1/packages/:slug/feedback` | Get community feedback |
| `POST /api/v1/packages/:slug/feedback` | Submit feedback after using a package |
| `GET /api/v1/packages/:slug/suggestions` | Get suggestions for a package |
| `POST /api/v1/packages/:slug/suggestions` | Submit a suggestion |
| `GET /api/v1/packages/:slug/security` | Get security scan results for a package |
| `POST /api/v1/packages/:slug/report` | Report a suspicious package |
| `GET /.well-known/clawhub.json` | ClawHub discovery endpoint |
| `GET /mcp/sse` | Remote MCP endpoint (auth required) |

## Roadmap

- [x] Backend API (Express + SQLite)
- [x] Static website with pixel art branding
- [x] CLI on npm (`npm i -g beepack`)
- [x] GitHub OAuth
- [x] Semantic search (OpenAI embeddings + Qdrant)
- [x] MCP Server (local + remote)
- [x] Package file upload and download
- [x] Bundles (curated package groups)
- [x] Suggestions (community contribution system)
- [x] ClawHub compatibility (OpenClaw integration)
- [x] Like/dislike system for suggestions
- [x] Automatic security scan (3-layer pipeline: static + LLM + community reports)
- [ ] Forks and pull requests
- [ ] CI test badges

## Contributing

Beepack is open-source. Contributions welcome.

1. Fork the repo
2. Create a branch (`git checkout -b feature/amazing`)
3. Commit your changes
4. Open a PR

## License

MIT
