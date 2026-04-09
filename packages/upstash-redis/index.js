// Upstash Redis Client
// Zero dependencies. Uses the Upstash HTTP REST API — not TCP Redis protocol.
// All commands go through POST {UPSTASH_REDIS_REST_URL} with Bearer auth.

const TIMEOUT_MS = 15_000;
const TAG = "[upstash-redis]";

/**
 * Create an Upstash Redis client.
 *
 * Reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from the environment.
 * All methods return null on network or Redis errors (errors are logged via console.error).
 *
 * @param {object} [config]
 * @param {string} [config.url] - Override UPSTASH_REDIS_REST_URL
 * @param {string} [config.token] - Override UPSTASH_REDIS_REST_TOKEN
 * @returns {object} Redis client with cache, session, rateLimit, pubsub, queue, and pipeline APIs
 */
export function createClient(config = {}) {
  const url = config.url ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = config.token ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      `${TAG} UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set`
    );
  }

  // ---------------------------------------------------------------------------
  // Core command runner
  // ---------------------------------------------------------------------------

  /**
   * Execute a single Redis command.
   * @param {...(string|number)} args - Command and arguments, e.g. ("SET", "key", "value")
   * @returns {Promise<*>} Redis result, or null on error
   */
  async function cmd(...args) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`${TAG} HTTP ${res.status}: ${text}`);
        return null;
      }

      const json = await res.json();
      if (json.error) {
        console.error(`${TAG} Redis error: ${json.error}`);
        return null;
      }
      return json.result;
    } catch (err) {
      console.error(`${TAG} Command failed (${args[0]}): ${err.message}`);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Cache-aside (automatic JSON serialization)
  // ---------------------------------------------------------------------------

  const cache = {
    /**
     * Get a cached value. Returns the deserialized value or null on miss/error.
     * @param {string} key
     * @returns {Promise<*>}
     */
    async get(key) {
      const raw = await cmd("GET", key);
      if (raw == null) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    },

    /**
     * Set a cached value with optional TTL. Value is JSON-serialized automatically.
     * @param {string} key
     * @param {*} value
     * @param {number} [ttlSeconds] - Expiry in seconds. Omit for no expiry.
     * @returns {Promise<boolean>}
     */
    async set(key, value, ttlSeconds) {
      const serialized = JSON.stringify(value);
      const args = ttlSeconds != null
        ? ["SET", key, serialized, "EX", ttlSeconds]
        : ["SET", key, serialized];
      const result = await cmd(...args);
      return result === "OK";
    },

    /**
     * Delete one or more keys.
     * @param {...string} keys
     * @returns {Promise<number|null>} Number of keys deleted, or null on error
     */
    async del(...keys) {
      return cmd("DEL", ...keys);
    },

    /**
     * Cache-aside helper: return cached value, or compute + cache it.
     * @param {string} key
     * @param {() => Promise<*>} fn - Async function to compute the value on miss
     * @param {number} [ttlSeconds] - TTL for the computed value
     * @returns {Promise<*>}
     */
    async getOrSet(key, fn, ttlSeconds) {
      const cached = await cache.get(key);
      if (cached !== null) return cached;
      const fresh = await fn();
      if (fresh != null) await cache.set(key, fresh, ttlSeconds);
      return fresh;
    },
  };

  // ---------------------------------------------------------------------------
  // Session storage with sliding expiration
  // ---------------------------------------------------------------------------

  const session = {
    /**
     * Read a session. Automatically slides the TTL on access.
     * @param {string} sessionId
     * @param {number} ttlSeconds - Sliding window TTL (resets on every read/write)
     * @returns {Promise<object|null>}
     */
    async get(sessionId, ttlSeconds) {
      const key = `session:${sessionId}`;
      const raw = await cmd("GETEX", key, "EX", ttlSeconds);
      if (raw == null) return null;
      try {
        return JSON.parse(raw);
      } catch {
        console.error(`${TAG} Session parse error for ${sessionId}`);
        return null;
      }
    },

    /**
     * Write or update a session. Always sets a TTL — never stores without expiry.
     * @param {string} sessionId
     * @param {object} data - Session payload (must be JSON-serializable)
     * @param {number} ttlSeconds - Required. Sessions must always have a TTL.
     * @returns {Promise<boolean>}
     */
    async set(sessionId, data, ttlSeconds) {
      if (!ttlSeconds || ttlSeconds <= 0) {
        console.error(`${TAG} session.set requires a positive ttlSeconds — refusing to store without expiry`);
        return false;
      }
      const key = `session:${sessionId}`;
      const result = await cmd("SET", key, JSON.stringify(data), "EX", ttlSeconds);
      return result === "OK";
    },

    /**
     * Destroy a session.
     * @param {string} sessionId
     * @returns {Promise<boolean>}
     */
    async destroy(sessionId) {
      const result = await cmd("DEL", `session:${sessionId}`);
      return result != null && result > 0;
    },
  };

  // ---------------------------------------------------------------------------
  // Distributed rate limiting (fixed window, atomic via SET NX + INCR)
  // ---------------------------------------------------------------------------

  const rateLimit = {
    /**
     * Check and increment a distributed rate limit counter.
     * Uses SET NX for atomic window creation, then INCR for counting.
     * Safe across multiple serverless instances — no SETNX race condition.
     *
     * @param {string} key - Identifier, e.g. `rl:user:${userId}:1min`
     * @param {number} limit - Max requests allowed in the window
     * @param {number} windowSeconds - Window duration in seconds
     * @returns {Promise<{allowed: boolean, remaining: number, resetInSeconds: number}|null>}
     */
    async check(key, limit, windowSeconds) {
      // Atomic: SET key 0 NX EX windowSeconds  (only sets if not exists, preserving TTL)
      await cmd("SET", key, "0", "NX", "EX", windowSeconds);

      const count = await cmd("INCR", key);
      if (count == null) return null;

      const ttl = await cmd("TTL", key);
      const resetInSeconds = ttl != null && ttl > 0 ? ttl : windowSeconds;
      const remaining = Math.max(0, limit - count);

      return {
        allowed: count <= limit,
        remaining,
        resetInSeconds,
      };
    },

    /**
     * Reset a rate limit key immediately.
     * @param {string} key
     * @returns {Promise<boolean>}
     */
    async reset(key) {
      const result = await cmd("DEL", key);
      return result != null;
    },
  };

  // ---------------------------------------------------------------------------
  // Pub/Sub (Upstash REST pub/sub via PUBLISH + polling SUBSCRIBE endpoint)
  // Note: Upstash does not support persistent blocking SUBSCRIBE over HTTP.
  // PUBLISH is fully supported; for receiving, use Upstash Webhook triggers
  // or poll a queue instead. publish() is provided for fan-out use cases.
  // ---------------------------------------------------------------------------

  const pubsub = {
    /**
     * Publish a message to a channel. Message is JSON-serialized with an optional type tag.
     * @param {string} channel
     * @param {*} message - Any JSON-serializable value
     * @param {string} [type] - Optional message type for consumer-side filtering
     * @returns {Promise<number|null>} Number of subscribers that received the message, or null on error
     */
    async publish(channel, message, type) {
      const envelope = type != null ? { type, data: message } : message;
      return cmd("PUBLISH", channel, JSON.stringify(envelope));
    },

    /**
     * Store a message in a Redis list for poll-based consumption.
     * Useful when HTTP-based pub/sub polling is preferred over webhooks.
     * @param {string} channel
     * @param {*} message
     * @param {string} [type]
     * @param {number} [ttlSeconds=3600] - List key TTL (refreshed on each push)
     * @returns {Promise<number|null>} New list length, or null on error
     */
    async enqueue(channel, message, type, ttlSeconds = 3600) {
      const key = `pubsub:${channel}`;
      const envelope = JSON.stringify(type != null ? { type, data: message } : message);
      const len = await cmd("RPUSH", key, envelope);
      if (len != null) await cmd("EXPIRE", key, ttlSeconds);
      return len;
    },

    /**
     * Poll and drain all pending messages from a channel list.
     * @param {string} channel
     * @param {number} [count=100] - Max messages to drain per call
     * @returns {Promise<Array<*>|null>}
     */
    async poll(channel, count = 100) {
      const key = `pubsub:${channel}`;
      const raw = await pipeline([
        ["LRANGE", key, 0, count - 1],
        ["LTRIM", key, count, -1],
      ]);
      if (!raw || !raw[0]) return null;
      return raw[0].map((item) => {
        try { return JSON.parse(item); } catch { return item; }
      });
    },
  };

  // ---------------------------------------------------------------------------
  // Queue (LPUSH / BRPOP pattern for background job coordination)
  // Note: Upstash REST does not support BRPOP blocking — use LPOP with polling.
  // ---------------------------------------------------------------------------

  const queue = {
    /**
     * Push one or more jobs onto the left end of a queue list.
     * @param {string} queueName
     * @param {...*} jobs - Job payloads (JSON-serialized automatically)
     * @returns {Promise<number|null>} New queue length, or null on error
     */
    async push(queueName, ...jobs) {
      const serialized = jobs.map((j) => JSON.stringify(j));
      return cmd("LPUSH", `queue:${queueName}`, ...serialized);
    },

    /**
     * Pop the next job from the right end of the queue (FIFO order with LPUSH).
     * Returns null when the queue is empty or on error.
     * @param {string} queueName
     * @returns {Promise<*>}
     */
    async pop(queueName) {
      const raw = await cmd("RPOP", `queue:${queueName}`);
      if (raw == null) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    },

    /**
     * Pop up to `count` jobs from the queue in a single round-trip.
     * @param {string} queueName
     * @param {number} [count=10]
     * @returns {Promise<Array<*>|null>}
     */
    async popMany(queueName, count = 10) {
      const key = `queue:${queueName}`;
      // LMPOP available in Redis 7+; fall back to pipeline of RPOPs for compatibility
      const commands = Array.from({ length: count }, () => ["RPOP", key]);
      const results = await pipeline(commands);
      if (!results) return null;
      return results
        .filter((r) => r != null)
        .map((r) => { try { return JSON.parse(r); } catch { return r; } });
    },

    /**
     * Return the current queue length without consuming jobs.
     * @param {string} queueName
     * @returns {Promise<number|null>}
     */
    async length(queueName) {
      return cmd("LLEN", `queue:${queueName}`);
    },
  };

  // ---------------------------------------------------------------------------
  // Pipeline (batch multiple commands in a single HTTP round-trip)
  // Upstash pipeline endpoint: POST {url}/pipeline with array of command arrays.
  // ---------------------------------------------------------------------------

  /**
   * Execute multiple commands in a single HTTP request (pipeline).
   * @param {Array<Array<string|number>>} commands - Array of command arrays
   * @returns {Promise<Array<*>|null>} Ordered results, or null on error
   */
  async function pipeline(commands) {
    try {
      const res = await fetch(`${url}/pipeline`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(commands),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error(`${TAG} Pipeline HTTP ${res.status}: ${text}`);
        return null;
      }

      const json = await res.json();
      // Pipeline response is [{result, error}, ...] for each command
      return json.map((entry) => {
        if (entry.error) {
          console.error(`${TAG} Pipeline command error: ${entry.error}`);
          return null;
        }
        return entry.result;
      });
    } catch (err) {
      console.error(`${TAG} Pipeline failed: ${err.message}`);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return {
    /** Low-level command executor. Use when no higher-level helper fits. */
    cmd,
    /** Cache-aside helpers with automatic JSON serialization. */
    cache,
    /** Session storage with mandatory sliding TTL. */
    session,
    /** Distributed rate limiting safe across serverless instances. */
    rateLimit,
    /** Pub/sub publish and poll-based message consumption. */
    pubsub,
    /** FIFO queue backed by Redis lists (LPUSH / RPOP). */
    queue,
    /** Batch multiple commands in one HTTP round-trip. */
    pipeline,
  };
}
