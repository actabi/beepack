# plausible-analytics

Server-side pageview and custom event tracking, Stats API queries (aggregate, breakdown, realtime), and Sites management for Plausible Analytics. Zero dependencies — native `fetch` only.

Works with Plausible Cloud and self-hosted instances. Runs anywhere Node >= 18 is available: API routes, server components, middleware, and background jobs.

## Setup

No API key is required for event tracking. An API key is required for Stats API and Sites API calls.

```bash
PLAUSIBLE_API_KEY=your_api_key_here         # Required for Stats + Sites APIs
PLAUSIBLE_BASE_URL=https://plausible.io     # Optional — override for self-hosted instances
```

## Usage

### Track a pageview (server-side)

Mirrors what the Plausible JS snippet does, but from the server. Pass the visitor's `userAgent` and `ip` for accurate device detection and geolocation.

```js
import { trackPageview } from "./index.js";

// In an API route or middleware
const success = await trackPageview("example.com", "https://example.com/blog/post", {
  referrer: "https://google.com",
  userAgent: req.headers.get("user-agent"),
  ip: req.headers.get("x-forwarded-for"),
});
```

### Track a custom event

Custom events must be configured as Goals in the Plausible dashboard before they appear in reports.

```js
import { trackEvent } from "./index.js";

await trackEvent("example.com", "Signup", "https://example.com/register", {
  props: { plan: "pro", referrer: "google" },
  userAgent: req.headers.get("user-agent"),
  ip: req.headers.get("x-forwarded-for"),
});
```

### Track a purchase with revenue (Plausible v2+)

```js
import { trackEvent } from "./index.js";

await trackEvent("example.com", "Purchase", "https://example.com/checkout/success", {
  revenue: { amount: 49.00, currency: "USD" },
  props: { plan: "pro" },
  userAgent: req.headers.get("user-agent"),
  ip: req.headers.get("x-forwarded-for"),
});
```

### Query aggregate site stats

```js
import { querySiteStats } from "./index.js";

const stats = await querySiteStats(process.env.PLAUSIBLE_API_KEY, "example.com", {
  period: "30d",
  metrics: ["visitors", "pageviews", "bounce_rate", "visit_duration"],
});

// stats.results.visitors.value => 12400
// stats.results.bounce_rate.value => 54.2
```

### Get top pages

```js
import { listTopPages } from "./index.js";

const pages = await listTopPages(process.env.PLAUSIBLE_API_KEY, "example.com", {
  period: "7d",
  limit: 5,
});

// [{ page: "/blog/post", visitors: 830 }, ...]
```

### Get top referral sources

```js
import { listTopSources } from "./index.js";

const sources = await listTopSources(process.env.PLAUSIBLE_API_KEY, "example.com", {
  period: "30d",
  limit: 10,
});

// [{ source: "google", visitors: 3200 }, { source: "twitter.com", visitors: 410 }, ...]
```

### Get visitor breakdown by country

```js
import { listTopCountries } from "./index.js";

const countries = await listTopCountries(process.env.PLAUSIBLE_API_KEY, "example.com", {
  period: "month",
  limit: 10,
});

// [{ country: "US", visitors: 5100 }, { country: "DE", visitors: 820 }, ...]
```

### Get goal completions

Goals must be configured in the Plausible dashboard first.

```js
import { listGoals } from "./index.js";

const goals = await listGoals(process.env.PLAUSIBLE_API_KEY, "example.com", {
  period: "30d",
});

// [{ goal: "Signup", visitors: 340, events: 340 }, ...]
```

### Get realtime active visitors

Returns the number of visitors active in the last 5 minutes. Useful for live visitor counters.

```js
import { getRealtimeVisitors } from "./index.js";

const count = await getRealtimeVisitors(process.env.PLAUSIBLE_API_KEY, "example.com");

// count => 17
```

### Create a new site

```js
import { createSite } from "./index.js";

const site = await createSite(process.env.PLAUSIBLE_API_KEY, "mynewsite.com", "America/New_York");

// site => { domain: "mynewsite.com", timezone: "America/New_York" }
```

### Fetch site details

```js
import { getSite } from "./index.js";

const site = await getSite(process.env.PLAUSIBLE_API_KEY, "example.com");

// site => { domain: "example.com", timezone: "UTC", ... }
```

### Self-hosted Plausible

All functions accept a `baseUrl` override as the final argument:

```js
import { trackPageview, querySiteStats } from "./index.js";

const BASE = "https://analytics.mycompany.com";

await trackPageview("example.com", "https://example.com/", { baseUrl: BASE });

const stats = await querySiteStats(apiKey, "example.com", { period: "7d" }, BASE);
```

## API Reference

| Export | Description |
|---|---|
| `trackPageview(domain, url, options?)` | Track a pageview server-side (no API key required) |
| `trackEvent(domain, eventName, url, options?)` | Track a named custom event (no API key required) |
| `querySiteStats(apiKey, siteId, options?)` | Fetch aggregate metrics for a time period |
| `listTopPages(apiKey, siteId, options?)` | Top pages ranked by visitor count |
| `listTopSources(apiKey, siteId, options?)` | Top referral sources ranked by visitor count |
| `listTopCountries(apiKey, siteId, options?)` | Visitor breakdown by ISO 3166-1 alpha-2 country code |
| `listGoals(apiKey, siteId, options?)` | Goal completion breakdown |
| `getRealtimeVisitors(apiKey, siteId)` | Active visitor count (last 5 minutes) |
| `createSite(apiKey, domain, timezone?)` | Create a new site in Plausible |
| `getSite(apiKey, siteId)` | Fetch metadata for an existing site |

All async functions return `null` (Stats/Sites API) or `false` (event tracking) on error — never throw.

## Edge Cases Handled

- **Missing required args** — logs a clear error and returns `null`/`false` immediately, no network call made
- **Network failures and timeouts** — 15s timeout via `AbortSignal.timeout`, returns `null`/`false` on abort or fetch error
- **Non-202 event responses** — Plausible only returns a body on error; it is captured, truncated to 200 chars, and logged
- **Non-OK Stats/Sites API responses** — parses the JSON error field if present, then returns `null`
- **Null/undefined query params** — stripped from query strings automatically; arrays are serialized as repeated key=value pairs
- **Realtime integer response** — the realtime endpoint returns a bare integer, not JSON; parsed with `parseInt` and validated against `NaN`
- **Revenue tracking** — `revenue` object is only appended to event payloads when provided, staying compatible with Plausible v1
- **Self-hosted instances** — all functions accept a `baseUrl` override so no code changes are needed when switching between Cloud and self-hosted
