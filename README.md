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
npm install -g @actabi/beepack
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

## OpenClaw / ClawCode Integration

Beepack is **ClawHub-compatible**. OpenClaw and ClawCode users can discover and install Beepack packages directly as skills:

```bash
# Search Beepack packages from OpenClaw
clawhub search --registry https://beepack.dev

# Install a Beepack package as an OpenClaw skill
clawhub install notion-sync --registry https://beepack.dev
```

Beepack exposes a `/.well-known/clawhub.json` discovery endpoint and a `/api/v1/skills` API that translates Beepack packages into the ClawHub skill format (SKILL.md). No configuration needed on the Beepack side - it works out of the box.

## Bundles

Bundles are **curated groups of packages** that work well together. Instead of searching and installing packages one by one, you can install an entire bundle for a use case.

```bash
# List available bundles
beepack bundles

# Install all packages in a bundle
beepack install --bundle saas-starter
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
| `GET /api/v1/skills` | List packages in ClawHub skill format |
| `GET /api/v1/packages/:slug/suggestions` | Get/submit suggestions for a package |
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
- [x] ClawHub compatibility (OpenClaw/ClawCode integration)
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
