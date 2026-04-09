// Rate Limiter + Exponential Backoff Retry
// Zero dependencies. In-memory, per-key rate limiting with two strategies.

/**
 * Create a sliding window rate limiter.
 * Tracks request timestamps per key within a rolling window.
 *
 * @param {object} config
 * @param {number} config.maxRequests - Max requests allowed in the window
 * @param {number} config.windowMs - Window duration in milliseconds
 * @returns {{check: (key: string) => {allowed: boolean, remaining: number, retryAfterMs: number|null}, reset: (key: string) => void, resetAll: () => void}}
 */
export function createSlidingWindowLimiter({ maxRequests, windowMs }) {
  const windows = new Map();

  function cleanup(key) {
    const timestamps = windows.get(key);
    if (!timestamps) return;
    const cutoff = Date.now() - windowMs;
    while (timestamps.length > 0 && timestamps[0] <= cutoff) {
      timestamps.shift();
    }
    if (timestamps.length === 0) windows.delete(key);
  }

  return {
    check(key) {
      cleanup(key);
      const timestamps = windows.get(key) || [];

      if (timestamps.length >= maxRequests) {
        const oldestInWindow = timestamps[0];
        const retryAfterMs = oldestInWindow + windowMs - Date.now();
        return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, retryAfterMs) };
      }

      timestamps.push(Date.now());
      windows.set(key, timestamps);
      return { allowed: true, remaining: maxRequests - timestamps.length, retryAfterMs: null };
    },

    reset(key) {
      windows.delete(key);
    },

    resetAll() {
      windows.clear();
    },
  };
}

/**
 * Create a token bucket rate limiter.
 * Tokens refill continuously at a fixed rate.
 *
 * @param {object} config
 * @param {number} config.capacity - Max tokens in the bucket
 * @param {number} config.refillRate - Tokens added per second
 * @returns {{consume: (key: string, tokens?: number) => {allowed: boolean, remaining: number, retryAfterMs: number|null}, reset: (key: string) => void}}
 */
export function createTokenBucket({ capacity, refillRate }) {
  const buckets = new Map();

  function getBucket(key) {
    if (!buckets.has(key)) {
      buckets.set(key, { tokens: capacity, lastRefill: Date.now() });
    }
    const bucket = buckets.get(key);
    const now = Date.now();
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillRate);
    bucket.lastRefill = now;
    return bucket;
  }

  return {
    consume(key, tokens = 1) {
      const bucket = getBucket(key);

      if (bucket.tokens >= tokens) {
        bucket.tokens -= tokens;
        return { allowed: true, remaining: Math.floor(bucket.tokens), retryAfterMs: null };
      }

      const deficit = tokens - bucket.tokens;
      const retryAfterMs = Math.ceil((deficit / refillRate) * 1000);
      return { allowed: false, remaining: 0, retryAfterMs };
    },

    reset(key) {
      buckets.delete(key);
    },
  };
}

/**
 * Retry a function with exponential backoff and jitter.
 *
 * @param {() => Promise<T>} fn - Async function to retry
 * @param {object} [options]
 * @param {number} [options.maxRetries=3] - Max retry attempts
 * @param {number} [options.baseDelayMs=1000] - Initial delay
 * @param {number} [options.maxDelayMs=30000] - Maximum delay cap
 * @param {number} [options.jitterFactor=0.5] - Random jitter factor (0-1)
 * @param {(error: Error, attempt: number) => boolean} [options.shouldRetry] - Custom retry predicate
 * @param {(attempt: number, delayMs: number, error: Error) => void} [options.onRetry] - Called before each retry
 * @returns {Promise<T>}
 * @template T
 */
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    jitterFactor = 0.5,
    shouldRetry = () => true,
    onRetry,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt >= maxRetries || !shouldRetry(err, attempt)) {
        throw err;
      }

      // Exponential backoff with jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = exponentialDelay * jitterFactor * Math.random();
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      if (onRetry) onRetry(attempt + 1, Math.round(delay), err);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Create a rate-limited version of an async function.
 * Combines rate limiting with automatic retry on rate limit errors.
 *
 * @param {Function} fn - Async function to rate-limit
 * @param {object} config
 * @param {number} config.maxPerSecond - Max calls per second
 * @param {number} [config.maxRetries=3] - Retries on rate limit
 * @returns {Function} Rate-limited version of fn
 */
export function rateLimitedFn(fn, { maxPerSecond, maxRetries = 3 }) {
  const limiter = createTokenBucket({ capacity: maxPerSecond, refillRate: maxPerSecond });
  const key = "default";

  return async function (...args) {
    return withRetry(
      async () => {
        const result = limiter.consume(key);
        if (!result.allowed) {
          const err = new Error("Rate limited");
          err.retryAfterMs = result.retryAfterMs;
          throw err;
        }
        return fn(...args);
      },
      {
        maxRetries,
        baseDelayMs: Math.ceil(1000 / maxPerSecond),
        shouldRetry: (err) => err.message === "Rate limited",
      }
    );
  };
}
