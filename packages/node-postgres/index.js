// PostgreSQL HTTP Client - Zero dependencies
// For Neon serverless, Supabase, or PostgREST.

/**
 * Create a PostgreSQL HTTP client.
 * @param {object} config
 * @param {string} config.connectionString - HTTP endpoint URL
 * @param {string} [config.apiKey] - API key
 */
export function createPgClient(config) {
  const { connectionString, apiKey } = config;
  const baseUrl = connectionString.replace(/\/$/, "");

  async function execQuery(sql, params = []) {
    const res = await fetch(baseUrl + "/sql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: "Bearer " + apiKey } : {}),
      },
      body: JSON.stringify({ query: sql, params }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error("PG " + res.status + ": " + (err.message || JSON.stringify(err)));
    }
    return res.json();
  }

  return {
    async query(sql, params = []) {
      const result = await execQuery(sql, params);
      return { rows: result.rows || result, rowCount: (result.rows || result).length };
    },
    async transaction(fn) {
      await execQuery("BEGIN");
      try {
        const result = await fn({ query: execQuery });
        await execQuery("COMMIT");
        return result;
      } catch (err) {
        await execQuery("ROLLBACK");
        throw err;
      }
    },
    async insert(table, data) {
      const cols = Object.keys(data);
      const vals = cols.map((_, i) => "$" + (i + 1));
      const sql = "INSERT INTO " + table + " (" + cols.join(", ") + ") VALUES (" + vals.join(", ") + ") RETURNING *";
      const result = await execQuery(sql, Object.values(data));
      return (result.rows || result)[0];
    },
    async find(table, where = {}, opts = {}) {
      const entries = Object.entries(where);
      const conditions = entries.map(([k], i) => k + " = $" + (i + 1));
      let sql = "SELECT * FROM " + table;
      if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
      if (opts.orderBy) sql += " ORDER BY " + opts.orderBy;
      if (opts.limit) sql += " LIMIT " + opts.limit;
      return (await execQuery(sql, entries.map(([, v]) => v))).rows || [];
    },
  };
}