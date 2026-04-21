/**
 * Validator cache
 * Shared TTL cache for validators (npm, pypi, urls, typosquat).
 *
 * Two backends:
 *   - createMemoryCache(): per-process Map, used in tests and dev fallback.
 *   - createSqliteCache(db): backed by a `validator_cache` table on a better-sqlite3 handle.
 *
 * Both expose the same interface: { get, set, clear }.
 *   get(key)                → value (parsed JSON) or undefined if missing/expired
 *   set(key, value, ttlMs)  → stores JSON.stringify(value) with absolute expiry
 *   clear()                 → wipes all entries (test helper)
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export function createMemoryCache() {
  const store = new Map();
  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt < Date.now()) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value, ttlMs = DEFAULT_TTL_MS) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    clear() {
      store.clear();
    },
  };
}

export function createSqliteCache(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS validator_cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `);
  const getStmt = db.prepare('SELECT value, expires_at FROM validator_cache WHERE key = ?');
  const setStmt = db.prepare('INSERT OR REPLACE INTO validator_cache (key, value, expires_at) VALUES (?, ?, ?)');
  const clearStmt = db.prepare('DELETE FROM validator_cache');

  return {
    get(key) {
      const row = getStmt.get(key);
      if (!row) return undefined;
      if (row.expires_at < Date.now()) return undefined;
      try { return JSON.parse(row.value); } catch { return undefined; }
    },
    set(key, value, ttlMs = DEFAULT_TTL_MS) {
      setStmt.run(key, JSON.stringify(value), Date.now() + ttlMs);
    },
    clear() {
      clearStmt.run();
    },
  };
}

export const CACHE_TTL_24H = DEFAULT_TTL_MS;
