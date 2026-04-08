// Neon Postgres
// Zero dependencies — uses native fetch with the Neon SQL-over-HTTP API.
// Handles parameterized queries, transactions with automatic rollback,
// CRUD helpers, batch queries, and migration workflow.
//
// Required env: DATABASE_URL (Neon connection string)
// Format: postgresql://user:password@host.neon.tech/dbname?sslmode=require

const TIMEOUT_MS = 15000;
const TAG = "[neon-postgres]";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Derive the Neon SQL-over-HTTP endpoint from a postgres:// connection string.
 * Neon exposes the same host over HTTPS at /sql for HTTP-based queries.
 *
 * @param {string} connectionString
 * @returns {{ httpUrl: string, headers: object }}
 */
function parseConnectionString(connectionString) {
  // Accept postgresql:// or postgres:// schemes
  const normalized = connectionString.replace(/^postgres:\/\//, "postgresql://");
  const url = new URL(normalized);

  // The HTTP endpoint is https://<host>/sql
  const httpUrl = `https://${url.host}/sql`;

  // Basic auth credentials are passed as an Authorization header
  const credentials = btoa(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`);
  const headers = {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
    "Neon-Connection-String": connectionString,
  };

  return { httpUrl, headers };
}

/**
 * Execute a single SQL statement against the Neon HTTP API.
 * Returns the raw Neon response object or null on error.
 *
 * @param {string} httpUrl
 * @param {object} headers
 * @param {string} query - SQL text with $1, $2 … placeholders
 * @param {Array<*>} [params=[]] - Positional parameter values
 * @returns {Promise<{rows: Array<object>, rowCount: number, fields: Array<object>}|null>}
 */
async function httpQuery(httpUrl, headers, query, params = []) {
  try {
    const res = await fetch(httpUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ query, params }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error(`${TAG} HTTP ${res.status}: ${body.message || body.error || JSON.stringify(body)}`);
      return null;
    }

    return res.json();
  } catch (err) {
    console.error(`${TAG} fetch failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Connection pool config helpers
// ---------------------------------------------------------------------------

/**
 * Build a reusable connection config from environment variables.
 * Call this once at module init — it validates that DATABASE_URL is set
 * and returns a config object to pass into every query function.
 *
 * Neon's serverless HTTP API is stateless, so "pooling" here means
 * reusing the parsed URL and headers rather than holding open connections.
 *
 * @param {object} [options]
 * @param {string} [options.connectionString] - Defaults to process.env.DATABASE_URL
 * @returns {{ httpUrl: string, headers: object, connectionString: string } | null}
 */
export function createPool(options = {}) {
  const connectionString = options.connectionString || process.env.DATABASE_URL;

  if (!connectionString) {
    console.error(`${TAG} createPool: DATABASE_URL is not set`);
    return null;
  }

  try {
    const { httpUrl, headers } = parseConnectionString(connectionString);
    return { httpUrl, headers, connectionString };
  } catch (err) {
    console.error(`${TAG} createPool: invalid connection string — ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Core query API
// ---------------------------------------------------------------------------

/**
 * Execute a parameterized SQL query and return rows.
 * Always use $1, $2 … placeholders — never interpolate values into SQL text.
 *
 * @param {object} pool - Config object from createPool()
 * @param {string} query - SQL with $1 … $N placeholders
 * @param {Array<*>} [params=[]] - Parameter values (strings, numbers, booleans, null)
 * @returns {Promise<Array<object>|null>} Array of row objects, or null on error
 *
 * @example
 * const rows = await sql(pool, "SELECT * FROM users WHERE id = $1", [userId]);
 */
export async function sql(pool, query, params = []) {
  const result = await httpQuery(pool.httpUrl, pool.headers, query, params);
  if (!result) return null;
  return result.rows ?? [];
}

/**
 * Execute a query and return the first row, or null if no rows matched.
 *
 * @param {object} pool
 * @param {string} query
 * @param {Array<*>} [params=[]]
 * @returns {Promise<object|null>}
 *
 * @example
 * const user = await sqlOne(pool, "SELECT * FROM users WHERE email = $1", [email]);
 */
export async function sqlOne(pool, query, params = []) {
  const rows = await sql(pool, query, params);
  if (!rows) return null;
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

/**
 * Select rows from a table with optional filtering, ordering, and limiting.
 *
 * @param {object} pool
 * @param {string} table - Table name (schema-qualified if needed, e.g. "public.users")
 * @param {object} [options]
 * @param {string} [options.columns="*"] - Comma-separated column list
 * @param {object} [options.where] - Key-value equality conditions (ANDed together)
 * @param {string} [options.orderBy] - Column to order by
 * @param {"ASC"|"DESC"} [options.direction="ASC"]
 * @param {number} [options.limit]
 * @param {number} [options.offset]
 * @returns {Promise<Array<object>|null>}
 */
export async function select(pool, table, options = {}) {
  const { columns = "*", where, orderBy, direction = "ASC", limit, offset } = options;

  const params = [];
  const conditions = [];

  if (where) {
    for (const [col, val] of Object.entries(where)) {
      params.push(val);
      conditions.push(`${col} = $${params.length}`);
    }
  }

  let query = `SELECT ${columns} FROM ${table}`;
  if (conditions.length) query += ` WHERE ${conditions.join(" AND ")}`;
  if (orderBy) query += ` ORDER BY ${orderBy} ${direction === "DESC" ? "DESC" : "ASC"}`;
  if (limit != null) { params.push(limit); query += ` LIMIT $${params.length}`; }
  if (offset != null) { params.push(offset); query += ` OFFSET $${params.length}`; }

  return sql(pool, query, params);
}

/**
 * Insert one row and return the inserted record.
 *
 * @param {object} pool
 * @param {string} table
 * @param {object} data - Column-value pairs to insert
 * @param {object} [options]
 * @param {string} [options.returning="*"] - RETURNING clause columns
 * @param {string} [options.onConflict] - ON CONFLICT clause, e.g. "(id) DO NOTHING"
 * @returns {Promise<object|null>} The inserted row, or null on error
 */
export async function insert(pool, table, data, options = {}) {
  const { returning = "*", onConflict } = options;
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");

  let query = `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${placeholders})`;
  if (onConflict) query += ` ON CONFLICT ${onConflict}`;
  query += ` RETURNING ${returning}`;

  return sqlOne(pool, query, values);
}

/**
 * Update rows matching the where conditions and return updated records.
 *
 * @param {object} pool
 * @param {string} table
 * @param {object} data - Columns to update
 * @param {object} where - Equality conditions to identify rows (required — prevents accidental full-table update)
 * @param {object} [options]
 * @param {string} [options.returning="*"]
 * @returns {Promise<Array<object>|null>} Updated rows, or null on error
 */
export async function update(pool, table, data, where, options = {}) {
  const { returning = "*" } = options;

  if (!where || Object.keys(where).length === 0) {
    console.error(`${TAG} update: 'where' is required to prevent full-table updates`);
    return null;
  }

  const params = [];
  const setClauses = Object.entries(data).map(([col, val]) => {
    params.push(val);
    return `${col} = $${params.length}`;
  });

  const conditions = Object.entries(where).map(([col, val]) => {
    params.push(val);
    return `${col} = $${params.length}`;
  });

  const query =
    `UPDATE ${table} SET ${setClauses.join(", ")} WHERE ${conditions.join(" AND ")} RETURNING ${returning}`;

  return sql(pool, query, params);
}

/**
 * Delete rows matching the where conditions.
 *
 * @param {object} pool
 * @param {string} table
 * @param {object} where - Equality conditions (required — prevents accidental full-table delete)
 * @param {object} [options]
 * @param {string} [options.returning] - Optional RETURNING clause columns
 * @returns {Promise<Array<object>|boolean|null>} Deleted rows if returning set, true on success, null on error
 */
export async function remove(pool, table, where, options = {}) {
  const { returning } = options;

  if (!where || Object.keys(where).length === 0) {
    console.error(`${TAG} remove: 'where' is required to prevent full-table deletes`);
    return null;
  }

  const params = [];
  const conditions = Object.entries(where).map(([col, val]) => {
    params.push(val);
    return `${col} = $${params.length}`;
  });

  let query = `DELETE FROM ${table} WHERE ${conditions.join(" AND ")}`;
  if (returning) query += ` RETURNING ${returning}`;

  const rows = await sql(pool, query, params);
  if (rows === null) return null;
  return returning ? rows : true;
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

/**
 * Run multiple SQL statements in a single transaction with automatic rollback
 * on any failure. Neon's HTTP API supports transactions via the batch endpoint.
 *
 * Each statement in `statements` is { query, params? }.
 * The function returns the array of result sets (one per statement), or null
 * if any statement fails (the entire transaction is rolled back by Neon).
 *
 * @param {object} pool
 * @param {Array<{query: string, params?: Array<*>}>} statements
 * @returns {Promise<Array<Array<object>>|null>} Results per statement, or null on failure
 *
 * @example
 * const results = await transaction(pool, [
 *   { query: "INSERT INTO orders (user_id, total) VALUES ($1, $2)", params: [userId, total] },
 *   { query: "UPDATE balances SET amount = amount - $1 WHERE user_id = $2", params: [total, userId] },
 * ]);
 */
export async function transaction(pool, statements) {
  if (!statements || statements.length === 0) {
    console.error(`${TAG} transaction: statements array is empty`);
    return null;
  }

  // Neon's batch/transaction endpoint wraps multiple queries atomically.
  // POST /sql with { queries: [{ query, params }, ...] }
  try {
    const res = await fetch(pool.httpUrl, {
      method: "POST",
      headers: pool.headers,
      body: JSON.stringify({
        queries: statements.map(({ query, params = [] }) => ({ query, params })),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error(`${TAG} transaction HTTP ${res.status}: ${body.message || body.error || JSON.stringify(body)}`);
      return null;
    }

    const data = await res.json();
    // Neon returns { results: [ { rows, rowCount, fields }, ... ] }
    const results = data.results ?? data;
    if (!Array.isArray(results)) {
      console.error(`${TAG} transaction: unexpected response shape`);
      return null;
    }
    return results.map((r) => r.rows ?? []);
  } catch (err) {
    console.error(`${TAG} transaction failed: ${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Batch queries (independent — not transactional)
// ---------------------------------------------------------------------------

/**
 * Execute multiple independent queries in a single HTTP round-trip.
 * Unlike transaction(), these are NOT atomic — a failure in one does not
 * roll back the others. Use transaction() when atomicity is required.
 *
 * @param {object} pool
 * @param {Array<{query: string, params?: Array<*>}>} statements
 * @returns {Promise<Array<Array<object>|null>>} Result rows per query (null for failed ones)
 */
export async function batch(pool, statements) {
  // Run in parallel — each is its own HTTP request
  const results = await Promise.all(
    statements.map(({ query, params = [] }) => sql(pool, query, params))
  );
  return results;
}

// ---------------------------------------------------------------------------
// Migration workflow helpers
// ---------------------------------------------------------------------------

/**
 * Ensure the migrations tracking table exists.
 * Call this once during your app's startup sequence before running migrations.
 *
 * @param {object} pool
 * @returns {Promise<boolean>} true if the table is ready, false on error
 */
export async function ensureMigrationsTable(pool) {
  const rows = await sql(
    pool,
    `CREATE TABLE IF NOT EXISTS _beepack_migrations (
       id         SERIAL PRIMARY KEY,
       name       TEXT NOT NULL UNIQUE,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  return rows !== null;
}

/**
 * Apply a named migration if it has not already been applied.
 * Wraps the migration SQL in a transaction alongside the tracking INSERT
 * so both succeed or both roll back.
 *
 * @param {object} pool
 * @param {string} name - Unique migration name, e.g. "001_create_users"
 * @param {string} migrationSql - DDL/DML to execute (single or multi-statement)
 * @returns {Promise<"applied"|"skipped"|"error">}
 */
export async function applyMigration(pool, name, migrationSql) {
  // Check whether it's already been applied
  const existing = await sqlOne(
    pool,
    "SELECT id FROM _beepack_migrations WHERE name = $1",
    [name]
  );
  if (existing === null && existing !== undefined) {
    // sqlOne returning null can mean "no row" or "error" — disambiguate
  }
  // Re-check: sqlOne returns null both for "no match" and "query error"
  // so we run a count query for a definitive answer
  const countResult = await sqlOne(
    pool,
    "SELECT COUNT(*)::int AS n FROM _beepack_migrations WHERE name = $1",
    [name]
  );
  if (!countResult) {
    console.error(`${TAG} applyMigration: could not check migration status for "${name}"`);
    return "error";
  }
  if (countResult.n > 0) {
    return "skipped";
  }

  // Run the migration and record it atomically
  const results = await transaction(pool, [
    { query: migrationSql },
    { query: "INSERT INTO _beepack_migrations (name) VALUES ($1)", params: [name] },
  ]);

  if (!results) {
    console.error(`${TAG} applyMigration: migration "${name}" failed and was rolled back`);
    return "error";
  }

  return "applied";
}

/**
 * Run an ordered list of migrations, skipping any already applied.
 * Migrations are applied sequentially — a failure stops the chain.
 *
 * @param {object} pool
 * @param {Array<{name: string, sql: string}>} migrations
 * @returns {Promise<{applied: string[], skipped: string[], failed: string|null}>}
 */
export async function runMigrations(pool, migrations) {
  const applied = [];
  const skipped = [];

  const ready = await ensureMigrationsTable(pool);
  if (!ready) {
    return { applied, skipped, failed: "_setup" };
  }

  for (const { name, sql: migrationSql } of migrations) {
    const status = await applyMigration(pool, name, migrationSql);
    if (status === "applied") {
      applied.push(name);
    } else if (status === "skipped") {
      skipped.push(name);
    } else {
      return { applied, skipped, failed: name };
    }
  }

  return { applied, skipped, failed: null };
}
