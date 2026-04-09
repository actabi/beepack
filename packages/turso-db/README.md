# turso-db

Zero-dependency wrapper for the [Turso](https://turso.tech/) / libSQL HTTP API.
Wraps [tursodatabase/libsql-client-ts](https://github.com/tursodatabase/libsql-client-ts) (550 stars).

## Install

```bash
beepack add turso-db
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TURSO_DATABASE_URL` | Yes | Your Turso database HTTP URL |
| `TURSO_AUTH_TOKEN` | Yes | Authentication token |

## Usage

### Create a client

```js
import { createClient } from "./index.js";

const db = createClient();
// or with explicit config:
const db2 = createClient({
  url: "https://my-db-org.turso.io",
  authToken: "your-token",
});
```

### Execute a single query

```js
const result = await db.execute("SELECT * FROM users WHERE id = ?", [42]);
console.log(result.rows);    // [{ id: 42, name: "Alice" }]
console.log(result.columns); // ["id", "name"]
```

### Batch multiple statements

```js
const results = await db.batch([
  "CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, text TEXT)",
  { sql: "INSERT INTO notes (text) VALUES (?)", args: ["Hello world"] },
  "SELECT * FROM notes",
]);

console.log(results[2].rows); // [{ id: 1, text: "Hello world" }]
```

### Standalone usage (without client)

```js
import { execute, batch } from "./index.js";

// Uses TURSO_DATABASE_URL and TURSO_AUTH_TOKEN from environment
const result = await execute("SELECT 1 + 1 AS sum");
console.log(result.rows[0].sum); // 2
```

## API

### `createClient(options?)`
Creates a client bound to a database. Returns an object with `execute` and `batch` methods.

### `execute(sql, args?, options?)`
Execute a single SQL statement with optional positional parameters. Returns `{ columns, rows, rowsAffected }` or `null`.

### `batch(statements, options?)`
Execute multiple statements in a single HTTP round-trip. Each statement can be a string or `{ sql, args }`. Returns an array of results or `null`.

## License

MIT
