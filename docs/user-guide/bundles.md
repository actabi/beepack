# Bundles

A bundle is a named collection of packages that install together. Instead of pulling five related packages one at a time, a bundle installs all of them with a single command and a single entry in your project manifest.

---

## What Bundles Are

Bundles are defined by package authors in `HIVE.yaml`. When you install a bundle, Beepack resolves every package it includes, downloads them all, and writes each to its own subdirectory under `./packages/`. There are no extra wrappers — you get the same source code you would get from pulling each package individually.

Bundles are useful for:

- Bootstrapping a new project with a known-good set of utilities
- Sharing a curated stack within a team
- Letting AI assistants pull everything they need for a use case in one step

---

## Installing a Bundle

```bash
beepack pull --bundle saas-starter
```

This resolves the bundle, prints the package list, and pulls each one:

```
Resolving bundle: saas-starter
  stripe-checkout          v2.1.0
  stripe-webhooks          v1.4.2
  resend-transactional     v1.0.1
  clerk-session-verify     v2.0.0
  upstash-rate-limit       v1.2.3

Pulling 5 packages into ./packages/
✓ stripe-checkout
✓ stripe-webhooks
✓ resend-transactional
✓ clerk-session-verify
✓ upstash-rate-limit

Done. 5 packages pulled.
```

**Options:**

```bash
# Pull into a custom directory
beepack pull --bundle saas-starter --dir ./src/integrations

# Preview what a bundle includes without pulling
beepack info --bundle saas-starter

# Pull a specific version of a bundle
beepack pull --bundle saas-starter --version 1.0.0
```

---

## Creating a Bundle

Add a `bundle` field to your `HIVE.yaml`. The bundle is published alongside your package — any package can act as a bundle entry point.

```yaml
name: saas-starter
version: 1.0.0
displayName: SaaS Starter Bundle
description: |
  Everything you need to wire up payments, email, auth, and rate limiting
  in a new SaaS app. Battle-tested across a dozen production deployments.

bundle:
  - stripe-checkout
  - stripe-webhooks
  - resend-transactional
  - clerk-session-verify
  - upstash-rate-limit
```

### Bundle Rules

- Each entry must be an existing Beepack package slug.
- Versions are resolved to the latest stable at install time unless pinned.
- To pin a version, use `slug@version` notation:

```yaml
bundle:
  - stripe-checkout@2.1.0
  - stripe-webhooks@1.4.2
  - resend-transactional
```

- A bundle package can itself contain source files — it's common to include a `README.md` or a lightweight `index.js` that re-exports or wires things together.
- Circular bundle references are rejected at publish time.

---

## Searching for Bundles

```bash
beepack search --type bundle "saas"
```

Or via MCP:

```
search_packages(query: "saas starter", type: "bundle")
```

---

## Example Bundles

| Bundle | Includes |
|---|---|
| `saas-starter` | Stripe, Resend, Clerk, Upstash rate limiting |
| `webhook-toolkit` | GitHub, Stripe, Slack, and Linear webhook verification |
| `ai-infra` | OpenAI client, vector upsert, token counting, streaming SSE |
| `file-pipeline` | S3 upload, image resize, MIME validation, signed URL generation |

Browse the full list:

```bash
beepack list --type bundle
```

---

## Next Steps

- [Publishing Packages](./publishing-packages.md) — full `HIVE.yaml` reference
- [CLI Reference](./cli-reference.md) — all `pull` and `info` options
