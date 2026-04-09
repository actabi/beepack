# PostgreSQL Client

Zero-dependency PostgreSQL HTTP client for Neon serverless, Supabase, or PostgREST.

## Prerequisites

- Node.js >= 18
- Neon/Supabase/PostgREST endpoint

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL HTTP endpoint |

## Usage

### Query

```js
import { createPgClient } from './index.js';
const db = createPgClient({ connectionString: process.env.DATABASE_URL });
const { rows } = await db.query("SELECT * FROM users WHERE age > $1", [18]);
```

### Insert

```js
const user = await db.insert("users", { name: "Alice", email: "alice@example.com" });
```

### Find

```js
const admins = await db.find("users", { role: "admin" }, { orderBy: "name", limit: 10 });
```

### Transactions

```js
await db.transaction(async (tx) => {
  await tx.query("UPDATE accounts SET balance = balance - $1 WHERE id = $2", [100, "A"]);
  await tx.query("UPDATE accounts SET balance = balance + $1 WHERE id = $2", [100, "B"]);
});
```

## Source

Based on [brianc/node-postgres](https://github.com/brianc/node-postgres) by **Brian Carlson** — 13,110+ stars on GitHub.