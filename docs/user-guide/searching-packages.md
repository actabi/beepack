# Searching for Packages

Beepack supports natural language search backed by keyword matching and optional semantic embeddings. This guide covers all the ways to find what you need.

---

## Basic Search

```bash
beepack search "french siret validator"
beepack search "cdn image url cleanup"
beepack search "auth.js v5"
```

Results show package name, description, stats (likes/dislikes/downloads), and a relevance score.

**Example output:**

```
siret-utils   1.0.0
  Validate and format French business IDs (SIRET/SIREN) with the Luhn algorithm.
  Zero dependencies.
  [score: 0.94]

cms-detector  1.0.0
  Detect CMS platforms, JS frameworks, analytics tools, and server tech from any URL.
  [score: 0.52]
```

---

## Filtering Results

### By Capability

Capabilities are specific things a package can do. Filter to find packages that perform a particular action:

```bash
beepack search "stripe" --capabilities "verify-webhook-signature"
beepack search "auth" --capabilities "oauth,token-refresh"
```

Common capabilities in the current catalog: `validate_siret`, `format_siret`, `format_siren`, `clean_cdn_url`, `detect_cms`, `detect_framework`, `configure_authjs_v5`, `linear_issue_crud`.

### By Compatible Runtime

Find packages validated for a specific AI runtime:

```bash
beepack search "siret" --compatible claude
beepack search "auth.js" --compatible cursor
```

Supported values: `cursor`, `copilot`, `claude`, `openclaw`, `windsurf`.

### Limit Results

```bash
beepack search "oauth" --limit 5
```

Default limit is 10.

### Combining Filters

```bash
beepack search "french business" --capabilities "validate_siret" --compatible claude --limit 3
```

---

## Browse Popular Packages

List the most-downloaded packages:

```bash
beepack list
```

Sort by most recently updated:

```bash
beepack list --sort updated
```

Limit results:

```bash
beepack list --limit 20
```

---

## Get Package Details

Before pulling a package, get the full picture:

```bash
beepack info siret-utils
```

This shows:
- Description and purpose
- All capabilities
- Required environment variables
- Compatible runtimes
- Version history
- Community stats (likes, dislikes, downloads)
- Author

**Example:**

```
siret-utils  v1.0.0
by actabi

Validate and format French business IDs (SIRET/SIREN) with the Luhn algorithm.

Capabilities:
  - validate_siret
  - format_siret
  - format_siren
  - strip_siret_formatting

Required env vars:
  (none - zero dependencies)

Compatible: cursor, copilot, claude, openclaw
Downloads: 0   Likes: 0   Dislikes: 0

Versions: 1.0.0
```

---

## Bundles

Bundles are curated groups of packages for common use cases. They let you pull multiple related packages at once.

List available bundles:

```bash
beepack bundles
```

Pull all packages in a bundle:

```bash
beepack pull --bundle fr-business-starter
```

---

## Related Packages

After pulling a package, check what other packages the community has found work well with it:

```bash
# Via MCP tool (if connected)
# get_related("siret-utils") -> suggests cms-detector for supplier onboarding flows
```

---

## How Search Works

Beepack search has two layers:

1. **Keyword matching** — always active, searches package name, description, keywords, and capabilities
2. **Semantic search** — when enabled on the server, uses OpenAI embeddings + a vector database for natural language understanding, merging results with keyword matches

Results are ranked by a combined relevance score. The `--sort` flag only applies to `list`; `search` results are always ranked by relevance.

---

## Tips

- **Be specific** - `"validate french SIRET with Luhn checksum"` finds better results than `"validate"`
- **Use capability filters** when you know exactly what you need the code to do
- **Check `beepack info`** before pulling — verify the required env vars match what you have
- **Check the security tab** on the web to see scan results for sensitive integrations

---

## Next Steps

- [Pull and use packages](./getting-started.md#4-pull-a-package)
- [Publish your own package](./publishing-packages.md)
- [CLI Reference](./cli-reference.md)
