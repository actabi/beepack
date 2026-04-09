# sentry-setup

Production-ready Sentry config generators for Next.js App Router. Covers all three runtimes (client, server, edge), source map upload via `withSentryConfig`, user context enrichment with PII guardrails, custom event capture with structured metadata, performance tracing for API routes and DB queries, and a React Error Boundary component generator. Zero external dependencies — this package generates config objects and source code strings; you wire them in.

## Setup

### 1. Install the Sentry SDK

```bash
npm install @sentry/nextjs
```

### 2. Environment variables

```bash
SENTRY_DSN=https://abc123@o0.ingest.sentry.io/456    # Required for all runtimes
SENTRY_AUTH_TOKEN=sntrys_...                          # Required for source map upload
```

### 3. Create the three Sentry config files

Generate and write each runtime config to the project root:

```js
import {
  generateClientConfig,
  generateServerConfig,
  generateEdgeConfig,
} from "./packages/sentry-setup/index.js";
import { writeFileSync } from "fs";

const opts = {
  environment: process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA, // or your CI SHA
  tracesSampleRate: 0.1,
};

writeFileSync("sentry.client.config.js", generateClientConfig(opts));
writeFileSync("sentry.server.config.js", generateServerConfig(opts));
writeFileSync("sentry.edge.config.js",   generateEdgeConfig(opts));
```

Next.js picks up all three files automatically — do not import them manually.

### 4. Wrap `next.config.js` with `withSentryConfig`

```js
import { generateNextConfigWrapper } from "./packages/sentry-setup/index.js";
import { writeFileSync } from "fs";

const snippet = generateNextConfigWrapper({
  org: "my-sentry-org",
  project: "my-next-app",
  hideSourceMaps: true,
});

// Paste snippet into next.config.js, or write it directly:
writeFileSync("next.config.js", snippet);
```

## Usage

### Attach user identity to errors

Call this after sign-in to tag all subsequent Sentry events with the current user. Pass the returned object to `Sentry.setUser()`.

```js
import * as Sentry from "@sentry/nextjs";
import { enrichUserContext } from "./packages/sentry-setup/index.js";

// In your sign-in handler or session callback:
const sentryUser = enrichUserContext(
  { id: session.user.id, username: session.user.name, role: session.user.role },
  { includeEmail: false } // opt in only if your DPA permits it
);

if (sentryUser) {
  Sentry.setUser(sentryUser);
}

// On sign-out:
Sentry.setUser(null);
```

### Capture a custom event with structured metadata

```js
import * as Sentry from "@sentry/nextjs";
import { buildCustomEvent } from "./packages/sentry-setup/index.js";

try {
  await processPayment(order);
} catch (err) {
  const event = buildCustomEvent({
    message: "Payment failed",
    error: err,
    category: "payment",
    level: "error",
    tags: { provider: "stripe", plan: "pro" },
    metadata: { orderId: order.id, amount: order.total },
    fingerprint: "payment-failed",
  });

  if (event) Sentry.captureEvent(event);
}
```

### Instrument an API route with performance tracing

Generate a traced route handler and write it to the appropriate path:

```js
import { generateTracedApiRouteSource } from "./packages/sentry-setup/index.js";
import { writeFileSync, mkdirSync } from "fs";

const src = generateTracedApiRouteSource({
  routeName: "orders",
  traceDbQueries: true, // include the DB span stub
});

mkdirSync("app/api/orders", { recursive: true });
writeFileSync("app/api/orders/route.js", src);
```

Or author it by hand using the pattern:

```js
// app/api/orders/route.js
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export async function GET(request) {
  return await Sentry.startSpan(
    { name: "GET /api/orders", op: "http.server" },
    async (span) => {
      try {
        // Optional: trace a DB query as a child span
        const orders = await Sentry.startSpan(
          { name: "db.query", op: "db", attributes: { "db.statement": "SELECT * FROM orders" } },
          () => db.order.findMany()
        );
        return NextResponse.json({ orders });
      } catch (err) {
        Sentry.captureException(err);
        span.setStatus({ code: 2, message: err.message });
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
      }
    }
  );
}
```

### Add a React Error Boundary

Generate the component file and write it to `components/`:

```js
import { generateErrorBoundarySource } from "./packages/sentry-setup/index.js";
import { writeFileSync } from "fs";

const src = generateErrorBoundarySource({
  componentName: "AppErrorBoundary",
  fallbackMessage: "An unexpected error occurred. Our team has been notified.",
});

writeFileSync("components/AppErrorBoundary.jsx", src);
```

Use it to wrap any subtree you want to isolate:

```jsx
// app/dashboard/page.jsx
import AppErrorBoundary from "@/components/AppErrorBoundary";
import DashboardContent from "./DashboardContent";

export default function DashboardPage() {
  return (
    <AppErrorBoundary metadata={{ page: "dashboard" }}>
      <DashboardContent />
    </AppErrorBoundary>
  );
}
```

## Edge Cases Handled

- **Missing `SENTRY_DSN`** — `buildSharedSentryConfig` (and all generators that call it) return `null` and log an error instead of silently initialising Sentry with an empty DSN, which would cause SDK crashes at runtime.
- **Missing `environment` tag** — Events without an environment tag are invisible in Sentry's environment filter. The shared config builder rejects an empty environment and logs a clear error.
- **Source maps not found on CDN** — If you set `assetPrefix` in your Next.js config, Sentry's `urlPrefix` must match the CDN path or source maps will never resolve. Pass `assetPrefix` to `generateNextConfigWrapper` and it will emit a `urlPrefix` line with a matching comment so the mismatch is caught at review time, not at 3 AM.
- **PII leaking through breadcrumbs** — Browser and server configs include a `beforeBreadcrumb` hook that scrubs keys matching `password`, `token`, `secret`, `authorization`, `cookie`, `ssn`, and `credit*card` before breadcrumbs are sent. The client config also masks all text and blocks all media in Session Replay by default.
- **Email in user context** — `enrichUserContext` silently drops `email` unless `includeEmail: true` is passed, and logs a reminder to make the opt-in explicit. This prevents accidental GDPR/CCPA violations.
- **Invalid severity level** — `buildCustomEvent` validates the `level` field against Sentry's allowed values and returns `null` with a clear error rather than sending a malformed event.
- **Edge runtime limitations** — `generateEdgeConfig` caps `tracesSampleRate` at `0.05` (overriding any higher value passed in) because edge functions run on every request and a high sample rate would overwhelm your Sentry quota. It also omits Node.js-only integrations that would throw at edge import time.
