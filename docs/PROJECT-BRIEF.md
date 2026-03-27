# Packbee 🐝 - Project Brief

## Vision

The hive where AIs and vibe-coders share, discover, and improve APIs collaboratively.

**Tagline:** "GitHub meets ClawHub for APIs"

## Problem

- Vibe-coders (Cursor, Copilot, Claude, etc.) constantly recode the same integrations
- No centralized platform to share reusable APIs between AIs
- ClawHub exists but is limited to OpenClaw and lacks collaboration (no forks/PRs)
- 7% of skills on ClawHub leak secrets (Snyk report Feb. 2026)

## Solution

An open-source platform that combines:
- **AI-first discovery** (MCP, vector search, natural language)
- **GitHub-style collaboration** (forks, PRs, issues)
- **Trust & Quality** (auto tests, security scan, badges)
- **Compatible with all runtimes** (Cursor, Copilot, Claude, OpenClaw...)

## Personas

### 1. The Contributor
- Vibe-codes a useful integration
- Wants to share it and receive feedback
- Wants external contributions

### 2. The Consumer
- Asks their AI "connect me to Stripe/Notion"
- Wants battle-tested code
- Wants to install in 1 command

### 3. The AI
- Searches for an API in natural language
- Integrates the code automatically
- Can suggest improvements

## MVP Features (Phase 1)

1. ✅ Publish a package (HIVE.yaml + code)
2. ✅ Search by keywords + embeddings
3. ✅ Install via CLI
4. ✅ GitHub OAuth (verified namespace)
5. ✅ Package page with README + stats

## Phase 2 Features

- Issues & bug reports
- Pull requests
- Forks
- Discussions

## Phase 3 Features

- Automatic security scan
- Automatic CI tests
- Badges (tested, audited, popular)

## Package Format (HIVE.yaml)

```yaml
name: notion-sync
version: 1.2.0
description: Bidirectional sync with Notion API
author: guillaume
license: MIT

keywords: [notion, sync, database, api]

capabilities:
  - read_database
  - write_pages
  - search

requires:
  env: [NOTION_API_KEY]
  deps: [node >= 18]

compatible:
  - cursor
  - copilot
  - claude
  - openclaw

tests: ./tests/
coverage: 87%
```

## Tech Stack

- **Frontend:** Next.js or TanStack Start
- **Backend:** Convex or Supabase
- **Search:** OpenAI embeddings + pgvector
- **Auth:** GitHub OAuth
- **CLI:** Bun/Node

## Business Model

- **Free:** Unlimited publish, unlimited install, public repos
- **Pro (~$10/month):** Private packages, advanced analytics
- **Team (~$30/month):** Org namespace, audit logs, SSO

## Inspiration

- ClawHub (SKILL.md format, vector search)
- GitHub (collaboration, forks, PRs)
- npm/PyPI (versioning, trust)
- RapidAPI (API marketplace)

## Research Done

- ClawHub is open-source: https://github.com/openclaw/clawhub
- Stack: TanStack Start + Convex + OpenAI embeddings
- Security: GitHub age gate, auto-hide after 4 reports, malware detection
- Identified gap: no collaboration (forks/PRs), not oriented toward generic APIs
