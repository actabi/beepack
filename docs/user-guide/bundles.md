# Bundles

A bundle is a named collection of packages that install together. Instead of pulling multiple related packages one at a time, a bundle installs all of them with a single command and a single entry in your project manifest.

> **Note (2026-04-20):** Beepack pivoted to a narrow French/regulatory + LLM-hallucination-zone focus. The current catalog is 5 packages. Bundles remain a supported feature but are thin until the catalog grows (gated by real-user validation).

---

## What Bundles Are

Bundles are defined by package authors in `HIVE.yaml`. When you install a bundle, Beepack resolves every package it includes, downloads them all, and writes each to its own subdirectory under `./packages/`. There are no extra wrappers - you get the same source code you would get from pulling each package individually.

Bundles are useful for:

- Bootstrapping a new project with a known-good set of niche utilities
- Sharing a curated stack within a team building on the French market
- Letting AI assistants pull everything they need for a regional use case in one step

---

## Installing a Bundle

```bash
beepack pull --bundle fr-business-starter
```

This resolves the bundle, prints the package list, and pulls each one:

```
Resolving bundle: fr-business-starter
  siret-utils              v1.0.0
  cdn-url-cleaner          v1.0.0
  cms-detector             v1.0.0

Pulling 3 packages into ./packages/
OK siret-utils
OK cdn-url-cleaner
OK cms-detector

Done. 3 packages pulled.
```

**Options:**

```bash
# Pull into a custom directory
beepack pull --bundle fr-business-starter --dir ./src/integrations

# Preview what a bundle includes without pulling
beepack info --bundle fr-business-starter

# Pull a specific version of a bundle
beepack pull --bundle fr-business-starter --version 1.0.0
```

---

## Creating a Bundle

Add a `bundle` field to your `HIVE.yaml`. The bundle is published alongside your package - any package can act as a bundle entry point.

```yaml
name: fr-business-starter
version: 1.0.0
displayName: French Business Data Starter
description: |
  Niche integrations for onboarding French SMB suppliers: SIRET validation,
  CDN image cleanup for supplier logos, and tech-stack detection.

bundle:
  - siret-utils
  - cdn-url-cleaner
  - cms-detector
```

### Bundle Rules

- Each entry must be an existing Beepack package slug.
- Versions are resolved to the latest stable at install time unless pinned.
- To pin a version, use `slug@version` notation:

```yaml
bundle:
  - siret-utils@1.0.0
  - cdn-url-cleaner@1.0.0
  - cms-detector
```

- A bundle package can itself contain source files - it's common to include a `README.md` or a lightweight `index.js` that re-exports or wires things together.
- Circular bundle references are rejected at publish time.

---

## Searching for Bundles

```bash
beepack search --type bundle "french"
```

Or via MCP:

```
search_packages(query: "french business starter", type: "bundle")
```

---

## Next Steps

- [Publishing Packages](./publishing-packages.md) - full `HIVE.yaml` reference
- [CLI Reference](./cli-reference.md) - all `pull` and `info` options
