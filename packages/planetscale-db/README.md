# planetscale-db

Zero-dependency wrapper for the [PlanetScale](https://github.com/planetscale/database-js) serverless database HTTP API. Execute SQL queries, run transactions, and manage connections using native `fetch` — no drivers or SDKs required.

## Installation

```bash
bee install planetscale-db
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_HOST` | PlanetScale database host (e.g. `aws.connect.psdb.cloud`) | Yes |
| `DATABASE_USERNAME` | PlanetScale database username | Yes |
| `DATABASE_PASSWORD` | PlanetScale database password | Yes |

## Usage

### Execute a Query

```js
import { execute } from 'planetscale-db';

// Simple select
const users = await execute('SELECT * FROM users WHERE active = ?', [true]);
console.log(users.rows);

// Insert
const result = await execute(
  'INSERT INTO users (name, email) VALUES (?, ?)',
  ['Alice', 'alice@example.com']
);
console.log(result.insertId);
```

### Run a Transaction

```js
import { transaction } from 'planetscale-db';

const results = await transaction([
  { query: 'UPDATE accounts SET balance = balance - ? WHERE id = ?', args: [100, 1] },
  { query: 'UPDATE accounts SET balance = balance + ? WHERE id = ?', args: [100, 2] },
]);
```

### Custom Connection

```js
import { createConnection, execute } from 'planetscale-db';

const conn = createConnection({
  host: 'aws.connect.psdb.cloud',
  username: 'myuser',
  password: 'mypassword',
});

const result = await execute('SELECT 1', [], conn);
```

## API Reference

### `execute(query, args?, opts?)`
Execute a single SQL query. Returns `{ columns, rows, rowsAffected, insertId }` or `null` on failure.

### `transaction(statements, opts?)`
Execute multiple statements in a BEGIN/COMMIT transaction. Automatically rolls back on failure. Returns an array of results or `null`.

### `createConnection(opts?)`
Create a reusable connection config object with host, credentials, and pre-computed auth header.

## Error Handling

All functions return `null` on failure and log errors to `console.error`. Fetch calls use a 15-second timeout via `AbortSignal.timeout(15000)`.
