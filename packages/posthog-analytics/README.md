# posthog-analytics

Event capture, user identification, feature flag evaluation, session recording opt-in, and group analytics for B2B apps. Zero dependencies — uses native `fetch`.

Works anywhere Node >= 18 runs: API routes, server components, middleware, background jobs.

## Setup

```bash
POSTHOG_API_KEY=phc_...              # Your PostHog project API key
POSTHOG_HOST=https://app.posthog.com # Optional — defaults to app.posthog.com
```

## Usage

### Capture an event

```js
import { captureEvent } from "./index.js";

await captureEvent({
  distinctId: "user_123",
  event: "signed_up",
  properties: { plan: "pro", referrer: "google" },
});
```

### Identify a user

```js
import { identifyUser } from "./index.js";

await identifyUser({
  distinctId: "user_123",
  anonymousId: "anon_abc",          // Optional: merges anonymous history
  traits: {
    name: "Ada Lovelace",
    email: "ada@example.com",
    plan: "pro",
    createdAt: "2026-01-15",
  },
});
```

### Evaluate a feature flag (server-side)

```js
import { evaluateFeatureFlag } from "./index.js";

const value = await evaluateFeatureFlag({
  distinctId: "user_123",
  flag: "new-dashboard",
  personProperties: { plan: "pro" },
});

if (value === true) {
  // Show new dashboard
}
```

### Bootstrap all flags for a user

Useful in a server route that the client fetches on load:

```js
import { getAllFeatureFlags } from "./index.js";

// GET /api/flags
export async function GET(req) {
  const userId = await getUserId(req);
  const flags = await getAllFeatureFlags({
    distinctId: userId,
    personProperties: { plan: "pro" },
  });
  return Response.json(flags ?? {});
}
```

### Session recording opt-in

Call this when a user accepts your cookie/tracking consent banner:

```js
import { setSessionRecording } from "./index.js";

// Opt in
await setSessionRecording({ distinctId: "user_123", optIn: true });

// Opt out (e.g. after consent withdrawal)
await setSessionRecording({ distinctId: "user_123", optIn: false });
```

### Group analytics (B2B)

Associate a user with an organization, then capture events attributed to the group:

```js
import { associateGroup, captureGroupEvent } from "./index.js";

// Link user to their company (call after login or org switch)
await associateGroup({
  distinctId: "user_123",
  groupType: "company",
  groupKey: "acme-corp",
  groupProperties: {
    name: "Acme Corp",
    plan: "enterprise",
    employeeCount: 500,
    industry: "manufacturing",
  },
});

// Capture an event attributed to the company
await captureGroupEvent({
  distinctId: "user_123",
  event: "report_exported",
  groupType: "company",
  groupKey: "acme-corp",
  properties: { format: "pdf", rows: 1200 },
});
```

### Next.js middleware integration

Evaluates all feature flags per request and injects them into response headers so SSR pages can read flags without an extra round trip.

```js
// middleware.js (project root)
import { createPostHogMiddleware } from "./packages/posthog-analytics/index.js";

export const middleware = createPostHogMiddleware({
  // Extract your app's user ID from the request (JWT cookie, session, etc.)
  getDistinctId: (req) => {
    const session = req.cookies.get("session")?.value;
    return session ? parseJwt(session).sub : null;
  },
  // Optionally pass targeting properties for flag rules
  getPersonProperties: (req) => ({
    plan: req.cookies.get("plan")?.value || "free",
  }),
});

export const config = {
  matcher: ["/((?!_next|favicon|api/_posthog).*)"],
};
```

Read the injected flags in a Server Component or route handler:

```js
// app/dashboard/page.js
import { headers } from "next/headers";

export default async function DashboardPage() {
  const hdrs = await headers();
  const flags = JSON.parse(hdrs.get("X-PostHog-Flags") || "{}");

  return flags["new-dashboard"] ? <NewDashboard /> : <LegacyDashboard />;
}
```

## API Reference

| Export | Description |
|---|---|
| `captureEvent(params)` | Send a single event |
| `identifyUser(params)` | Set user profile traits, optionally alias anonymous ID |
| `evaluateFeatureFlag(params)` | Evaluate one flag server-side via the Decide API |
| `getAllFeatureFlags(params)` | Evaluate all flags for a user in one call |
| `setSessionRecording(params)` | Opt a user into or out of session recording |
| `associateGroup(params)` | Link a user to a group (company, org, workspace) |
| `captureGroupEvent(params)` | Capture an event attributed to a group |
| `createPostHogMiddleware(options)` | Factory for a Next.js middleware that injects flags into headers |

All functions accept optional `apiKey` and `host` overrides; otherwise they read `POSTHOG_API_KEY` and `POSTHOG_HOST` from the environment. All async functions return `null` on error — never throw.

## Edge Cases Handled

- **Missing API key** — logs a clear error and returns null immediately
- **Network failures** — 15s timeout via `AbortSignal.timeout`, returns null
- **Non-OK responses** — logs status and body, returns null
- **Anonymous users** — middleware auto-generates a stable `ph_distinct_id` cookie
- **Flag bootstrapping** — single Decide API call covers all flags, minimizing latency
- **Group events** — `$groups` property appended automatically so events appear in group analytics views
