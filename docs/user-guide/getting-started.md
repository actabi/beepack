# Getting Started with Beepack

This guide walks you through installing the CLI, authenticating, pulling your first package, and setting up AI assistant integration.

---

## 1. Install the CLI

Beepack is distributed as an npm package. Node 18+ is required.

```bash
npm install -g @actabi/beepack
```

Verify the installation:

```bash
beepack --version
```

---

## 2. Authenticate

Beepack uses GitHub for authentication. Run:

```bash
beepack login
```

This opens a browser window for GitHub OAuth. After authorizing, your token is stored in `~/.beepack/config.json`.

**Scripted / CI environments:**

```bash
beepack login --token YOUR_GITHUB_TOKEN
```

Or set the environment variable:

```bash
export BEEPACK_TOKEN=YOUR_GITHUB_TOKEN
```

Confirm you are logged in:

```bash
beepack whoami
```

> **Note:** Authentication is required to publish packages, leave feedback, and use certain MCP features. Browsing and pulling packages is anonymous.

---

## 3. Find a Package

Search in natural language:

```bash
beepack search "french siret validator"
```

Or browse popular packages:

```bash
beepack list
```

Get full details on a package before pulling:

```bash
beepack info siret-utils
```

---

## 4. Pull a Package

Pull source code into your project:

```bash
beepack pull siret-utils
```

By default, files land in `./packages/siret-utils/`. A `BEEPACK.yaml` manifest is created in that directory tracking the package name and version.

**Options:**

```bash
# Pull a specific version
beepack pull siret-utils --version 1.2.0

# Pull into a custom directory
beepack pull siret-utils --dir ./src/integrations
```

The pulled code is plain source — read it, understand it, adapt it to your needs. There is no runtime dependency on Beepack.

---

## 5. Initialize Your Project (optional)

If you want AI assistants to automatically use Beepack for integrations in your project:

```bash
beepack init
```

This creates integration files for all major AI tools:

| File | Purpose |
|---|---|
| `.claude/commands/beepack.md` | Claude Code command |
| `.cursor/rules/beepack.mdc` | Cursor rules |
| `.cursorrules` | Legacy Cursor format |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.windsurfrules` | Windsurf |
| `AGENTS.md` | Generic AI assistants |
| `mcp-config.json` | MCP server config |
| `packages/` | Directory for pulled packages |

After running `beepack init`, AI assistants working in your project will check Beepack before implementing integrations from scratch.

---

## 6. Set Up AI Integration (MCP)

For the best experience, connect Beepack directly to your AI assistant via MCP so it can search and pull packages automatically.

See the full [MCP Integration guide](./mcp-integration.md) for instructions per tool. The quick setup:

```bash
beepack setup
```

This auto-configures the MCP server for Claude Code, Cursor, and VS Code.

Or configure manually in your MCP config:

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

---

## What's Next?

- [Search for packages](./searching-packages.md) — natural language queries, filters, bundles
- [Publish a package](./publishing-packages.md) — share your own code
- [CLI Reference](./cli-reference.md) — all commands and options
- [MCP Integration](./mcp-integration.md) — connect AI assistants
