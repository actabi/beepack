# Publishing Packages

Share your battle-tested code with the Beepack community. This guide covers creating a package, writing the manifest, passing security checks, and publishing.

---

## Prerequisites

- GitHub account at least 14 days old
- Logged in: `beepack login`
- A package worth sharing — production-tested code that solves a real integration problem

---

## 1. Create the Package Directory

Organize your package files in a directory. Include source files and optionally a README.

```
my-package/
  index.js          # Main implementation
  utils.js          # Helper functions
  README.md         # Usage instructions (recommended)
  HIVE.yaml         # Package manifest (required)
```

---

## 2. Write the HIVE.yaml Manifest

`HIVE.yaml` is the package manifest. It must be in the root of your package directory when you run `beepack publish`.

**Minimal example:**

```yaml
name: my-oauth-client
version: 1.0.0
displayName: My OAuth Client
description: |
  Production-ready OAuth 2.0 client with automatic token refresh, PKCE support,
  and proper error handling for expired tokens and revoked access. Handles the
  edge cases that trip up most implementations.
```

**Full example:**

```yaml
name: my-oauth-client          # Required: lowercase alphanumeric + hyphens
version: 1.0.0                 # Required: semantic versioning
displayName: My OAuth Client   # Required: human-readable name for discovery

description: |                 # Required: describe what the package does and why
  Production-ready OAuth 2.0 client with automatic token refresh, PKCE support,
  and proper error handling for expired tokens and revoked access. Handles the
  edge cases that trip up most implementations, including token clock skew,
  concurrent refresh storms, and provider-specific error formats.

keywords:                      # Improves searchability
  - oauth
  - authentication
  - token-refresh
  - pkce

capabilities:                  # What the package can do (action verbs)
  - authenticate-user
  - refresh-access-token
  - handle-oauth-callback
  - revoke-token

requires:
  env:                         # Environment variables the package needs
    - OAUTH_CLIENT_ID
    - OAUTH_CLIENT_SECRET
    - OAUTH_REDIRECT_URI
  deps:                        # Runtime dependencies (informational)
    - node >= 18

compatible:                    # AI runtimes this works with
  - cursor
  - copilot
  - claude
  - openclaw
  - windsurf

language: javascript
module: esm
```

### Manifest Rules

| Field | Required | Notes |
|---|---|---|
| `name` | Yes | Lowercase, alphanumeric, hyphens only. Must be unique. |
| `version` | Yes | Semantic versioning (1.0.0) |
| `displayName` | Yes | Human-readable. Not just the slug. |
| `description` | Yes | Aim for 160+ characters. Explain what problem it solves. |
| `keywords` | No | Helps search. Use specific terms. |
| `capabilities` | No | Action verbs describing what the code does. |
| `requires.env` | No | List all env vars the code needs. Be honest — missing vars = bad reviews. |
| `compatible` | No | Which AI runtimes you've tested with. |

---

## 3. Validate Before Publishing

Run a dry-run to catch issues before submitting:

```bash
beepack publish --dry-run
```

This validates your manifest, checks file types and sizes, and runs the static security scan without actually publishing.

---

## 4. Publish

From your package directory (where `HIVE.yaml` lives):

```bash
beepack publish
```

The publish flow:

1. Manifest validation
2. Duplicate check (warns if similar packages exist)
3. File upload
4. Static security scan (Layer 1 — synchronous, blocking)
5. LLM security review (Layer 2 — async)
6. VirusTotal scan (Layer 3 — async)
7. Package goes live (pending security results)

---

## Security Scanning

All packages go through a 3-layer pipeline before they're fully visible.

### Layer 1: Static Scan (Blocking)

Runs before the package is accepted. Checks for:

- `eval()`, `new Function()`, dynamic `import()` with user input
- `child_process`, `exec`, `spawn`
- Credential harvesting (sending env vars to external URLs)
- Obfuscated code (hex-encoded strings, large base64 blobs)
- Crypto mining references
- Malicious install patterns (`curl | bash`, URL shortener redirects)
- Access to sensitive system files (SSH keys, `/etc/passwd`, browser credentials)
- Prompt injection attempts

If CRITICAL findings are detected, the package is immediately blocked and will not go live.

### Layer 2: LLM Review (Async)

GPT-4o-mini reviews the package on 5 dimensions:

1. **Purpose-capability alignment** — do the env vars match what the description promises?
2. **Instruction scope** — does the code stay within its stated purpose?
3. **Install mechanism risk** — are the setup instructions safe?
4. **Credential proportionality** — are the required credentials justified?
5. **Persistence & privilege** — does it attempt privilege escalation?

### Layer 3: VirusTotal (Async)

Files are bundled and submitted to VirusTotal for malware analysis.

Packages flagged by async layers are automatically hidden pending manual review.

---

## What Makes a Good Package

**Do:**
- Handle the edge cases — token expiry, network failures, retry logic, idempotency
- List all required env vars honestly in `requires.env`
- Write a clear description explaining _what problem_ the code solves
- Include a README with usage examples
- Use meaningful capability names (action verbs: `create-checkout-session`, not `stripe`)

**Don't:**
- Publish code that calls external services you don't own without declaring it
- Use eval, dynamic code execution, or obfuscation
- Publish framework boilerplate — packages should solve a specific integration problem
- Submit a package that duplicates an existing one; use `suggest_improvement` instead

---

## Rate Limits

| Limit | Value |
|---|---|
| Publishes per hour | 10 |
| Publishes per day | 20 |
| GitHub account age | 14+ days |

---

## Versioning

To publish an update, increment the `version` field in `HIVE.yaml` and run `beepack publish` again. Previous versions remain accessible via `beepack pull my-package --version 1.0.0`.

---

## Suggesting Improvements Instead of Duplicating

If a package already exists but is missing something, use the suggestion system instead of publishing a competing package:

```bash
# Via MCP or web UI
# suggest_improvement("existing-package", title="Add retry logic", description="...", codeDiff="...")
```

This keeps the registry clean and channels improvements to existing packages rather than fragmenting the ecosystem.

---

## Next Steps

- [CLI Reference](./cli-reference.md) — full publish command options
- [FAQ](./faq.md) — common publishing questions
