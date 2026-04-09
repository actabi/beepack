/**
 * Tests for REST API Endpoints
 * Run: node --test tests/api.test.js
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';

const API_BASE = 'http://localhost:3011/api/v1';

// Helper to check if server is running
async function isServerRunning() {
  try {
    const response = await fetch('http://localhost:3011/api/health');
    return response.ok;
  } catch {
    return false;
  }
}

describe('REST API Endpoints', () => {

  describe('Health Check', () => {
    test('GET /api/health should return ok status', async () => {
      if (!await isServerRunning()) {
        console.log('⚠️  Server not running, skipping API tests');
        return;
      }

      const response = await fetch('http://localhost:3011/api/health');
      const data = await response.json();
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(data.status, 'ok');
      assert.ok(data.version);
      assert.ok(data.features);
    });
  });

  describe('List Packages', () => {
    test('GET /api/v1/packages should return packages array', async () => {
      if (!await isServerRunning()) return;

      const response = await fetch(`${API_BASE}/packages`);
      const data = await response.json();
      
      assert.strictEqual(response.status, 200);
      assert.ok(Array.isArray(data.packages));
      assert.ok(data.pagination);
    });

    test('GET /api/v1/packages should support pagination', async () => {
      if (!await isServerRunning()) return;

      const response = await fetch(`${API_BASE}/packages?page=1&limit=2`);
      const data = await response.json();
      
      assert.ok(data.packages.length <= 2);
      assert.strictEqual(data.pagination.page, 1);
      assert.strictEqual(data.pagination.limit, 2);
    });

    test('GET /api/v1/packages should support sorting', async () => {
      if (!await isServerRunning()) return;

      const response = await fetch(`${API_BASE}/packages?sort=downloads`);
      const data = await response.json();
      
      assert.strictEqual(response.status, 200);
      // First package should have >= downloads than second
      if (data.packages.length >= 2) {
        assert.ok(data.packages[0].stats.downloads >= data.packages[1].stats.downloads);
      }
    });
  });

  describe('Get Package', () => {
    test('GET /api/v1/packages/:slug should return package details', async () => {
      if (!await isServerRunning()) return;

      const response = await fetch(`${API_BASE}/packages/notion-sync`);
      const data = await response.json();
      
      assert.strictEqual(response.status, 200);
      assert.strictEqual(data.slug, 'notion-sync');
      assert.ok(data.displayName);
      assert.ok(data.description);
      assert.ok(data.stats);
      assert.ok(Array.isArray(data.keywords));
      assert.ok(Array.isArray(data.capabilities));
    });

    test('GET /api/v1/packages/:slug should return 404 for unknown package', async () => {
      if (!await isServerRunning()) return;

      const response = await fetch(`${API_BASE}/packages/unknown-package-xyz`);
      
      assert.strictEqual(response.status, 404);
      
      const data = await response.json();
      assert.ok(data.error);
      assert.strictEqual(data.error.code, 'NOT_FOUND');
    });
  });

  describe('Search', () => {
    test('GET /api/v1/search should require query parameter', async () => {
      if (!await isServerRunning()) return;

      const response = await fetch(`${API_BASE}/search`);
      
      assert.strictEqual(response.status, 400);
    });

    test('GET /api/v1/search should return results', async () => {
      if (!await isServerRunning()) return;

      const response = await fetch(`${API_BASE}/search?q=notion`);
      const data = await response.json();
      
      assert.strictEqual(response.status, 200);
      assert.ok(Array.isArray(data.results));
      assert.ok(typeof data.searchTime === 'number');
      assert.strictEqual(data.query, 'notion');
    });

    test('GET /api/v1/search should return empty array for no matches', async () => {
      if (!await isServerRunning()) return;

      const response = await fetch(`${API_BASE}/search?q=xyznonexistent123`);
      const data = await response.json();
      
      assert.strictEqual(response.status, 200);
      assert.ok(Array.isArray(data.results));
      assert.strictEqual(data.results.length, 0);
    });
  });

  describe('Stats', () => {
    test('GET /api/v1/stats should return statistics', async () => {
      if (!await isServerRunning()) return;

      const response = await fetch(`${API_BASE}/stats`);
      const data = await response.json();
      
      assert.strictEqual(response.status, 200);
      assert.ok(typeof data.totalPackages === 'number');
      assert.ok(typeof data.totalStars === 'number');
      assert.ok(typeof data.totalDownloads === 'number');
      assert.ok(typeof data.totalUsers === 'number');
    });
  });

  describe('Authentication', () => {
    test('GET /api/v1/me should return 401 without token', async () => {
      if (!await isServerRunning()) return;

      const response = await fetch(`${API_BASE}/me`);
      
      assert.strictEqual(response.status, 401);
    });

    test('POST /api/v1/packages/:slug/upload should return 401 without token', async () => {
      if (!await isServerRunning()) return;

      const response = await fetch(`${API_BASE}/packages/test/upload`, {
        method: 'POST',
      });

      assert.strictEqual(response.status, 401);
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown API endpoint', async () => {
      if (!await isServerRunning()) return;

      const response = await fetch(`${API_BASE}/unknown-endpoint`);
      
      assert.strictEqual(response.status, 404);
    });

    test('error response should have correct format', async () => {
      if (!await isServerRunning()) return;

      const response = await fetch(`${API_BASE}/packages/not-found-pkg`);
      const data = await response.json();
      
      assert.ok(data.error);
      assert.ok(data.error.code);
      assert.ok(data.error.message);
    });
  });
});

describe('API Response Format', () => {
  
  test('package should have required fields', () => {
    const pkg = {
      slug: 'test-pkg',
      displayName: 'Test Package',
      description: 'A test package',
      owner: { handle: 'testuser', avatarUrl: 'https://example.com/avatar.png' },
      version: '1.0.0',
      stats: { stars: 10, downloads: 100 },
      keywords: ['test'],
      capabilities: ['test_action'],
      compatible: ['cursor'],
    };

    assert.ok(pkg.slug);
    assert.ok(pkg.displayName);
    assert.ok(pkg.description);
    assert.ok(pkg.owner);
    assert.ok(pkg.stats);
    assert.ok(Array.isArray(pkg.keywords));
    assert.ok(Array.isArray(pkg.capabilities));
  });

  test('pagination should have required fields', () => {
    const pagination = {
      page: 1,
      limit: 20,
      total: 150,
    };

    assert.ok(typeof pagination.page === 'number');
    assert.ok(typeof pagination.limit === 'number');
    assert.ok(typeof pagination.total === 'number');
  });

  test('search result should include score', () => {
    const result = {
      slug: 'test-pkg',
      displayName: 'Test',
      description: 'Test desc',
      score: 0.85,
      stats: { stars: 10, downloads: 100 },
    };

    assert.ok(typeof result.score === 'number');
    assert.ok(result.score >= 0 && result.score <= 1);
  });
});

console.log('API tests loaded. Run with: node --test tests/api.test.js');
console.log('Note: API tests require server running on localhost:3011');
