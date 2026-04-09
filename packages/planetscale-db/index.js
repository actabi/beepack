// @ts-check

/**
 * PlanetScale serverless database driver wrapper.
 * Uses the PlanetScale HTTP API (JSON over HTTP) for executing SQL queries.
 * Zero dependencies — uses native fetch and AbortSignal.
 *
 * @module planetscale-db
 */

const DEFAULT_HOST = process.env.DATABASE_HOST;
const DEFAULT_USERNAME = process.env.DATABASE_USERNAME;
const DEFAULT_PASSWORD = process.env.DATABASE_PASSWORD;

/**
 * Create a connection configuration object for PlanetScale.
 * @param {object} [opts]
 * @param {string} [opts.host] - Database host (defaults to DATABASE_HOST env)
 * @param {string} [opts.username] - Database username (defaults to DATABASE_USERNAME env)
 * @param {string} [opts.password] - Database password (defaults to DATABASE_PASSWORD env)
 * @returns {{ host: string, username: string, password: string, baseUrl: string, authHeader: string }}
 */
export function createConnection(opts = {}) {
  const host = opts.host || DEFAULT_HOST;
  const username = opts.username || DEFAULT_USERNAME;
  const password = opts.password || DEFAULT_PASSWORD;

  if (!host || !username || !password) {
    throw new Error(
      'PlanetScale credentials required. Set DATABASE_HOST, DATABASE_USERNAME, DATABASE_PASSWORD env vars or pass them as options.'
    );
  }

  const baseUrl = `https://${host}`;
  const authHeader = `Basic ${btoa(`${username}:${password}`)}`;

  return { host, username, password, baseUrl, authHeader };
}

/**
 * Encode a query parameter value for the PlanetScale HTTP API.
 * @param {unknown} value
 * @returns {object}
 */
function encodeParam(value) {
  if (value === null || value === undefined) {
    return { type: 'NULL', value: null };
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return { type: 'INT64', value: String(value) };
    }
    return { type: 'FLOAT64', value: String(value) };
  }
  if (typeof value === 'boolean') {
    return { type: 'INT8', value: value ? '1' : '0' };
  }
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return { type: 'BLOB', value: btoa(binary) };
  }
  return { type: 'VARCHAR', value: String(value) };
}

/**
 * Parse a result set from the PlanetScale HTTP API response.
 * @param {object} result - Raw API result object
 * @returns {{ columns: string[], rows: object[], rowsAffected: number, insertId: string | null }}
 */
function parseResult(result) {
  const fields = result.fields || [];
  const columns = fields.map((/** @type {{ name: string }} */ f) => f.name);
  const rawRows = result.rows || [];

  const rows = rawRows.map((/** @type {object} */ row) => {
    const parsed = {};
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const val = row.values ? row.values[i] : row[col];
      parsed[col] = val !== undefined ? val : null;
    }
    return parsed;
  });

  return {
    columns,
    rows,
    rowsAffected: Number(result.rowsAffected || 0),
    insertId: result.insertId || null,
  };
}

/**
 * Execute a SQL query against PlanetScale via the HTTP API.
 * @param {string} query - SQL query string
 * @param {unknown[]} [args] - Positional query parameters
 * @param {object} [opts]
 * @param {string} [opts.host] - Database host override
 * @param {string} [opts.username] - Username override
 * @param {string} [opts.password] - Password override
 * @returns {Promise<{ columns: string[], rows: object[], rowsAffected: number, insertId: string | null } | null>}
 */
export async function execute(query, args = [], opts = {}) {
  try {
    const conn = createConnection(opts);
    const url = `${conn.baseUrl}/psdb.v1alpha1.Database/Execute`;

    const body = {
      query,
    };

    if (args && args.length > 0) {
      body.bind_variables = {};
      for (let i = 0; i < args.length; i++) {
        body.bind_variables[`v${i + 1}`] = encodeParam(args[i]);
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: conn.authHeader,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      console.error(`PlanetScale execute error (${response.status}): ${errText}`);
      return null;
    }

    const data = await response.json();

    if (data.error) {
      console.error(`PlanetScale query error: ${data.error.message || JSON.stringify(data.error)}`);
      return null;
    }

    return parseResult(data.result || data);
  } catch (err) {
    console.error(`PlanetScale execute failed: ${err.message}`);
    return null;
  }
}

/**
 * Execute multiple SQL statements as a transaction against PlanetScale.
 * Each statement is executed sequentially. If any statement fails, the
 * transaction is not automatically rolled back (PlanetScale HTTP API limitation).
 * @param {Array<{ query: string, args?: unknown[] }>} statements - Array of SQL statements
 * @param {object} [opts]
 * @param {string} [opts.host] - Database host override
 * @param {string} [opts.username] - Username override
 * @param {string} [opts.password] - Password override
 * @returns {Promise<Array<{ columns: string[], rows: object[], rowsAffected: number, insertId: string | null }> | null>}
 */
export async function transaction(statements, opts = {}) {
  if (!Array.isArray(statements) || statements.length === 0) {
    console.error('PlanetScale transaction requires a non-empty array of statements.');
    return null;
  }

  try {
    const results = [];

    const beginResult = await execute('BEGIN', [], opts);
    if (!beginResult) {
      console.error('PlanetScale transaction: failed to BEGIN.');
      return null;
    }

    for (const stmt of statements) {
      const result = await execute(stmt.query, stmt.args || [], opts);
      if (!result) {
        await execute('ROLLBACK', [], opts);
        console.error(`PlanetScale transaction: statement failed, rolled back. Query: ${stmt.query}`);
        return null;
      }
      results.push(result);
    }

    const commitResult = await execute('COMMIT', [], opts);
    if (!commitResult) {
      console.error('PlanetScale transaction: failed to COMMIT.');
      return null;
    }

    return results;
  } catch (err) {
    console.error(`PlanetScale transaction failed: ${err.message}`);
    await execute('ROLLBACK', [], opts).catch(() => {});
    return null;
  }
}
