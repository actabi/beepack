// turso-db — zero-dependency Turso/libSQL HTTP API wrapper
// SPDX-License-Identifier: MIT

/**
 * @typedef {object} TursoClient
 * @property {string} url - Database URL.
 * @property {string} authToken - Auth token.
 * @property {function} execute - Execute a single SQL statement.
 * @property {function} batch - Execute multiple SQL statements.
 */

/**
 * Create a Turso client bound to a specific database.
 * @param {object} [options] - Client configuration.
 * @param {string} [options.url] - Database URL (falls back to TURSO_DATABASE_URL env).
 * @param {string} [options.authToken] - Auth token (falls back to TURSO_AUTH_TOKEN env).
 * @returns {TursoClient} A client object with execute and batch methods.
 */
export function createClient(options = {}) {
  const url = options.url || process.env.TURSO_DATABASE_URL;
  const authToken = options.authToken || process.env.TURSO_AUTH_TOKEN;

  if (!url) throw new Error("TURSO_DATABASE_URL is required");
  if (!authToken) throw new Error("TURSO_AUTH_TOKEN is required");

  // Normalize URL — strip trailing slash
  const baseUrl = url.replace(/\/+$/, "");

  return {
    url: baseUrl,
    authToken,
    execute: (sql, args) => execute(sql, args, { url: baseUrl, authToken }),
    batch: (statements) => batch(statements, { url: baseUrl, authToken }),
  };
}

/**
 * Build request headers for the Turso HTTP API.
 * @param {string} authToken - Bearer token.
 * @returns {object} Headers object.
 */
function buildHeaders(authToken) {
  return {
    Authorization: `Bearer ${authToken}`,
    "Content-Type": "application/json",
  };
}

/**
 * Convert a row result from Turso wire format to a plain object array.
 * @param {object} result - Raw Turso result with cols and rows.
 * @returns {Array<object>} Array of row objects.
 */
function parseRows(result) {
  if (!result || !result.cols || !result.rows) return [];
  const cols = result.cols.map((c) => c.name);
  return result.rows.map((row) => {
    const obj = {};
    for (let i = 0; i < cols.length; i++) {
      const cell = row[i];
      obj[cols[i]] = cell && cell.value !== undefined ? cell.value : cell;
    }
    return obj;
  });
}

/**
 * Execute a single SQL statement against Turso.
 * @param {string} sql - SQL statement to execute.
 * @param {Array} [args] - Positional arguments for parameterized queries.
 * @param {object} [options] - Connection options.
 * @param {string} [options.url] - Database URL (falls back to env).
 * @param {string} [options.authToken] - Auth token (falls back to env).
 * @returns {Promise<{columns: string[], rows: object[], rowsAffected: number}|null>} Result or null on failure.
 */
export async function execute(sql, args, options = {}) {
  try {
    const baseUrl = (options.url || process.env.TURSO_DATABASE_URL || "").replace(/\/+$/, "");
    const authToken = options.authToken || process.env.TURSO_AUTH_TOKEN;

    if (!baseUrl) throw new Error("TURSO_DATABASE_URL is required");
    if (!authToken) throw new Error("TURSO_AUTH_TOKEN is required");

    const stmt = { type: "execute", stmt: { sql } };
    if (args && args.length > 0) {
      stmt.stmt.args = args.map((a) => {
        if (a === null) return { type: "null", value: null };
        if (typeof a === "number") return Number.isInteger(a) ? { type: "integer", value: String(a) } : { type: "float", value: a };
        if (typeof a === "string") return { type: "text", value: a };
        if (typeof a === "boolean") return { type: "integer", value: a ? "1" : "0" };
        return { type: "text", value: String(a) };
      });
    }

    const body = {
      requests: [stmt, { type: "close" }],
    };

    const res = await fetch(`${baseUrl}/v2/pipeline`, {
      method: "POST",
      headers: buildHeaders(authToken),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Turso execute error ${res.status}: ${err}`);
      return null;
    }

    const data = await res.json();
    const result = data.results?.[0]?.response?.result;

    if (!result) return { columns: [], rows: [], rowsAffected: 0 };

    return {
      columns: (result.cols || []).map((c) => c.name),
      rows: parseRows(result),
      rowsAffected: result.affected_row_count || 0,
    };
  } catch (err) {
    console.error("Turso execute failed:", err.message);
    return null;
  }
}

/**
 * Execute multiple SQL statements in a batch (single round-trip).
 * @param {Array<string|{sql: string, args?: Array}>} statements - SQL statements to execute.
 * @param {object} [options] - Connection options.
 * @param {string} [options.url] - Database URL (falls back to env).
 * @param {string} [options.authToken] - Auth token (falls back to env).
 * @returns {Promise<Array<{columns: string[], rows: object[], rowsAffected: number}>|null>} Array of results or null.
 */
export async function batch(statements, options = {}) {
  try {
    const baseUrl = (options.url || process.env.TURSO_DATABASE_URL || "").replace(/\/+$/, "");
    const authToken = options.authToken || process.env.TURSO_AUTH_TOKEN;

    if (!baseUrl) throw new Error("TURSO_DATABASE_URL is required");
    if (!authToken) throw new Error("TURSO_AUTH_TOKEN is required");

    const requests = statements.map((s) => {
      const sql = typeof s === "string" ? s : s.sql;
      const args = typeof s === "string" ? undefined : s.args;
      const stmt = { type: "execute", stmt: { sql } };
      if (args && args.length > 0) {
        stmt.stmt.args = args.map((a) => {
          if (a === null) return { type: "null", value: null };
          if (typeof a === "number") return Number.isInteger(a) ? { type: "integer", value: String(a) } : { type: "float", value: a };
          if (typeof a === "string") return { type: "text", value: a };
          return { type: "text", value: String(a) };
        });
      }
      return stmt;
    });

    requests.push({ type: "close" });

    const res = await fetch(`${baseUrl}/v2/pipeline`, {
      method: "POST",
      headers: buildHeaders(authToken),
      body: JSON.stringify({ requests }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`Turso batch error ${res.status}: ${err}`);
      return null;
    }

    const data = await res.json();

    return (data.results || [])
      .filter((r) => r.type === "ok" && r.response?.type === "execute")
      .map((r) => {
        const result = r.response.result;
        return {
          columns: (result.cols || []).map((c) => c.name),
          rows: parseRows(result),
          rowsAffected: result.affected_row_count || 0,
        };
      });
  } catch (err) {
    console.error("Turso batch failed:", err.message);
    return null;
  }
}
