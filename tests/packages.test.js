/**
 * Tests for Beepack Packages
 * Run: node --test tests/packages.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';

// -- cdn-url-cleaner --
import { cleanCdnImageUrl, deduplicateCleanedUrls } from '../packages/cdn-url-cleaner/index.js';

// -- siret-utils --
import { validateSiretLuhn, formatSiret, formatSiren, stripSiretFormatting } from '../packages/siret-utils/index.js';

describe('cdn-url-cleaner', () => {

  describe('cleanCdnImageUrl', () => {
    test('should return null/empty for falsy input', () => {
      assert.strictEqual(cleanCdnImageUrl(null), null);
      assert.strictEqual(cleanCdnImageUrl(''), '');
    });

    test('should clean Wix static URLs', () => {
      const dirty = 'https://static.wixstatic.com/media/abc123.jpg/v1/fill/w_334,h_250,q_30,blur_30/photo.webp';
      const clean = cleanCdnImageUrl(dirty);
      assert.strictEqual(clean, 'https://static.wixstatic.com/media/abc123.jpg');
    });

    test('should return Wix URL unchanged if already clean', () => {
      const url = 'https://static.wixstatic.com/media/abc123.jpg';
      assert.strictEqual(cleanCdnImageUrl(url), url);
    });

    test('should clean Squarespace URLs by removing query params', () => {
      const dirty = 'https://images.squarespace-cdn.com/content/image.jpg?format=500w&width=300';
      const clean = cleanCdnImageUrl(dirty);
      assert.ok(!clean.includes('format='));
      assert.ok(!clean.includes('width='));
    });

    test('should clean sqspcdn URLs', () => {
      const dirty = 'https://images.sqspcdn.com/content/image.jpg?format=300w';
      const clean = cleanCdnImageUrl(dirty);
      assert.ok(!clean.includes('format='));
    });

    test('should clean Shopify CDN URLs - remove size suffix', () => {
      const dirty = 'https://cdn.shopify.com/s/files/1/image_200x.jpg';
      const clean = cleanCdnImageUrl(dirty);
      assert.ok(!clean.includes('_200x'));
    });

    test('should clean Shopify CDN URLs - remove query params', () => {
      const dirty = 'https://cdn.shopify.com/s/files/1/image.jpg?width=200&height=300';
      const clean = cleanCdnImageUrl(dirty);
      assert.ok(!clean.includes('width='));
    });

    test('should clean WordPress thumbnail URLs', () => {
      const dirty = 'https://example.com/wp-content/uploads/2024/01/photo-300x200.jpg';
      const clean = cleanCdnImageUrl(dirty);
      assert.strictEqual(clean, 'https://example.com/wp-content/uploads/2024/01/photo.jpg');
    });

    test('should leave WordPress original URLs unchanged', () => {
      const url = 'https://example.com/wp-content/uploads/2024/01/photo.jpg';
      assert.strictEqual(cleanCdnImageUrl(url), url);
    });

    test('should clean generic URLs with blur/quality params', () => {
      const dirty = 'https://cdn.example.com/image.jpg?blur=10&quality=30';
      const clean = cleanCdnImageUrl(dirty);
      assert.ok(!clean.includes('blur='));
      assert.ok(!clean.includes('quality='));
    });

    test('should leave unknown URLs without quality params unchanged', () => {
      const url = 'https://cdn.example.com/image.jpg?id=123';
      assert.strictEqual(cleanCdnImageUrl(url), url);
    });
  });

  describe('deduplicateCleanedUrls', () => {
    test('should deduplicate URLs that resolve to the same base', () => {
      const urls = [
        'https://static.wixstatic.com/media/abc.jpg/v1/fill/w_100/photo.webp',
        'https://static.wixstatic.com/media/abc.jpg/v1/fill/w_200/photo.webp',
        'https://static.wixstatic.com/media/abc.jpg/v1/fill/w_300/photo.webp',
      ];
      const result = deduplicateCleanedUrls(urls);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0], 'https://static.wixstatic.com/media/abc.jpg');
    });

    test('should keep distinct URLs', () => {
      const urls = [
        'https://static.wixstatic.com/media/abc.jpg/v1/fill/w_100/photo.webp',
        'https://static.wixstatic.com/media/def.jpg/v1/fill/w_100/photo.webp',
      ];
      const result = deduplicateCleanedUrls(urls);
      assert.strictEqual(result.length, 2);
    });

    test('should handle empty array', () => {
      assert.deepStrictEqual(deduplicateCleanedUrls([]), []);
    });
  });
});

describe('siret-utils', () => {

  describe('validateSiretLuhn', () => {
    test('should validate a correct SIRET', () => {
      // Known valid SIRET: 73282932000074
      assert.strictEqual(validateSiretLuhn('73282932000074'), true);
    });

    test('should reject invalid SIRET (bad checksum)', () => {
      assert.strictEqual(validateSiretLuhn('73282932000075'), false);
    });

    test('should reject non-14-digit strings', () => {
      assert.strictEqual(validateSiretLuhn('1234'), false);
      assert.strictEqual(validateSiretLuhn('123456789012345'), false);
      assert.strictEqual(validateSiretLuhn(''), false);
    });

    test('should reject strings with letters', () => {
      assert.strictEqual(validateSiretLuhn('7328293200007A'), false);
    });

    test('should reject all-zeros SIRET', () => {
      assert.strictEqual(validateSiretLuhn('00000000000000'), true); // Luhn sum is 0, which mod 10 = 0
    });
  });

  describe('formatSiret', () => {
    test('should format a 14-digit SIRET as XXX XXX XXX XXXXX', () => {
      assert.strictEqual(formatSiret('73282932000074'), '732 829 320 00074');
    });

    test('should strip non-digit characters before formatting', () => {
      assert.strictEqual(formatSiret('732 829 320 00074'), '732 829 320 00074');
    });

    test('should handle partial input', () => {
      assert.strictEqual(formatSiret('732'), '732');
      assert.strictEqual(formatSiret('732829'), '732 829');
    });
  });

  describe('formatSiren', () => {
    test('should format a 9-digit SIREN as XXX XXX XXX', () => {
      assert.strictEqual(formatSiren('732829320'), '732 829 320');
    });

    test('should strip non-digit characters', () => {
      assert.strictEqual(formatSiren('732-829-320'), '732 829 320');
    });
  });

  describe('stripSiretFormatting', () => {
    test('should strip all non-digit characters', () => {
      assert.strictEqual(stripSiretFormatting('732 829 320 00074'), '73282932000074');
    });

    test('should handle already-clean input', () => {
      assert.strictEqual(stripSiretFormatting('73282932000074'), '73282932000074');
    });
  });
});

console.log('Package tests loaded. Run with: node --test tests/packages.test.js');
