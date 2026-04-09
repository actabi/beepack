# Suggestions

The suggestion system lets users and AI assistants propose improvements to existing packages without publishing a competing one. Authors review suggestions, accept or decline them, and the community can signal support with likes.

---

## Why Suggestions Exist

Publishing a near-duplicate package fragments the registry and splits downloads. If a package almost does what you need, a suggestion channels your improvement back to the original author rather than creating a fork nobody maintains.

Good candidates for suggestions:

- Missing edge case handling (token refresh on 401, retry on rate limit)
- An additional env var option the author didn't expose
- A bug fix with a clear reproduction case
- Support for a second variant of an API (e.g., EU region endpoint)

---

## Submitting a Suggestion

```bash
beepack suggest stripe-checkout
```

This opens an interactive prompt:

```
Title: Add idempotency key support to checkout session creation
Description: Retrying a failed request without an idempotency key creates
duplicate sessions. This diff adds the Idempotency-Key header using a
hash of the cart ID and timestamp.

Attach a diff? (y/n): y
Diff file path: ./idempotency.patch
```

Or pass everything as flags:

```bash
beepack suggest stripe-checkout \
  --title "Add idempotency key support" \
  --description "Retrying without an idempotency key creates duplicate sessions..." \
  --diff ./idempotency.patch
```

Via MCP:

```
suggest_improvement(
  slug: "stripe-checkout",
  title: "Add idempotency key support",
  description: "Retrying without an idempotency key creates duplicate sessions...",
  codeDiff: "--- a/index.js\n+++ b/index.js\n..."
)
```

---

## The Suggestion Workflow

```
User submits suggestion
        ↓
Suggestion appears on package page (status: open)
        ↓
Community members like or dislike the suggestion
        ↓
Author reviews and responds
        ↓
  ┌─────┴──────┐
Accept       Decline
  ↓              ↓
Author merges   Suggestion closed with reason
and publishes
new version
```

### Status Values

| Status | Meaning |
|---|---|
| `open` | Awaiting author review |
| `under-review` | Author has acknowledged it |
| `accepted` | Author will merge it |
| `merged` | Live in a new package version |
| `declined` | Author explained why it won't be merged |

---

## The Like/Dislike System

Any logged-in user can vote on an open suggestion:

```bash
beepack suggest:vote stripe-checkout <suggestion-id> --like
beepack suggest:vote stripe-checkout <suggestion-id> --dislike
```

Vote counts are visible on the suggestion. Authors use them to prioritise — high-like suggestions signal real demand. There is no automatic merge threshold; the author always makes the final call.

---

## Reviewing Suggestions as an Author

List open suggestions on your packages:

```bash
beepack suggestions --mine
```

View a specific suggestion:

```bash
beepack suggestions stripe-checkout
```

Accept and apply:

```bash
beepack suggest:accept stripe-checkout <suggestion-id>
# Applies the diff to a working branch, then:
beepack publish
```

Decline with a reason:

```bash
beepack suggest:decline stripe-checkout <suggestion-id> \
  --reason "Idempotency is the caller's responsibility per Stripe docs"
```

The submitter receives a notification when you respond.

---

## Viewing Suggestions on a Package

```bash
beepack info stripe-checkout --suggestions
```

Or browse at `https://beepack.ai/p/stripe-checkout/suggestions`.

---

## Next Steps

- [Publishing Packages](./publishing-packages.md) — publish an updated version after accepting a suggestion
- [CLI Reference](./cli-reference.md) — full `suggest` command reference
