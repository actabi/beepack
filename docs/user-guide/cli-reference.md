# CLI Reference

Complete reference for all `beepack` commands. Install via:

```bash
npm install -g @actabi/beepack
```

---

## Authentication

### `beepack login`

Authenticate with GitHub.

```bash
beepack login [options]
```

| Option | Description |
|---|---|
| `-t, --token <token>` | Provide a GitHub token directly (useful for CI) |

Stores credentials in `~/.beepack/config.json`. Alternatively, set `BEEPACK_TOKEN` in your environment.

---

### `beepack whoami`

Show the currently authenticated user.

```bash
beepack whoami
```

---

## Discovery

### `beepack search`

Search packages using natural language.

```bash
beepack search <query> [options]
```

| Option | Description |
|---|---|
| `-c, --capabilities <caps>` | Filter by capabilities (comma-separated) |
| `--compatible <runtime>` | Filter by runtime: `cursor`, `copilot`, `claude`, `openclaw`, `windsurf` |
| `-n, --limit <number>` | Max results (default: 10) |

**Examples:**

```bash
beepack search "webhook verification"
beepack search "email" --capabilities "send-email,attachments" --limit 5
beepack search "auth" --compatible claude
```

---

### `beepack list` (alias: `ls`)

List popular packages.

```bash
beepack list [options]
```

| Option | Description |
|---|---|
| `-s, --sort <field>` | Sort by `downloads` (default) or `updated` |
| `-n, --limit <number>` | Max results (default: 10) |

**Examples:**

```bash
beepack list
beepack list --sort updated --limit 20
```

---

### `beepack info`

Get detailed information about a package.

```bash
beepack info <package>
```

Returns: description, capabilities, required env vars, compatible runtimes, version history, stats.

**Example:**

```bash
beepack info siret-utils
```

---

### `beepack bundles`

List available package bundles (curated groups for common use cases).

```bash
beepack bundles
```

---

## Package Management

### `beepack pull` (alias: `p`)

Download package source code into your project.

```bash
beepack pull <package> [options]
# or pull a bundle:
beepack pull --bundle <bundle-name>
```

| Option | Description |
|---|---|
| `-v, --version <version>` | Package version (default: latest) |
| `-d, --dir <directory>` | Target directory (default: `./packages`) |
| `--bundle <name>` | Pull all packages in a bundle |

**Examples:**

```bash
beepack pull siret-utils
beepack pull siret-utils --version 1.0.0
beepack pull cdn-url-cleaner --dir ./src/integrations
beepack pull nextauth-setup
```

After pulling, files are in `<dir>/<package-name>/` along with a `BEEPACK.yaml` manifest.

---

## Publishing

### `beepack init`

Initialize a project for publishing and AI assistant integration.

```bash
beepack init [options]
```

| Option | Description |
|---|---|
| `-y, --yes` | Skip interactive prompts, use defaults |

Creates integration files for Claude Code, Cursor, Copilot, Windsurf, and generic AI assistants. Creates `packages/` directory. Updates `.gitignore`.

---

### `beepack publish`

Publish your package to Beepack. Run from the directory containing `HIVE.yaml`.

```bash
beepack publish [options]
```

| Option | Description |
|---|---|
| `--dry-run` | Validate without publishing |

Requirements:
- `HIVE.yaml` present in current directory
- Authenticated (`beepack login`)
- GitHub account 14+ days old
- Max 10 publishes/hour, 20/day

**Example:**

```bash
cd my-package/
beepack publish --dry-run   # Validate first
beepack publish             # Publish for real
```

---

## Community

### `beepack like`

Upvote a package. Requires authentication.

```bash
beepack like <package>
```

---

### `beepack dislike`

Downvote a package with a reason. Requires authentication.

```bash
beepack dislike <package> --reason "Missing error handling for expired tokens"
```

| Option | Required | Description |
|---|---|---|
| `-r, --reason <reason>` | Yes | Explanation for the downvote |

---

### `beepack link`

Suggest that two packages work well together.

```bash
beepack link <package1> <package2> [options]
```

| Option | Description |
|---|---|
| `-r, --reason <reason>` | Why they work together |
| `--agent <name>` | Your agent/tool name |

**Example:**

```bash
beepack link siret-utils cms-detector \
  --reason "French SIRET validation alongside CMS detection for supplier onboarding" \
  --agent claude
```

---

## AI & MCP

### `beepack setup`

Configure AI assistants in the current project to use Beepack automatically.

```bash
beepack setup
```

Adds Beepack instructions to Claude Code CLAUDE.md, Cursor rules, VS Code settings, and other AI config files found in the project.

---

### `beepack mcp-server`

Start the local MCP (Model Context Protocol) server. Used by AI assistants to call Beepack tools directly.

```bash
beepack mcp-server
```

Typically invoked automatically by your AI assistant via MCP config rather than run manually. See [MCP Integration](./mcp-integration.md).

---

## Environment Variables

| Variable | Description |
|---|---|
| `BEEPACK_TOKEN` | GitHub authentication token (alternative to `beepack login`) |

---

## Global Options

| Option | Description |
|---|---|
| `--version` | Print CLI version |
| `--help` | Print help for any command |

```bash
beepack --help
beepack pull --help
beepack publish --help
```
