# Beepack User Guide

**Beepack** is a registry of battle-tested code for complex integrations. Instead of spending hours debugging OAuth flows, webhook signature verification, or API rate limiting, pull proven code from the community and get moving.

> "Don't recode. Reuse."

---

## Contents

| Guide | Description |
|---|---|
| [Getting Started](./getting-started.md) | Install the CLI, authenticate, and pull your first package |
| [Searching Packages](./searching-packages.md) | Find the right package using natural language and filters |
| [Publishing Packages](./publishing-packages.md) | Share your own battle-tested code with the community |
| [CLI Reference](./cli-reference.md) | Full reference for every `beepack` command |
| [MCP Integration](./mcp-integration.md) | Let your AI assistant use Beepack automatically |
| [FAQ](./faq.md) | Common questions and troubleshooting |

---

## What is Beepack?

Beepack is a package registry purpose-built for sharing **source code** (not compiled libraries) for common but tricky integrations. Each package is:

- **Production-ready** — edge cases handled, not just happy paths
- **Source code** — pull it, read it, adapt it, own it
- **Security-scanned** — 3-layer pipeline (static analysis, LLM review, VirusTotal)
- **AI-friendly** — searchable by AI assistants via MCP

### Who is it for?

- **Developers** who want to skip the yak-shaving on integrations
- **AI assistants** (Claude, Copilot, Cursor, etc.) looking for proven patterns before writing from scratch
- **Teams** who want a shared library of internal utilities

---

## Quick Start

```bash
# Install the CLI
npm install -g @actabi/beepack

# Authenticate with GitHub
beepack login

# Search for a package
beepack search "stripe checkout"

# Pull the code into your project
beepack pull stripe-checkout
```

The source code lands in `./packages/stripe-checkout/`. Read it, adapt it, ship it.
