# webhook-validator

Signature verification for Stripe, GitHub, Slack, Linear, Shopify, and Vercel webhooks. Zero dependencies — uses the native Web Crypto API available in Node 18+, edge runtimes, and all modern browsers.

Handles the three things that kill naive webhook handlers: raw body preservation before JSON parsing, timing-safe HMAC comparison (not `===`), and replay attack prevention via timestamp window checks.

## Setup

No installation needed beyond copying the file. No environment variables required — secrets are passed per-call so the same module can serve multiple tenants.

```js
import {
  verifyWebhook,       // auto-detect + dispatch
  verifyStripe,        // provider-specific
  verifyGitHub,
  verifySlack,
  verifyLinear,
  verifyShopify,
  verifyVercel,
  rawBodyMiddleware,   // Express/Connect middleware
  getRawBody,          // Web Fetch API helper
  detectProvider,      // header inspection
} from "./index.js";
```

## The most important thing: raw body

**Never run body-parser or `req.json()` before verifying a webhook.** Once the stream is consumed and re-serialised, byte-level fidelity is lost — whitespace, key ordering, and encoding all change — and every HMAC will fail.

### Express

```js
import express from "express";
import { rawBodyMiddleware, verifyWebhook } from "./index.js";

const app = express();

// Mount rawBodyMiddleware BEFORE express.json() on webhook routes
app.post("/webhook", rawBodyMiddleware, async (req, res) => {
  const result = await verifyWebhook(
    { headers: req.headers, rawBody: req.rawBody },
    {
      stripe:  process.env.STRIPE_WEBHOOK_SECRET,
      github:  process.env.GITHUB_WEBHOOK_SECRET,
      slack:   process.env.SLACK_SIGNING_SECRET,
    }
  );

  if (!result.valid) {
    console.error(`[webhook] ${result.provider} rejected:`, result.error);
    return res.status(400).send("Bad webhook signature");
  }

  console.log(`[webhook] ${result.provider} event:`, result.payload);
  res.sendStatus(200);
});

// Other routes use normal body parsing
app.use(express.json());
```

### Next.js App Router

```js
// app/api/webhook/route.js
import { getRawBody, verifyWebhook } from "./index.js";

// IMPORTANT: disable Next.js body parsing for this route
export const config = { api: { bodyParser: false } };

export async function POST(request) {
  const rawBody = await getRawBody(request);  // call once — stream can't be re-read

  const result = await verifyWebhook(
    { headers: Object.fromEntries(request.headers), rawBody },
    { stripe: process.env.STRIPE_WEBHOOK_SECRET }
  );

  if (!result.valid) {
    return new Response(result.error, { status: 400 });
  }

  // result.payload is the parsed event
  return new Response("ok");
}
```

## Usage by provider

All verify functions return `{valid: boolean, provider, payload?}`. Narrow with `if (result.valid)` to access `payload` (TypeScript will enforce this via the JSDoc discriminated union).

### Stripe

Stripe's scheme signs `"${timestamp}.${rawBody}"`. The `t=` timestamp component is mandatory — the most common implementation bug is signing just the body without it.

```js
import { verifyStripe } from "./index.js";

const result = await verifyStripe(
  req.rawBody,                          // raw string, not parsed
  req.headers["stripe-signature"],
  "whsec_your_webhook_secret",
  300                                   // replay tolerance in seconds (default: 300)
);

if (result.valid) {
  const { type, data } = result.payload;   // Stripe event object
  if (type === "checkout.session.completed") {
    await fulfillOrder(data.object);
  }
}
```

Key rotation is handled automatically — `verifyStripe` checks all `v1=` signatures in the header (Stripe sends multiple during a key rotation window).

### GitHub

```js
import { verifyGitHub } from "./index.js";

const result = await verifyGitHub(
  req.rawBody,
  req.headers["x-hub-signature-256"],  // sha256=<hex>
  "your_webhook_secret"
);

if (result.valid) {
  const event = req.headers["x-github-event"];   // "push", "pull_request", etc.
  const { repository, sender } = result.payload;
}
```

### Slack

Slack requires both the signature header and the timestamp header. The replay window is 5 minutes by default.

```js
import { verifySlack } from "./index.js";

const result = await verifySlack(
  req.rawBody,
  req.headers["x-slack-signature"],
  req.headers["x-slack-request-timestamp"],
  "your_slack_signing_secret"
);

if (result.valid) {
  // payload is JSON for Event API, or URLSearchParams-parsed object for slash commands
  const { type, event } = result.payload;
}
```

### Linear

```js
import { verifyLinear } from "./index.js";

const result = await verifyLinear(
  req.rawBody,
  req.headers["linear-signature"],
  "your_linear_webhook_secret"
);

if (result.valid) {
  const { action, data, type } = result.payload;  // e.g. action: "create", type: "Issue"
}
```

### Shopify

Shopify uses base64-encoded HMAC-SHA256. Pass the raw body as a string or `Uint8Array`.

```js
import { verifyShopify } from "./index.js";

const result = await verifyShopify(
  req.rawBody,
  req.headers["x-shopify-hmac-sha256"],   // base64
  "your_shopify_shared_secret"
);

if (result.valid) {
  const { id, email, total_price } = result.payload;
}
```

### Vercel

Vercel uses HMAC-SHA1 and the `sha1=` prefix convention.

```js
import { verifyVercel } from "./index.js";

const result = await verifyVercel(
  req.rawBody,
  req.headers["x-vercel-signature"],   // sha1=<hex>
  "your_vercel_webhook_secret"
);

if (result.valid) {
  const { type, payload } = result.payload;
}
```

### Auto-detection

Use `verifyWebhook` when a single endpoint receives events from multiple providers. It reads the headers, identifies the provider, and dispatches to the correct verifier. Pass all your secrets — only the matched one is used.

```js
import { verifyWebhook, detectProvider } from "./index.js";

// Inspect what was detected without verifying
const provider = detectProvider(req.headers);
// => "stripe" | "github" | "slack" | "linear" | "shopify" | "vercel" | null

// Verify and dispatch
const result = await verifyWebhook(
  { headers: req.headers, rawBody: req.rawBody },
  {
    stripe:  process.env.STRIPE_WEBHOOK_SECRET,
    github:  process.env.GITHUB_WEBHOOK_SECRET,
    slack:   process.env.SLACK_SIGNING_SECRET,
    linear:  process.env.LINEAR_WEBHOOK_SECRET,
    shopify: process.env.SHOPIFY_SHARED_SECRET,
    vercel:  process.env.VERCEL_WEBHOOK_SECRET,
  }
);

if (result.valid) {
  switch (result.provider) {
    case "stripe":  await handleStripe(result.payload); break;
    case "github":  await handleGitHub(result.payload); break;
    case "slack":   await handleSlack(result.payload);  break;
  }
} else {
  console.error(`Webhook rejected [${result.provider}]: ${result.error}`);
}
```

## Edge cases handled

- **Raw body preservation** — `rawBodyMiddleware` and `getRawBody` capture bytes before any parsing. Not buffering first is the number-one reason webhook verification fails in production.
- **Timing-safe comparison** — Uses `crypto.subtle.verify` in an HMAC-of-HMAC scheme instead of `===`. A direct string comparison leaks signature bytes through timing side-channels.
- **Stripe `t=` timestamp** — The timestamp is part of the signed payload (`"${t}.${body}"`). Verifying just the body without prepending `t=` will produce the wrong signature and silently fail against the correct one.
- **Stripe key rotation** — The `Stripe-Signature` header may contain multiple `v1=` values during a rotation window. All are checked.
- **Replay attacks** — Stripe and Slack include a timestamp; events older than `toleranceSec` (default 300s) are rejected.
- **Slack dual body format** — Slack sends JSON for the Events API but `application/x-www-form-urlencoded` for slash commands. Both are handled transparently.
- **Shopify base64** — Shopify's HMAC is base64-encoded rather than hex; converted to hex before the timing-safe comparison.
- **Vercel SHA-1** — Vercel uses HMAC-SHA1 (not SHA-256); the correct algorithm is used automatically.
