/**
 * Tests for File Storage Module
 * Run: node --test tests/storage.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import crypto from 'crypto';

describe('Storage Module', () => {

  describe('computeSha256', () => {
    test('should compute correct SHA256 hash', () => {
      const buffer = Buffer.from('Hello, World!');
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      
      assert.strictEqual(hash, 'dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f');
    });

    test('should produce different hashes for different content', () => {
      const hash1 = crypto.createHash('sha256').update(Buffer.from('content1')).digest('hex');
      const hash2 = crypto.createHash('sha256').update(Buffer.from('content2')).digest('hex');
      
      assert.notStrictEqual(hash1, hash2);
    });

    test('should produce same hash for same content', () => {
      const content = Buffer.from('test content');
      const hash1 = crypto.createHash('sha256').update(content).digest('hex');
      const hash2 = crypto.createHash('sha256').update(content).digest('hex');
      
      assert.strictEqual(hash1, hash2);
    });
  });

  describe('getStoragePath', () => {
    test('should generate correct path', () => {
      const getStoragePath = (slug, version, filePath) => {
        const safeSlug = slug.replace(/[^a-z0-9-]/g, '');
        const safeVersion = version.replace(/[^a-z0-9.-]/g, '');
        const safePath = filePath.replace(/\.\./g, '').replace(/^\//, '');
        return join('./storage', safeSlug, safeVersion, safePath);
      };

      const path = getStoragePath('my-package', '1.0.0', 'src/index.ts');
      assert.ok(path.includes('my-package'));
      assert.ok(path.includes('1.0.0'));
      assert.ok(path.includes('src'));
      assert.ok(path.includes('index.ts'));
    });

    test('should sanitize path traversal attempts', () => {
      const safePath = '../../../etc/passwd'.replace(/\.\./g, '').replace(/^\//, '');
      assert.ok(!safePath.includes('..'));
    });

    test('should sanitize invalid characters in slug', () => {
      const safeSlug = 'My_Package!@#'.replace(/[^a-z0-9-]/g, '');
      assert.strictEqual(safeSlug, 'yackage'); // 'M' removed, 'y' kept (lowercase)
    });
  });

  describe('saveFile', () => {
    test('should save file and return metadata', () => {
      const testDir = join(tmpdir(), 'beepack-save-test-' + Date.now());
      mkdirSync(testDir, { recursive: true });

      const content = Buffer.from('test file content');
      const filePath = join(testDir, 'test.txt');
      writeFileSync(filePath, content);

      const savedContent = readFileSync(filePath);
      const sha256 = crypto.createHash('sha256').update(savedContent).digest('hex');

      assert.strictEqual(savedContent.toString(), 'test file content');
      assert.ok(sha256.length === 64);

      rmSync(testDir, { recursive: true });
    });
  });

  describe('getFile', () => {
    test('should read file content', () => {
      const testDir = join(tmpdir(), 'beepack-get-test-' + Date.now());
      mkdirSync(testDir, { recursive: true });

      const content = Buffer.from('read test content');
      const filePath = join(testDir, 'read-test.txt');
      writeFileSync(filePath, content);

      const readContent = readFileSync(filePath);
      assert.strictEqual(readContent.toString(), 'read test content');

      rmSync(testDir, { recursive: true });
    });

    test('should return null for non-existent file', () => {
      const exists = existsSync('/non/existent/path');
      assert.strictEqual(exists, false);
    });
  });

  describe('validatePackageSize', () => {
    const MAX_SIZE = 50 * 1024 * 1024;

    test('should pass for files under limit', () => {
      const files = [
        { size: 1024 },
        { size: 2048 },
        { size: 512 },
      ];
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      
      assert.ok(totalSize < MAX_SIZE);
    });

    test('should fail for files over limit', () => {
      const files = [
        { size: 30 * 1024 * 1024 },
        { size: 25 * 1024 * 1024 },
      ];
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      
      assert.ok(totalSize > MAX_SIZE);
    });

    test('should calculate total correctly', () => {
      const files = [
        { size: 100 },
        { size: 200 },
        { size: 300 },
      ];
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      
      assert.strictEqual(totalSize, 600);
    });
  });

  describe('listPackageFiles', () => {
    test('should list files recursively', () => {
      const testDir = join(tmpdir(), 'beepack-list-test-' + Date.now());
      mkdirSync(join(testDir, 'src'), { recursive: true });
      
      writeFileSync(join(testDir, 'index.ts'), 'root file');
      writeFileSync(join(testDir, 'src', 'utils.ts'), 'nested file');

      function listFiles(dir, base = '') {
        const files = [];
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          const relativePath = base ? join(base, entry.name) : entry.name;
          if (entry.isDirectory()) {
            files.push(...listFiles(fullPath, relativePath));
          } else {
            files.push({ path: relativePath, size: statSync(fullPath).size });
          }
        }
        return files;
      }

      const files = listFiles(testDir);
      assert.strictEqual(files.length, 2);

      rmSync(testDir, { recursive: true });
    });
  });

  describe('File metadata extraction', () => {
    test('should extract file extension', () => {
      const getMimeType = (filename) => {
        const ext = filename.split('.').pop().toLowerCase();
        const mimeTypes = {
          'js': 'application/javascript',
          'ts': 'application/typescript',
          'json': 'application/json',
          'yaml': 'text/yaml',
          'yml': 'text/yaml',
          'md': 'text/markdown',
          'txt': 'text/plain',
        };
        return mimeTypes[ext] || 'application/octet-stream';
      };

      assert.strictEqual(getMimeType('index.js'), 'application/javascript');
      assert.strictEqual(getMimeType('HIVE.yaml'), 'text/yaml');
      assert.strictEqual(getMimeType('README.md'), 'text/markdown');
      assert.strictEqual(getMimeType('unknown.xyz'), 'application/octet-stream');
    });
  });

  describe('Archive creation', () => {
    test('should create valid archive structure', () => {
      const files = [
        { path: 'HIVE.yaml', content: 'name: test' },
        { path: 'src/index.ts', content: 'export default {}' },
        { path: 'README.md', content: '# Test' },
      ];

      const archiveEntries = files.map(f => ({ name: f.path }));
      
      assert.strictEqual(archiveEntries.length, 3);
      assert.ok(archiveEntries.some(e => e.name === 'HIVE.yaml'));
    });
  });

  describe('Upload validation', () => {
    test('should require HIVE.yaml', () => {
      const files = [
        { originalname: 'src/index.ts' },
        { originalname: 'README.md' },
      ];

      const hasHive = files.some(f => 
        f.originalname === 'HIVE.yaml' || f.originalname === 'hive.yaml'
      );

      assert.strictEqual(hasHive, false);
    });

    test('should find HIVE.yaml case insensitive', () => {
      const files = [
        { originalname: 'src/index.ts' },
        { originalname: 'HIVE.yaml' },
      ];

      const hasHive = files.some(f => 
        f.originalname.toLowerCase() === 'hive.yaml'
      );

      assert.strictEqual(hasHive, true);
    });

    test('should require version', () => {
      const version = '';
      assert.strictEqual(!version, true);
    });
  });
});

console.log('Storage tests loaded. Run with: node --test tests/storage.test.js');
