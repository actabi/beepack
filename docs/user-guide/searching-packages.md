# Searching for Packages

Beepack supports natural language search backed by keyword matching and optional semantic embeddings. This guide covers all the ways to find what you need.

---

## Basic Search

```bash
beepack search "stripe checkout"
beepack search "oauth github"
beepack search "rate limiting"
```

Results show package name, description, stats (likes/dislikes/downloads), and a relevance score.

**Example output:**

```
stripe-checkout   1.2.0  ★ 42  ↓ 1,840
  Complete Stripe checkout with webhook signature verification, subscription management,
  and idempotency support. Handles replay attacks and network failures.
  [score: 0.94]

stripe-subscriptions  0.9.1  ★ 18  ↓ 621
  Manage Stripe subscription lifecycle, trial periods, and billing portal.
  [score: 0.71]
```

---

## Filtering Results

### By Capability

Capabilities are specific things a package can do. Filter to find packages that perform a particular action:

```bash
beepack search "stripe" --capabilities "verify-webhook-signature"
beepack search "auth" --capabilities "oauth,token-refresh"
```

Common capabilities: `create-checkout-session`, `verify-webhook-signature`, `send-email`, `upload-file`, `rate-limit`, `token-refresh`, `parse-pdf`, `send-message`.

### By Compatible Runtime

Find packages validated for a specific AI runtime:

```bash
beepack search "pdf" --compatible claude
beepack search "storage" --compatible cursor
```

Supported values: `cursor`, `copilot`, `claude`, `openclaw`, `windsurf`.

### Limit Results

```bash
beepack search "oauth" --limit 5
```

Default limit is 10.

### Combining Filters

```bash
beepack search "webhooks" --capabilities "verify-signature" --compatible claude --limit 3
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
beepack info stripe-checkout
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
stripe-checkout  v1.2.0
by actabi

Complete Stripe checkout session management with webhook verification...

Capabilities:
  • create-checkout-session
  • verify-webhook-signature
  • manage-subscriptions
  • handle-payment-events

Required env vars:
  • STRIPE_SECRET_KEY
  • STRIPE_WEBHOOK_SECRET

Compatible: cursor, copilot, claude, openclaw
Downloads: 1,840   Likes: 42   Dislikes: 2

Versions: 1.2.0, 1.1.0, 1.0.0
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
beepack pull --bundle saas-starter
```

---

## Related Packages

After pulling a package, check what other packages the community has found work well with it:

```bash
# Via MCP tool (if connected)
# get_related("stripe-checkout") → suggests pdf-invoice, resend-email
```

---

## How Search Works

Beepack search has two layers:

1. **Keyword matching** — always active, searches package name, description, keywords, and capabilities
2. **Semantic search** — when enabled on the server, uses OpenAI embeddings + a vector database for natural language understanding, merging results with keyword matches

Results are ranked by a combined relevance score. The `--sort` flag only applies to `list`; `search` results are always ranked by relevance.

---

## Tips

- **Be specific** — `"stripe webhook signature verification"` finds better results than `"stripe"`
- **Use capability filters** when you know exactly what you need the code to do
- **Check `beepack info`** before pulling — verify the required env vars match what you have
- **Check the security tab** on the web to see scan results for sensitive integrations

---

## Next Steps

- [Pull and use packages](./getting-started.md#4-pull-a-package)
- [Publish your own package](./publishing-packages.md)
- [CLI Reference](./cli-reference.md)
