# rate-limiter

In-memory rate limiting with two strategies (sliding window, token bucket) plus exponential backoff retry with jitter. Zero dependencies.

Handles the patterns every API integration needs: per-key rate limiting, retry with backoff, and wrapping functions with automatic rate limiting.

## Usage

### Sliding Window (API endpoint protection)

```js
import { createSlidingWindowLimiter } from "./index.js";

const limiter = createSlidingWindowLimiter({
  maxRequests: 100,
  windowMs: 60_000, // 100 requests per minute
});

// In your request handler
const result = limiter.check(req.ip);
if (!result.allowed) {
  res.set("Retry-After", Math.ceil(result.retryAfterMs / 1000));
  return res.status(429).json({ error: "Too many requests" });
}
// remaining: 99, 98, 97...
```

### Token Bucket (smooth rate limiting)

```js
import { createTokenBucket } from "./index.js";

const bucket = createTokenBucket({
  capacity: 10,     // burst up to 10
  refillRate: 2,    // 2 tokens per second steady state
});

const result = bucket.consume("user-123");
if (!result.allowed) {
  console.log(`Retry in ${result.retryAfterMs}ms`);
}
```

### Retry with Exponential Backoff

```js
import { withRetry } from "./index.js";

const data = await withRetry(
  () => fetch("https://api.example.com/data").then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }),
  {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    jitterFactor: 0.5,
    shouldRetry: (err) => err.message.includes("429") || err.message.includes("503"),
    onRetry: (attempt, delay, err) => console.log(`Retry ${attempt} in ${delay}ms: ${err.message}`),
  }
);
```

### Rate-Limited Function Wrapper

```js
import { rateLimitedFn } from "./index.js";

const limitedFetch = rateLimitedFn(
  (url) => fetch(url).then((r) => r.json()),
  { maxPerSecond: 5, maxRetries: 3 }
);

// Automatically queues and retries
const results = await Promise.all(
  urls.map((url) => limitedFetch(url))
);
```

## Edge Cases Handled

- **Jitter** — prevents thundering herd on retries
- **Per-key isolation** — rate limits are tracked independently per key
- **Continuous refill** — token bucket refills proportionally to elapsed time
- **Backoff cap** — exponential growth capped at maxDelayMs
- **Custom retry predicate** — choose which errors to retry
- **Sliding window cleanup** — old timestamps are pruned on each check
