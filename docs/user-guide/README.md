# Beepack User Guide

**Beepack** is a narrow registry of source code for APIs where frontier LLMs still hallucinate: French regulatory (SIRET/SIREN), CDN/domain heuristics, and breaking-change zones like Auth.js v4→v5. For commodity integrations - Stripe, OAuth, OpenAI - just ask your LLM directly.

> "For the 10% where the LLM still gets it wrong."

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
| [Bundles](./bundles.md) | Install and create curated package collections |
| [Suggestions](./suggestions.md) | Propose improvements to existing packages |
| [ClawHub Integration](./clawhub-integration.md) | Use Beepack from OpenClaw agents via the ClawHub API |
| [Security Pipeline](./security-pipeline.md) | How the 3-layer security pipeline works |

---

## What is Beepack?

Beepack is a narrow registry sharing **source code** (not compiled libraries) for integrations where frontier LLMs still reliably fail. Each package is:

- **Niche by design** - only APIs where training data is thin, regional, or recently broken
- **Source code** - pull it, read it, adapt it, own it (no runtime dep)
- **Security-scanned** - 3-layer pipeline (static analysis, LLM review, community reports)
- **AI-friendly** - searchable by AI assistants via MCP

### Who is it for?

- **French indie hackers and solo devs** building on SIRET/TVA/URSSAF/FranceConnect territory
- **AI assistants** (Claude, Copilot, Cursor) that need a reliable source for the niches they hallucinate
- **Teams** dealing with recent SDK breaking changes (Auth.js v5, Linear GraphQL churn)

---

## Quick Start

```bash
# Install the CLI
npm install -g @actabi/beepack

# Authenticate with GitHub
beepack login

# Search for a package in our niche
beepack search "french siret validator"

# Pull the code into your project
beepack pull siret-utils
```

The source code lands in `./packages/siret-utils/`. Read it, adapt it, ship it.
