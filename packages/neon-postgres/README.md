# neon-postgres

Neon serverless Postgres via the SQL-over-HTTP API. Parameterized queries, transactions with automatic rollback, CRUD helpers, batch queries, connection pool config, and a migration workflow. Zero dependencies — uses native `fetch`.

Handles the sharp edges: preventing SQL injection via parameterized placeholders, guarding against accidental full-table updates/deletes, atomic migration tracking, and clean error logging without throwing.

## Setup

```bash
DATABASE_URL=postgresql://user:password@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
```

Find this in your Neon dashboard under **Connection Details → Connection string**.

## Usage

### Create a pool

Call `createPool()` once at module init. The returned object is passed to every query function.

```js
import { createPool } from "./index.js";

const pool = createPool();
// or pass explicitly:
const pool = createPool({ connectionString: process.env.DATABASE_URL });

if (!pool) {
  // DATABASE_URL was missing or malformed — createPool logged the error
  process.exit(1);
}
```

### Raw SQL with parameterized queries

Use `$1`, `$2` … placeholders. Never interpolate values into SQL strings.

```js
import { sql, sqlOne } from "./index.js";

// Returns an array of row objects
const users = await sql(pool, "SELECT * FROM users WHERE active = $1", [true]);

// Returns the first row or null
const user = await sqlOne(
  pool,
  "SELECT id, email FROM users WHERE email = $1",
  ["alice@example.com"]
);
```

### CRUD helpers

```js
import { select, insert, update, remove } from "./index.js";

// SELECT
const posts = await select(pool, "posts", {
  columns: "id, title, created_at",
  where: { user_id: "uuid-here", published: true },
  orderBy: "created_at",
  direction: "DESC",
  limit: 20,
  offset: 0,
});

// INSERT — returns the inserted row
const post = await insert(pool, "posts", {
  user_id: "uuid-here",
  title: "Hello world",
  body: "...",
});

// INSERT with ON CONFLICT DO NOTHING
const safe = await insert(
  pool,
  "email_subscriptions",
  { email: "alice@example.com", list_id: 1 },
  { onConflict: "(email, list_id) DO NOTHING" }
);

// UPDATE — 'where' is required (guards against full-table updates)
const updated = await update(
  pool,
  "posts",
  { title: "Updated title", updated_at: new Date().toISOString() },
  { id: "post-uuid" }
);
// updated is an array of updated rows

// DELETE — 'where' is required (guards against full-table deletes)
const ok = await remove(pool, "posts", { id: "post-uuid" });
// ok === true on success, null on error

// DELETE with RETURNING
const deleted = await remove(pool, "posts", { id: "post-uuid" }, { returning: "id, title" });
// deleted is an array of the removed rows
```

### Transactions with rollback

Use `transaction()` when multiple statements must succeed or fail together. Neon rolls back the entire transaction on any error.

```js
import { transaction } from "./index.js";

const results = await transaction(pool, [
  {
    query: "INSERT INTO orders (user_id, total) VALUES ($1, $2) RETURNING id",
    params: [userId, total],
  },
  {
    query: "UPDATE balances SET amount = amount - $1 WHERE user_id = $2",
    params: [total, userId],
  },
  {
    query: "INSERT INTO audit_log (event, user_id) VALUES ($1, $2)",
    params: ["order_placed", userId],
  },
]);

if (!results) {
  // All statements were rolled back — error already logged
}
// results[0] => rows from the INSERT INTO orders
// results[1] => rows from the UPDATE balances
```

### Batch queries (independent, parallel)

Use `batch()` for multiple unrelated queries you want to fire in a single round-trip. Unlike `transaction()`, these are not atomic.

```js
import { batch } from "./index.js";

const [users, products, orders] = await batch(pool, [
  { query: "SELECT COUNT(*)::int AS n FROM users" },
  { query: "SELECT COUNT(*)::int AS n FROM products WHERE active = $1", params: [true] },
  { query: "SELECT COUNT(*)::int AS n FROM orders WHERE created_at > $1", params: [since] },
]);
```

### Migration workflow

```js
import { runMigrations } from "./index.js";

const { applied, skipped, failed } = await runMigrations(pool, [
  {
    name: "001_create_users",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email      TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  },
  {
    name: "002_create_posts",
    sql: `
      CREATE TABLE IF NOT EXISTS posts (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title      TEXT NOT NULL,
        body       TEXT NOT NULL DEFAULT '',
        published  BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
  },
]);

console.log("Applied:", applied);   // ["001_create_users"]
console.log("Skipped:", skipped);   // ["002_create_posts"] (already run)
if (failed) {
  console.error("Migration chain stopped at:", failed);
}
```

`runMigrations` creates a `_beepack_migrations` table on first run to track applied migrations. Each migration is applied in a transaction alongside its tracking record — if the DDL fails, the record is not written, so the migration will be retried on the next run.

## Edge Cases Handled

- **SQL injection** — CRUD helpers and raw `sql()` always use parameterized placeholders; values are never interpolated into query text
- **Accidental full-table mutations** — `update()` and `remove()` require a non-empty `where` argument and log an error and return `null` if it is missing
- **Transaction rollback** — `transaction()` uses Neon's batch endpoint, which rolls back all statements atomically on any failure
- **Missing DATABASE_URL** — `createPool()` returns `null` and logs immediately, rather than failing silently at query time
- **Network / timeout errors** — all functions return `null`/`false` on error and log via `console.error("[neon-postgres] ...")`, never throw
- **Idempotent migrations** — already-applied migrations are skipped by name; the chain stops on the first failure so partial migrations are not silently ignored
