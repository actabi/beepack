/**
 * Scan store
 *
 * SQLite persistence for scan results. Shares the main beepack.db connection
 * so scans live next to packages/users for single-backup simplicity.
 *
 * Schema:
 *   scans(id TEXT PK, verdict TEXT, summary TEXT, source TEXT, findings_json TEXT,
 *         stats_json TEXT, ip_hash TEXT, created_at INTEGER)
 */

export function initScanStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      verdict TEXT NOT NULL,
      summary TEXT,
      source TEXT,
      findings_json TEXT NOT NULL,
      stats_json TEXT NOT NULL,
      ip_hash TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_scans_verdict ON scans(verdict);
  `);
}

export function saveScan(db, scan, { ipHash } = {}) {
  const stmt = db.prepare(`
    INSERT INTO scans (id, verdict, summary, source, findings_json, stats_json, ip_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    scan.scanId,
    scan.verdict,
    scan.summary,
    scan.source,
    JSON.stringify(scan.findings),
    JSON.stringify(scan.stats),
    ipHash || null,
    Date.parse(scan.scannedAt) || Date.now(),
  );
}

export function getScan(db, id) {
  const row = db.prepare('SELECT * FROM scans WHERE id = ?').get(id);
  if (!row) return null;
  return rowToScan(row);
}

export function listRecentScans(db, limit = 20) {
  const rows = db.prepare('SELECT * FROM scans ORDER BY created_at DESC LIMIT ?').all(limit);
  return rows.map(rowToScan);
}

export function scanStats(db, { sinceMs } = {}) {
  const since = sinceMs || (Date.now() - 24 * 60 * 60 * 1000);
  const total = db.prepare('SELECT COUNT(*) as n FROM scans WHERE created_at >= ?').get(since).n;
  const byVerdict = db.prepare('SELECT verdict, COUNT(*) as n FROM scans WHERE created_at >= ? GROUP BY verdict').all(since);
  const uniqueIps = db.prepare('SELECT COUNT(DISTINCT ip_hash) as n FROM scans WHERE created_at >= ? AND ip_hash IS NOT NULL').get(since).n;
  const topSources = db.prepare(`
    SELECT source, COUNT(*) as n FROM scans
    WHERE created_at >= ? AND source IS NOT NULL AND source != 'paste'
    GROUP BY source ORDER BY n DESC LIMIT 10
  `).all(since);
  return {
    total,
    uniqueIps,
    byVerdict: Object.fromEntries(byVerdict.map(r => [r.verdict, r.n])),
    topSources,
  };
}

function rowToScan(row) {
  return {
    scanId: row.id,
    verdict: row.verdict,
    summary: row.summary,
    source: row.source,
    findings: JSON.parse(row.findings_json || '[]'),
    stats: JSON.parse(row.stats_json || '{}'),
    scannedAt: new Date(row.created_at).toISOString(),
  };
}
