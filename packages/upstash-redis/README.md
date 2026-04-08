# upstash-redis

Upstash Redis client for serverless environments. Uses the Upstash HTTP REST API — no TCP socket, no persistent connection, works in Edge runtimes and serverless cold starts. Zero dependencies.

Covers the six patterns that come up repeatedly: cache-aside, session storage, distributed rate limiting, pub/sub fan-out, background job queues, and pipeline batching.

## Setup

```
UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
UPSTASH_REDIS_REST_TOKEN=AX...
```

Both values are in the **REST API** tab of your Upstash console. The client throws at construction time if either variable is missing, so misconfiguration surfaces immediately.

```js
import { createClient } from "./index.js";

const redis = createClient();
// or override env:
// const redis = createClient({ url: "...", token: "..." });
```

## Cache-Aside

Automatic JSON serialization on get and set. `getOrSet` implements the full cache-aside pattern in one call.

```js
// Simple get/set
await redis.cache.set("config:flags", { darkMode: true }, 300); // 5 min TTL
const flags = await redis.cache.get("config:flags");
// => { darkMode: true }

// Cache-aside: return cached or compute and store
const user = await redis.cache.getOrSet(
  `user:${userId}`,
  () => db.users.findById(userId),
  60 // cache for 60 seconds
);

// Delete
await redis.cache.del(`user:${userId}`);
```

## Session Storage (Sliding Expiration)

Sessions always require a TTL — `session.set` refuses to write without one. The TTL slides forward on every read via `GETEX`.

```js
// Write session (TTL required — never stored without expiry)
await redis.session.set(sessionId, { userId: 42, role: "admin" }, 1800); // 30 min

// Read and slide the TTL (resets to 30 min from now)
const data = await redis.session.get(sessionId, 1800);
if (!data) return res.status(401).json({ error: "Session expired" });

// Destroy on logout
await redis.session.destroy(sessionId);
```

## Distributed Rate Limiting

Atomic fixed-window counter safe across multiple serverless instances. Does not use SETNX for increment — uses `SET NX` only for window initialization, then `INCR` for counting, avoiding the SETNX-then-SET race condition.

```js
// In your API route handler
const result = await redis.rateLimit.check(
  `rl:api:${req.ip}`,
  100,  // limit
  60    // per 60 seconds
);

if (!result) return res.status(500).end();
if (!result.allowed) {
  res.set("Retry-After", result.resetInSeconds);
  return res.status(429).json({ error: "Rate limit exceeded", ...result });
}
// result.remaining: requests left in this window
```

Complements the in-process `rate-limiter` package — use this one when limits must be shared across instances or regions.

## Pub/Sub

`publish` uses Redis PUBLISH for real-time fan-out to connected subscribers. Because Upstash does not support blocking `SUBSCRIBE` over HTTP, use `enqueue`/`poll` for durable, poll-based message delivery.

```js
// Real-time fan-out (requires subscribers already connected via WebSocket/SSE gateway)
await redis.pubsub.publish("notifications", { userId: 42, text: "Hello" }, "notification");

// Durable poll-based: producer
await redis.pubsub.enqueue("events", { action: "signup", userId: 99 }, "user.signup");

// Consumer (e.g. cron or serverless function)
const messages = await redis.pubsub.poll("events", 50);
for (const msg of messages ?? []) {
  if (msg.type === "user.signup") await sendWelcomeEmail(msg.data);
}
```

## Queue (Background Jobs)

FIFO queue backed by Redis lists. Push jobs from your API handler, pop from a background worker or cron.

```js
// Producer: push jobs
await redis.queue.push("email-send", { to: "user@example.com", template: "welcome" });
await redis.queue.push("pdf-render", { docId: "abc123" }, { docId: "def456" }); // batch push

// Consumer: pop one at a time
const job = await redis.queue.pop("email-send");
if (job) await sendEmail(job);

// Pop up to 10 at once (single round-trip)
const jobs = await redis.queue.popMany("pdf-render", 10);
await Promise.all((jobs ?? []).map(renderPdf));

// Check backlog depth for monitoring
const depth = await redis.queue.length("email-send");
```

## Pipeline (Batch Operations)

Multiple commands in a single HTTP request — critical for cold-start performance and reducing latency on bulk operations.

```js
const [getResult, setResult, incrResult] = await redis.pipeline([
  ["GET", "counter"],
  ["SET", "status", "active"],
  ["INCR", "visits"],
]);

// Batch-load multiple cache keys
const keys = ["user:1", "user:2", "user:3"];
const values = await redis.pipeline(keys.map((k) => ["GET", k]));
const users = values?.map((v) => v ? JSON.parse(v) : null);
```

## Low-Level Command Access

Use `redis.cmd` for any Redis command not covered by the helpers.

```js
await redis.cmd("HSET", "user:42", "name", "Alice", "age", "30");
const name = await redis.cmd("HGET", "user:42", "name");
await redis.cmd("EXPIRE", "user:42", 3600);
```

## Edge Cases Handled

- **No SETNX for atomic lock acquire** — rate limiter uses `SET NX` + `INCR` correctly; never the broken SETNX-then-SET pattern
- **Sessions always have TTL** — `session.set` rejects calls without a positive `ttlSeconds` to prevent unbounded session accumulation
- **Serverless cold start safety** — HTTP REST, no persistent TCP connection; 15s timeout via `AbortSignal.timeout` prevents hanging invocations
- **Pipeline error isolation** — per-command errors in a pipeline are logged and returned as null without failing the entire batch
- **Pub/sub HTTP constraint** — blocking `SUBSCRIBE` is not available over HTTP; the package uses `enqueue`/`poll` for durable delivery instead of silently failing
- **JSON parse safety** — all deserialization is wrapped in try/catch; raw strings are returned if parsing fails
