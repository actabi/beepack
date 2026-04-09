# FAQ

Common questions about Beepack.

---

## General

### What is Beepack?

Beepack is a registry of battle-tested source code for common but tricky integrations — OAuth flows, webhook signature verification, payment processing, file storage, email delivery, and more. Instead of spending hours debugging edge cases, pull proven code from the community.

### Is Beepack a package manager like npm?

No. Beepack distributes **source code**, not compiled packages. When you `beepack pull stripe-checkout`, you get the actual `.js` files in your project directory. There is no runtime dependency on Beepack — the code is yours to read, adapt, and ship.

### Is it free to use?

Yes. Browsing and pulling packages is free and anonymous. Publishing requires a GitHub account.

### What kinds of packages are on Beepack?

Integration code: Stripe checkout/webhooks, OAuth flows, email sending, S3 storage, PDF generation, Slack/Discord messaging, rate limiting, and more. Packages solve specific integration problems that have tricky edge cases.

---

## Searching & Pulling

### How do I find a package for my use case?

Use natural language:

```bash
beepack search "send email with attachments"
beepack search "verify Stripe webhook signature"
```

Or browse by category with capability filters:

```bash
beepack search "" --capabilities "oauth,token-refresh"
```

### Can I trust the packages?

All packages go through a 3-layer security pipeline: static code analysis, LLM review, and VirusTotal scanning. Packages with critical security findings are blocked immediately.

That said, always review code before running it in production. The security scan reduces risk but is not a substitute for reading the code yourself.

### How do I pull a specific version?

```bash
beepack pull stripe-checkout --version 1.1.0
```

### Where does pulled code go?

By default, `./packages/<package-name>/`. Customize with `--dir`:

```bash
beepack pull stripe-checkout --dir ./src/integrations
```

### Can I update a pulled package?

Pull the new version into the same directory:

```bash
beepack pull stripe-checkout --version 1.2.0 --dir ./packages
```

This overwrites the existing files. Review the diff before committing.

### Is pulled code added to my git repo?

`beepack init` adds `packages/` to `.gitignore` by default. If you want to commit pulled packages, remove that entry. Either approach is valid — committing gives you a stable snapshot; gitignoring means you always pull fresh.

---

## Publishing

### Do I need an account to publish?

Yes. You need a GitHub account that is at least 14 days old. Run `beepack login` to authenticate.

### What file types can I include?

Text files only: `.js`, `.ts`, `.json`, `.yaml`, `.yml`, `.md`, `.html`, `.css`, `.py`, `.sh`, and other text-based source formats. Binary files are rejected.

### What is HIVE.yaml?

The package manifest. It describes your package: name, version, description, capabilities, required environment variables, and compatible runtimes. It must be present in your package directory when you publish. See [Publishing Packages](./publishing-packages.md#2-write-the-hiveyaml-manifest) for the full schema.

### Why was my package rejected by the static scanner?

The static scanner blocks packages with patterns associated with malicious code:
- `eval()`, `new Function()`, dynamic imports with user input
- `child_process` / `exec` / `spawn`
- Code that sends environment variables to external URLs
- Obfuscated code (hex strings, large base64 blobs)
- `curl | bash` in install instructions

If your package was flagged incorrectly, check whether you can restructure the code to avoid these patterns, or open a support issue.

### Can I update an existing package?

Yes. Increment the `version` field in `HIVE.yaml` and run `beepack publish` again. Previous versions remain accessible.

### What is the difference between publishing and suggesting an improvement?

If a package already exists for your use case but is missing something, suggest an improvement to the existing package rather than publishing a new one. This keeps the registry focused and channels improvements to packages that already have community traction.

### My publish is failing with a duplicate warning. What do I do?

If a similar package already exists, consider:
1. Using `beepack info <existing-package>` to see if it already covers your use case
2. Submitting a suggestion to improve the existing package
3. Publishing anyway if your package is genuinely different (the warning is not a block)

---

## AI & MCP

### How does MCP work with Beepack?

MCP (Model Context Protocol) lets AI assistants call Beepack tools directly. The AI can search packages, read their source code, and use them — without you switching context. See the [MCP Integration guide](./mcp-integration.md).

### Which AI tools are supported?

Any tool that supports MCP: Claude Code, Cursor, GitHub Copilot (with MCP support), Windsurf, and others. Beepack also provides non-MCP integration files (`.cursorrules`, `AGENTS.md`, etc.) for tools that don't use MCP.

### Do AI assistants need a token to use MCP?

For local MCP: no token required for read-only operations (search, list, get info, get code).
For remote MCP: a token is required. Get one by authenticating at `https://beepack.ai/auth/github`.

### How do I set up an AI assistant to check Beepack before writing integration code?

Two options:

1. **Project-level:** Run `beepack init` in your project. This creates AI-specific config files that instruct the AI to check Beepack first.
2. **MCP:** Configure the MCP server so the AI can query Beepack as a tool. Run `beepack setup` or configure manually. See [MCP Integration](./mcp-integration.md).

---

## Security

### How are packages scanned?

Three layers:
1. **Static analysis** — regex patterns detect eval, exec, credential harvesting, obfuscation, and other dangerous patterns. Blocking (synchronous).
2. **LLM review** — GPT-4o-mini evaluates purpose-capability alignment, credential proportionality, and scope creep. Async.
3. **VirusTotal** — files submitted for malware analysis. Async.

Critical findings from Layer 1 block the package immediately. Findings from Layers 2 and 3 can auto-hide packages pending manual review.

### A package looks malicious. How do I report it?

Use the report endpoint via the web UI or API:

```
POST /api/v1/packages/:slug/report
```

Three independent reports automatically hide the package pending review.

### Is my pulled code safe to use?

Review it yourself before running in production. The security pipeline reduces risk but automated scanning cannot catch every possible issue. Read the code, understand what it does, and verify the required env vars match what's described.

---

## Troubleshooting

### `beepack: command not found`

The CLI is not installed or not on your PATH:

```bash
npm install -g @actabi/beepack
```

If installed but not found, check your npm global bin directory:

```bash
npm config get prefix   # Should be on your PATH
```

### `beepack login` fails or browser doesn't open

Try providing a token directly:

```bash
beepack login --token YOUR_GITHUB_TOKEN
```

Or set the environment variable:

```bash
export BEEPACK_TOKEN=YOUR_GITHUB_TOKEN
```

### `beepack publish` fails with "HIVE.yaml not found"

Run `beepack publish` from the directory that contains your `HIVE.yaml` file, not from a parent directory.

### Search returns no results

Try a broader query. If using `--capabilities`, check the capability name is spelled correctly. Run `beepack list` to verify the registry is reachable.

### MCP tools not appearing in my AI assistant

1. Verify `beepack mcp-server` runs without errors in your terminal
2. Restart the AI assistant after updating MCP config
3. Check the config file is in the correct location for your tool (see [MCP Integration](./mcp-integration.md))
