/**
 * Beepack File Storage Module
 * Handles package file storage, retrieval, and archiving
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname, relative } from 'path';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable, Writable } from 'stream';
import * as tar from 'tar';

// Config
const STORAGE_DIR = process.env.STORAGE_DIR || './storage';
const MAX_PACKAGE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Initialize storage directory
 */
export function initStorage() {
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

/**
 * Compute SHA256 hash of a buffer
 */
export function computeSha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Generate storage path for a file
 */
export function getStoragePath(packageSlug, version, filePath) {
  // Sanitize inputs
  const safeSlug = packageSlug.replace(/[^a-z0-9-]/g, '');
  const safeVersion = version.replace(/[^a-z0-9.-]/g, '');
  const safePath = filePath.replace(/\.\./g, '').replace(/^\//, '');
  
  return join(STORAGE_DIR, safeSlug, safeVersion, safePath);
}

/**
 * Save a file to storage
 * @returns {Object} { storagePath, sha256, sizeBytes }
 */
export function saveFile(packageSlug, version, filePath, buffer) {
  const storagePath = getStoragePath(packageSlug, version, filePath);
  const dir = dirname(storagePath);
  
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  writeFileSync(storagePath, buffer);
  
  return {
    storagePath,
    sha256: computeSha256(buffer),
    sizeBytes: buffer.length,
  };
}

/**
 * Get a file from storage
 * @returns {Buffer|null}
 */
export function getFile(storagePath) {
  if (!existsSync(storagePath)) {
    return null;
  }
  return readFileSync(storagePath);
}

/**
 * Delete a file from storage
 */
export function deleteFile(storagePath) {
  if (existsSync(storagePath)) {
    unlinkSync(storagePath);
  }
}

/**
 * List all files for a package version
 * @returns {Array} [{ path, size, sha256 }]
 */
export function listPackageFiles(packageSlug, version) {
  const baseDir = join(STORAGE_DIR, packageSlug, version);
  
  if (!existsSync(baseDir)) {
    return [];
  }
  
  const files = [];
  
  function walkDir(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else {
        const relativePath = relative(baseDir, fullPath);
        const stats = statSync(fullPath);
        const content = readFileSync(fullPath);
        files.push({
          path: relativePath,
          size: stats.size,
          sha256: computeSha256(content),
          storagePath: fullPath,
        });
      }
    }
  }
  
  walkDir(baseDir);
  return files;
}

/**
 * Validate total package size
 * @throws {Error} if size exceeds limit
 */
export function validatePackageSize(files) {
  const totalSize = files.reduce((sum, f) => sum + (f.size || f.buffer?.length || 0), 0);
  
  if (totalSize > MAX_PACKAGE_SIZE) {
    throw new Error(`Package size (${Math.round(totalSize / 1024 / 1024)}MB) exceeds limit (${MAX_PACKAGE_SIZE / 1024 / 1024}MB)`);
  }
  
  return totalSize;
}

/**
 * Create a tar.gz archive of a package
 * @returns {Buffer} tar.gz content
 */
export async function createPackageArchive(packageSlug, version) {
  const baseDir = join(STORAGE_DIR, packageSlug, version);
  
  if (!existsSync(baseDir)) {
    throw new Error(`Package ${packageSlug}@${version} not found in storage`);
  }
  
  // Create tar archive in memory
  const chunks = [];
  
  await tar.create(
    {
      gzip: true,
      cwd: baseDir,
      portable: true,
    },
    ['.']
  ).pipe(new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    }
  }));
  
  // Small delay to ensure all chunks are collected
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return Buffer.concat(chunks);
}

/**
 * Extract a tar.gz archive to a directory
 */
export async function extractPackageArchive(archiveBuffer, targetDir) {
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }
  
  const readable = Readable.from(archiveBuffer);
  
  await pipeline(
    readable,
    createGunzip(),
    tar.extract({ cwd: targetDir })
  );
}

/**
 * Store package files from multipart upload
 * @param {Object} db - Database instance
 * @param {number} packageId - Package ID
 * @param {string} packageSlug - Package slug
 * @param {string} version - Version string
 * @param {Array} files - Array of { fieldname, originalname, buffer, mimetype, size }
 * @returns {Object} { filesStored, totalSize }
 */
export function storePackageFiles(db, packageId, packageSlug, version, files) {
  // Validate total size
  validatePackageSize(files);
  
  // Ensure table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS package_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id INTEGER REFERENCES packages(id),
      version TEXT NOT NULL,
      file_path TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      mime_type TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(package_id, version, file_path)
    )
  `);
  
  const insertFile = db.prepare(`
    INSERT INTO package_files (package_id, version, file_path, storage_path, size_bytes, sha256, mime_type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(package_id, version, file_path) DO UPDATE SET
      storage_path = excluded.storage_path,
      size_bytes = excluded.size_bytes,
      sha256 = excluded.sha256,
      mime_type = excluded.mime_type
  `);
  
  let totalSize = 0;
  let filesStored = 0;
  
  for (const file of files) {
    const filePath = file.originalname || file.fieldname;
    const buffer = file.buffer;
    
    // Save to disk
    const { storagePath, sha256, sizeBytes } = saveFile(packageSlug, version, filePath, buffer);
    
    // Save metadata to DB
    insertFile.run(packageId, version, filePath, storagePath, sizeBytes, sha256, file.mimetype || 'application/octet-stream');
    
    totalSize += sizeBytes;
    filesStored++;
  }
  
  return { filesStored, totalSize };
}

/**
 * Get package files metadata from DB
 */
export function getPackageFilesMetadata(db, packageId, version) {
  const files = db.prepare(`
    SELECT file_path, storage_path, size_bytes, sha256, mime_type, created_at
    FROM package_files
    WHERE package_id = ? AND version = ?
    ORDER BY file_path
  `).all(packageId, version);
  
  return files;
}

// Initialize storage on module load
initStorage();
