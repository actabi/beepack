# Redis Client

Zero-dependency Redis client for Upstash REST API and compatible endpoints. Caching, hash operations, lists, and a cache-through wrapper.

## Prerequisites

- Node.js >= 18
- Upstash Redis or compatible REST endpoint
- \`REDIS_URL\` and \`REDIS_TOKEN\` env vars

## Environment Variables

| Variable | Description |
|----------|-------------|
| \`REDIS_URL\` | Upstash REST URL |
| \`REDIS_TOKEN\` | Authentication token |

## Usage

### Basic Operations

\`\`\`js
import { createRedisClient } from './index.js';

const redis = createRedisClient({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN
});

await redis.set("user:1", "Alice", 3600);
const name = await redis.get("user:1");
\`\`\`

### Hash Operations

\`\`\`js
await redis.hset("user:1:profile", "email", "alice@example.com");
const email = await redis.hget("user:1:profile", "email");
const profile = await redis.hgetall("user:1:profile");
\`\`\`

### Cache-Through Pattern

\`\`\`js
import { cacheWith } from './index.js';

const data = await cacheWith(redis, "api:users", async () => {
  const res = await fetch("https://api.example.com/users");
  return res.json();
}, 300);
\`\`\`

## Source

Based on [ioredis](https://github.com/redis/ioredis) (15k+ stars).