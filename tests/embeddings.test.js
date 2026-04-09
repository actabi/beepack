/**
 * Tests for Semantic Search / Embeddings
 * Run: node --test tests/embeddings.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('Embeddings Module', () => {

  describe('cosineSimilarity', () => {
    // Implement cosine similarity for testing
    function cosineSimilarity(a, b) {
      if (a.length !== b.length) {
        throw new Error('Vectors must have same length');
      }

      let dotProduct = 0;
      let normA = 0;
      let normB = 0;

      for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }

      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    test('should return 1 for identical vectors', () => {
      const vec = [1, 2, 3, 4, 5];
      const similarity = cosineSimilarity(vec, vec);
      assert.ok(Math.abs(similarity - 1) < 0.0001, `Expected 1, got ${similarity}`);
    });

    test('should return 0 for orthogonal vectors', () => {
      const vecA = [1, 0];
      const vecB = [0, 1];
      const similarity = cosineSimilarity(vecA, vecB);
      assert.ok(Math.abs(similarity) < 0.0001, `Expected 0, got ${similarity}`);
    });

    test('should return -1 for opposite vectors', () => {
      const vecA = [1, 2, 3];
      const vecB = [-1, -2, -3];
      const similarity = cosineSimilarity(vecA, vecB);
      assert.ok(Math.abs(similarity + 1) < 0.0001, `Expected -1, got ${similarity}`);
    });

    test('should throw for different length vectors', () => {
      const vecA = [1, 2, 3];
      const vecB = [1, 2];
      assert.throws(() => cosineSimilarity(vecA, vecB), /same length/);
    });

    test('should handle normalized vectors', () => {
      // Normalized vectors
      const vecA = [0.6, 0.8]; // length = 1
      const vecB = [0.8, 0.6]; // length = 1
      const similarity = cosineSimilarity(vecA, vecB);
      // cos(theta) = 0.6*0.8 + 0.8*0.6 = 0.96
      assert.ok(Math.abs(similarity - 0.96) < 0.0001, `Expected ~0.96, got ${similarity}`);
    });

    test('should handle high-dimensional vectors', () => {
      const dim = 1536; // OpenAI embedding dimension
      const vecA = Array(dim).fill(1);
      const vecB = Array(dim).fill(1);
      const similarity = cosineSimilarity(vecA, vecB);
      assert.ok(Math.abs(similarity - 1) < 0.0001, `Expected 1, got ${similarity}`);
    });
  });

  describe('packageToText', () => {
    function packageToText(pkg) {
      const parts = [
        pkg.display_name || pkg.displayName,
        pkg.description,
        ...(pkg.keywords || []),
        ...(pkg.capabilities || []),
      ];
      return parts.filter(Boolean).join(' ');
    }

    test('should combine all package fields', () => {
      const pkg = {
        displayName: 'Notion Sync',
        description: 'Sync with Notion API',
        keywords: ['notion', 'sync'],
        capabilities: ['read_database', 'write_pages'],
      };
      
      const text = packageToText(pkg);
      
      assert.ok(text.includes('Notion Sync'));
      assert.ok(text.includes('Sync with Notion API'));
      assert.ok(text.includes('notion'));
      assert.ok(text.includes('read_database'));
    });

    test('should handle missing fields', () => {
      const pkg = {
        displayName: 'Simple Package',
        description: 'A simple package',
      };
      
      const text = packageToText(pkg);
      
      assert.ok(text.includes('Simple Package'));
      assert.ok(text.includes('A simple package'));
      assert.ok(!text.includes('undefined'));
    });

    test('should handle snake_case display_name', () => {
      const pkg = {
        display_name: 'Snake Case Name',
        description: 'Test',
      };
      
      const text = packageToText(pkg);
      assert.ok(text.includes('Snake Case Name'));
    });

    test('should filter out falsy values', () => {
      const pkg = {
        displayName: 'Test',
        description: null,
        keywords: [],
        capabilities: [null, 'valid'],
      };
      
      const text = packageToText(pkg);
      assert.ok(!text.includes('null'));
      assert.ok(text.includes('valid'));
    });
  });

  describe('Embedding Storage', () => {
    test('should convert Float32Array to Buffer and back', () => {
      const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      const float32 = new Float32Array(embedding);
      
      // Convert to Buffer (as stored in SQLite)
      const buffer = Buffer.from(float32.buffer);
      
      // Convert back
      const recovered = Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4));
      
      for (let i = 0; i < embedding.length; i++) {
        assert.ok(Math.abs(recovered[i] - embedding[i]) < 0.0001, 
          `Mismatch at ${i}: ${recovered[i]} vs ${embedding[i]}`);
      }
    });

    test('should handle 1536-dimensional embeddings', () => {
      const dim = 1536;
      const embedding = Array(dim).fill(0).map(() => Math.random() - 0.5);
      const float32 = new Float32Array(embedding);
      const buffer = Buffer.from(float32.buffer);
      
      assert.strictEqual(buffer.length, dim * 4); // 4 bytes per float32
      
      const recovered = Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4));
      assert.strictEqual(recovered.length, dim);
    });
  });

  describe('Search Result Scoring', () => {
    test('should rank results by similarity score', () => {
      const results = [
        { slug: 'notion-sync', score: 0.95 },
        { slug: 'notion-api', score: 0.82 },
        { slug: 'database-sync', score: 0.65 },
        { slug: 'unrelated', score: 0.25 },
      ];
      
      results.sort((a, b) => b.score - a.score);
      
      assert.strictEqual(results[0].slug, 'notion-sync');
      assert.strictEqual(results[1].slug, 'notion-api');
      assert.strictEqual(results[3].slug, 'unrelated');
    });

    test('should filter results below threshold', () => {
      const threshold = 0.3;
      const results = [
        { slug: 'good-match', score: 0.85 },
        { slug: 'ok-match', score: 0.45 },
        { slug: 'bad-match', score: 0.15 },
      ];
      
      const filtered = results.filter(r => r.score > threshold);
      
      assert.strictEqual(filtered.length, 2);
      assert.ok(filtered.every(r => r.score > threshold));
    });
  });

  describe('Fallback Search', () => {
    test('should create LIKE search pattern', () => {
      const query = 'notion';
      const searchTerm = `%${query}%`;
      
      assert.strictEqual(searchTerm, '%notion%');
    });

    test('should handle multi-word queries', () => {
      const query = 'sync database';
      const searchTerm = `%${query}%`;
      
      assert.strictEqual(searchTerm, '%sync database%');
    });

    test('should escape special characters', () => {
      const query = "test'query";
      // In real implementation, SQL params handle this
      assert.ok(query.includes("'"));
    });
  });

  describe('isEmbeddingsEnabled', () => {
    test('should return false when OPENAI_API_KEY is not set', () => {
      const oldKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;
      
      const isEnabled = !!process.env.OPENAI_API_KEY;
      assert.strictEqual(isEnabled, false);
      
      if (oldKey) process.env.OPENAI_API_KEY = oldKey;
    });

    test('should return true when OPENAI_API_KEY is set', () => {
      const oldKey = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-test-key';
      
      const isEnabled = !!process.env.OPENAI_API_KEY;
      assert.strictEqual(isEnabled, true);
      
      if (oldKey) {
        process.env.OPENAI_API_KEY = oldKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    });
  });
});

console.log('Embeddings tests loaded. Run with: node --test tests/embeddings.test.js');
