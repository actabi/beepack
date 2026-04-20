# ClawHub Integration

ClawHub (built on the OpenClaw protocol) lets AI agents discover and consume skills from external registries. Beepack exposes a ClawHub-compatible registry endpoint, so any OpenClaw-enabled agent can search and pull Beepack packages without knowing about Beepack specifically.

---

## Installing the Beepack Skill in OpenClaw

Add Beepack to your OpenClaw skill registry:

```bash
openclaw skill install https://beepack.ai/.well-known/clawhub.json
```

After installation, your OpenClaw agent can call Beepack tools directly:

```
> search for a stripe webhook verification package
[agent calls beepack.search_packages("stripe webhook verification")]
→ Returns: stripe-webhooks v1.4.2 — verified 847 times, 4.8★
```

---

## Discovery: `.well-known/clawhub.json`

ClawHub discovers Beepack via the standard discovery endpoint:

```
GET https://beepack.ai/.well-known/clawhub.json
```

Response:

```json
{
  "name": "Beepack",
  "description": "Registry of battle-tested integration code",
  "version": "1.0",
  "registry_api": "https://beepack.ai/api/clawhub/v1",
  "skills": [
    {
      "name": "search_packages",
      "description": "Search for packages by natural language query"
    },
    {
      "name": "get_package",
      "description": "Retrieve package metadata and source code"
    },
    {
      "name": "resolve_bundle",
      "description": "Resolve a bundle to its constituent packages"
    }
  ],
  "auth": {
    "type": "bearer",
    "token_url": "https://beepack.ai/auth/github"
  }
}
```

Any agent that implements the OpenClaw discovery spec can self-configure from this endpoint.

---

## ClawHub Registry API

The ClawHub API is a REST interface separate from the MCP server. Use it when integrating Beepack into tools that speak HTTP rather than MCP.

**Base URL:** `https://beepack.ai/api/clawhub/v1`

**Authentication:** `Authorization: Bearer YOUR_TOKEN` (required for write operations, optional for read)

---

### `GET /skills`

List all skills Beepack exposes to ClawHub agents.

```bash
curl https://beepack.ai/api/clawhub/v1/skills
```

```json
{
  "skills": [
    { "name": "search_packages", "input_schema": { ... } },
    { "name": "get_package",     "input_schema": { ... } },
    { "name": "resolve_bundle",  "input_schema": { ... } }
  ]
}
```

---

### `POST /download`

Download a package's source files as a zip archive.

```bash
curl -X POST https://beepack.ai/api/clawhub/v1/download \
  -H "Content-Type: application/json" \
  -d '{"slug": "siret-utils", "version": "2.1.0"}'
```

Returns a `302` redirect to a signed download URL. The archive unpacks to the standard package directory layout.

---

### `POST /resolve`

Resolve a package slug to its full metadata and latest version.

```bash
curl -X POST https://beepack.ai/api/clawhub/v1/resolve \
  -H "Content-Type: application/json" \
  -d '{"slug": "siret-utils"}'
```

```json
{
  "slug": "siret-utils",
  "version": "2.1.0",
  "displayName": "Stripe Checkout",
  "description": "...",
  "capabilities": ["create-checkout-session", "handle-success-redirect"],
  "requires": { "env": ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] },
  "downloads": 12847,
  "rating": 4.8
}
```

---

### `POST /bulk-sync`

Resolve multiple slugs in one request. Useful for bundle resolution or pre-fetching metadata.

```bash
curl -X POST https://beepack.ai/api/clawhub/v1/bulk-sync \
  -H "Content-Type: application/json" \
  -d '{"slugs": ["siret-utils", "resend-transactional", "clerk-session-verify"]}'
```

Returns an array of resolved package objects in the same order as the input. Unknown slugs return `null` in position.

---

### `GET /search`

Search packages via HTTP query parameter.

```bash
curl "https://beepack.ai/api/clawhub/v1/search?q=stripe+webhook&limit=5"
```

```json
{
  "results": [
    { "slug": "stripe-webhooks", "score": 0.97, "version": "1.4.2", ... },
    { "slug": "siret-utils", "score": 0.81, "version": "2.1.0", ... }
  ],
  "total": 2
}
```

---

## Searching from OpenClaw

Once the Beepack skill is installed, agents use it transparently:

```
User: implement Stripe webhook handling
Agent: [calls beepack.search_packages("stripe webhook verification")]
       [calls beepack.get_package("stripe-webhooks")]
       → Retrieved source. Proceeding with implementation.
```

The agent reads the source directly from the API response and incorporates it — no separate `beepack pull` step required in agentic workflows.

---

## Next Steps

- [MCP Integration](./mcp-integration.md) — connect via MCP instead of the ClawHub API
- [CLI Reference](./cli-reference.md) — CLI commands for pulling packages locally
