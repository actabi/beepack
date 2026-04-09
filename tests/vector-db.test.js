/**
 * Tests for Vector Database Client
 * Run: node --test tests/vector-db.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { createFilter } from '../vector-db.js';

describe('Vector DB', () => {

  describe('createFilter', () => {
    test('should return null for empty conditions', () => {
      const filter = createFilter({});
      assert.strictEqual(filter, null);
    });

    test('should create filter with compatible condition', () => {
      const filter = createFilter({ compatible: 'node' });

      assert.ok(filter);
      assert.ok(filter.must);
      assert.strictEqual(filter.must.length, 1);
      assert.strictEqual(filter.must[0].key, 'compatible');
      assert.deepStrictEqual(filter.must[0].match.any, ['node']);
    });

    test('should handle compatible as array', () => {
      const filter = createFilter({ compatible: ['node', 'deno'] });

      assert.ok(filter);
      assert.deepStrictEqual(filter.must[0].match.any, ['node', 'deno']);
    });

    test('should create filter with keywords condition', () => {
      const filter = createFilter({ keywords: ['api', 'rest'] });

      assert.ok(filter);
      assert.strictEqual(filter.must[0].key, 'keywords');
      assert.deepStrictEqual(filter.must[0].match.any, ['api', 'rest']);
    });

    test('should handle keywords as string', () => {
      const filter = createFilter({ keywords: 'api' });

      assert.ok(filter);
      assert.deepStrictEqual(filter.must[0].match.any, ['api']);
    });

    test('should create filter with owner condition', () => {
      const filter = createFilter({ owner: 'actabi' });

      assert.ok(filter);
      assert.strictEqual(filter.must[0].key, 'owner');
      assert.strictEqual(filter.must[0].match.value, 'actabi');
    });

    test('should combine multiple conditions', () => {
      const filter = createFilter({
        compatible: 'node',
        keywords: ['api'],
        owner: 'actabi',
      });

      assert.ok(filter);
      assert.strictEqual(filter.must.length, 3);

      const keys = filter.must.map(m => m.key);
      assert.ok(keys.includes('compatible'));
      assert.ok(keys.includes('keywords'));
      assert.ok(keys.includes('owner'));
    });
  });
});

console.log('Vector DB tests loaded. Run with: node --test tests/vector-db.test.js');
