# Security Pipeline

Every package submitted to Beepack passes through a 3-layer security pipeline before it reaches users. Two layers run at publish time; one runs continuously after a package is live.

---

## Overview

| Layer | When | Blocking? | Run by |
|---|---|---|---|
| 1. Static scan | At publish, before acceptance | Yes | Beepack static analyser |
| 2. LLM evaluation | After upload, async | No (auto-hides on flag) | GPT-4o-mini |
| 3. Community reports | Ongoing, post-publish | No (auto-hides at threshold) | Community |

A package can be blocked or hidden at any layer. Blocked packages never go live. Hidden packages are removed from search and download while under manual review.

---

## Layer 1: Static Scan

The static scan runs synchronously during `beepack publish`. If it finds CRITICAL issues, the publish is rejected immediately and the package is not stored.

```
$ beepack publish
✓ Manifest validated
✓ Duplicate check passed
✓ Files uploaded
✗ Static scan: CRITICAL — eval() with user-controlled input detected in index.js:47
  Publish rejected.
```

**What the static scan checks:**

### Dynamic code execution

- `eval()` calls, including disguised forms (`window['eval']`, `globalThis.eval`)
- `new Function(...)` with non-literal arguments
- Dynamic `import()` where the specifier is not a string literal

### Process spawning

- `child_process.exec`, `child_process.spawn`, `execSync`, `spawnSync`
- Shell metacharacters in command strings (`; && || $()`)

### Credential harvesting

- Reading from `process.env` and writing the values to network requests
- Sending env var contents to URLs not declared in the package manifest
- Access to known credential file paths (`~/.ssh/`, `~/.aws/credentials`, `~/.netrc`, browser profile directories)

### Data exfiltration patterns

- Outbound HTTP/HTTPS calls to URL shorteners or dynamic DNS hosts
- `fetch`, `axios`, `got`, `http.request` calls where the URL is constructed from user-controlled or env var input and points outside declared domains
- Base64-encoding of environment data before transmission

### Obfuscation

- Hex-encoded string literals longer than 200 characters
- Large base64 blobs (>1 KB) in source files that are not image or font assets
- Variable names that are single characters throughout (minified/obfuscated code)

### Install-time execution risks

- `curl | bash` or `wget | sh` patterns in README or setup scripts
- `postinstall` scripts that download external files
- URL shortener redirects in any executable context

### Other

- Crypto mining keywords (`CryptoNight`, `stratum+tcp://`, `monero`)
- Prompt injection attempts in README or description fields targeting AI consumers

---

## Layer 2: LLM Evaluation

After a package passes the static scan and is uploaded, GPT-4o-mini reviews the full source asynchronously. This catches issues that pattern matching misses: obfuscated logic, misleading descriptions, and subtle privilege abuse.

The LLM evaluates five dimensions:

**1. Purpose-capability alignment**
Does what the code actually does match the description and declared capabilities? A package claiming to be a "SIRET validator" that also reads SSH keys fails here.

**2. Instruction scope**
Does the code operate within the stated problem domain? Hidden network calls unrelated to the integration — even to benign-looking URLs — are flagged.

**3. Install mechanism risk**
Are the setup steps in README safe? Anything that prompts the user to run untrusted scripts or grant elevated permissions is reviewed.

**4. Credential proportionality**
Are the env vars in `requires.env` justified by what the code actually does? Asking for `DATABASE_URL` in a package that only calls a third-party API is suspicious.

**5. Persistence and privilege escalation**
Does the code attempt to write to startup files, modify shell profiles, create cron jobs, or request filesystem permissions beyond the integration scope?

If the LLM flags the package with HIGH or CRITICAL severity, it is automatically hidden pending manual review by the Beepack team. Authors are notified by email.

---

## Layer 3: Community Reports

Any logged-in user can report a published package:

```bash
beepack report siret-utils --reason "Reads process.env and POSTs to external URL on line 42"
```

Or via the web UI at `https://beepack.ai/p/siret-utils`.

**Auto-hide threshold:** 3 unique reports from accounts older than 30 days trigger an automatic hide. The package disappears from search and download while the Beepack team investigates.

Report reasons accepted:

| Reason | Description |
|---|---|
| `malicious-code` | Code that does something harmful |
| `credential-leak` | Sends credentials to unintended destinations |
| `misleading` | Description doesn't match what the code does |
| `broken` | Package is non-functional (use suggestions for fixes) |
| `spam` | Duplicate or low-effort submission |

False reports from accounts that consistently misuse the system result in report privileges being revoked.

---

## What Happens After a Manual Review

| Outcome | Result |
|---|---|
| Package cleared | Restored to public, report marked as invalid |
| Package fixed | Author given 48 hours to publish a clean version |
| Package confirmed malicious | Permanently removed, author banned |

Authors receive email notification at each step.

---

## Running the Static Scan Locally

Before publishing, run the static scan against your package directory:

```bash
beepack scan ./my-package
```

This runs Layer 1 locally and reports findings without uploading anything. Use it to catch issues before the publish roundtrip.

```bash
beepack scan ./my-package --format json   # Machine-readable output
beepack scan ./my-package --strict        # Treat WARN as CRITICAL
```

---

## Next Steps

- [Publishing Packages](./publishing-packages.md) — full publish workflow
- [FAQ](./faq.md) — common questions about rejected or hidden packages
