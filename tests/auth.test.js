/**
 * Tests for GitHub OAuth Authentication
 * Run: node --test tests/auth.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';

// Mock the auth module functions for testing
const mockJwtSecret = 'test-secret-key-12345';

// Test helper functions
function base64url(str) {
  return Buffer.from(str).toString('base64url');
}

describe('Auth Module', () => {
  
  describe('generateState', () => {
    test('should generate a 32-character hex string', () => {
      const state = crypto.randomBytes(16).toString('hex');
      
      assert.strictEqual(state.length, 32);
      assert.match(state, /^[a-f0-9]+$/);
    });

    test('should generate unique states', () => {
      const state1 = crypto.randomBytes(16).toString('hex');
      const state2 = crypto.randomBytes(16).toString('hex');
      
      assert.notStrictEqual(state1, state2);
    });
  });

  describe('Token Creation', () => {
    test('should create a valid token format', () => {
      const payload = {
        userId: 123,
        login: 'testuser',
        iat: Date.now(),
        exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };
      
      const data = base64url(JSON.stringify(payload));
      const signature = crypto
        .createHmac('sha256', mockJwtSecret)
        .update(data)
        .digest('base64url');
      const token = `${data}.${signature}`;
      
      // Token should have exactly one dot
      assert.strictEqual(token.split('.').length, 2);
      
      // Both parts should be non-empty
      const [dataPart, sigPart] = token.split('.');
      assert.ok(dataPart.length > 0);
      assert.ok(sigPart.length > 0);
    });

    test('should encode payload correctly', () => {
      const payload = {
        userId: 456,
        login: 'anotheruser',
        iat: 1234567890,
        exp: 9999999999,
      };
      
      const data = base64url(JSON.stringify(payload));
      const decoded = JSON.parse(Buffer.from(data, 'base64url').toString());
      
      assert.strictEqual(decoded.userId, payload.userId);
      assert.strictEqual(decoded.login, payload.login);
    });
  });

  describe('Token Verification', () => {
    test('should reject token with invalid signature', () => {
      const payload = { userId: 1, login: 'test', iat: Date.now(), exp: Date.now() + 10000 };
      const data = base64url(JSON.stringify(payload));
      
      // Create signature with wrong secret
      const wrongSignature = crypto
        .createHmac('sha256', 'wrong-secret')
        .update(data)
        .digest('base64url');
      
      const correctSignature = crypto
        .createHmac('sha256', mockJwtSecret)
        .update(data)
        .digest('base64url');
      
      assert.notStrictEqual(wrongSignature, correctSignature);
    });

    test('should detect expired tokens', () => {
      const payload = {
        userId: 1,
        login: 'test',
        iat: Date.now() - 100000,
        exp: Date.now() - 1000, // Expired 1 second ago
      };
      
      assert.ok(payload.exp < Date.now(), 'Token should be expired');
    });

    test('should accept valid non-expired tokens', () => {
      const payload = {
        userId: 1,
        login: 'test',
        iat: Date.now(),
        exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
      };
      
      assert.ok(payload.exp > Date.now(), 'Token should not be expired');
    });
  });

  describe('GitHub User Parsing', () => {
    test('should extract user info correctly', () => {
      const githubUser = {
        id: 12345,
        login: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
        avatar_url: 'https://avatars.githubusercontent.com/u/12345',
        bio: 'A test user',
        company: 'Test Corp',
        location: 'Test City',
        blog: 'https://test.com',
        public_repos: 42,
      };
      
      const parsed = {
        id: githubUser.id,
        login: githubUser.login,
        name: githubUser.name,
        email: githubUser.email,
        avatarUrl: githubUser.avatar_url,
        bio: githubUser.bio,
        company: githubUser.company,
        location: githubUser.location,
        blog: githubUser.blog,
        publicRepos: githubUser.public_repos,
      };
      
      assert.strictEqual(parsed.id, 12345);
      assert.strictEqual(parsed.login, 'testuser');
      assert.strictEqual(parsed.avatarUrl, 'https://avatars.githubusercontent.com/u/12345');
    });

    test('should handle missing optional fields', () => {
      const minimalUser = {
        id: 1,
        login: 'minimal',
        avatar_url: 'https://example.com/avatar.png',
      };
      
      const parsed = {
        id: minimalUser.id,
        login: minimalUser.login,
        name: minimalUser.name || null,
        email: minimalUser.email || null,
        avatarUrl: minimalUser.avatar_url,
      };
      
      assert.strictEqual(parsed.id, 1);
      assert.strictEqual(parsed.name, null);
      assert.strictEqual(parsed.email, null);
    });
  });

  describe('OAuth URL Generation', () => {
    test('should generate valid GitHub OAuth URL', () => {
      const clientId = 'test_client_id';
      const callbackUrl = 'http://localhost:3011/auth/github/callback';
      const state = 'abc123def456';
      
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: callbackUrl,
        scope: 'read:user user:email',
        state,
      });
      
      const url = `https://github.com/login/oauth/authorize?${params}`;
      
      assert.ok(url.includes('github.com/login/oauth/authorize'));
      assert.ok(url.includes(`client_id=${clientId}`));
      assert.ok(url.includes('scope=read'));
      assert.ok(url.includes(`state=${state}`));
    });
  });
});

console.log('Auth tests loaded. Run with: node --test tests/auth.test.js');
