# cloudflare-kv

Read, write, delete, and list keys in Cloudflare Workers KV via the REST API. Supports TTL, per-key metadata, and bulk operations up to 10,000 items per request. Zero dependencies — uses native `fetch` with `AbortSignal.timeout`.

## Setup

```bash
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_API_TOKEN=your-api-token
```

Create an API token at **My Profile → API Tokens** in the Cloudflare dashboard. The token needs the **Workers KV Storage: Edit** permission for write operations; **Read** is sufficient for read-only use.

```js
import {
  getValue,
  getValueWithMetadata,
  putValue,
  deleteValue,
  listKeys,
  listAllKeys,
  bulkWrite,
  bulkDelete,
} from "./index.js";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const NAMESPACE_ID = "your-kv-namespace-id"; // from Workers & Pages → KV
```

## Get a Value

Returns the raw string value for a key, or `null` if the key does not exist.

```js
const value = await getValue(ACCOUNT_ID, TOKEN, NAMESPACE_ID, "session:abc123");
if (value === null) {
  console.log("Key not found or expired");
} else {
  const session = JSON.parse(value);
}
```

## Get a Value with Metadata

Returns `{ value, metadata }` where `metadata` is the parsed object stored alongside the key, or `null` if no metadata was written. Returns `null` for the whole result if the key does not exist.

```js
const result = await getValueWithMetadata(ACCOUNT_ID, TOKEN, NAMESPACE_ID, "product:42");
if (result) {
  const product = JSON.parse(result.value);
  console.log(result.metadata); // e.g. { updatedAt: "2026-04-01T00:00:00Z" }
}
```

## Write a Value

Stores a string value. JSON-stringify objects before passing them. Returns `true` on success, `false` on error.

```js
// Plain write
await putValue(ACCOUNT_ID, TOKEN, NAMESPACE_ID, "config:flags", JSON.stringify({ darkMode: true }));

// With TTL (minimum 60 seconds)
await putValue(ACCOUNT_ID, TOKEN, NAMESPACE_ID, "session:abc123", JSON.stringify(sessionData), {
  ttl: 1800, // 30 minutes
});

// With absolute expiration timestamp
await putValue(ACCOUNT_ID, TOKEN, NAMESPACE_ID, "promo:summer", "active", {
  expiration: Math.floor(Date.now() / 1000) + 86400, // expires in 24 hours
});

// With metadata (stored in cf-kv-metadata header, readable without fetching the value)
await putValue(ACCOUNT_ID, TOKEN, NAMESPACE_ID, "product:42", JSON.stringify(product), {
  ttl: 3600,
  metadata: { updatedAt: new Date().toISOString(), version: 3 },
});
```

## Delete a Value

Removes a key. Returns `true` on success or if the key did not exist. Returns `false` only on a genuine API error.

```js
const ok = await deleteValue(ACCOUNT_ID, TOKEN, NAMESPACE_ID, "session:abc123");
```

## List Keys (One Page)

Returns up to 1,000 keys per call. Use the returned `cursor` to paginate. Each key object includes `name` and optionally `expiration` and `metadata`.

```js
// First page
const page = await listKeys(ACCOUNT_ID, TOKEN, NAMESPACE_ID, { limit: 100, prefix: "session:" });
// { keys: [{name, expiration?, metadata?}, ...], list_complete: false, cursor: "..." }

// Next page
const next = await listKeys(ACCOUNT_ID, TOKEN, NAMESPACE_ID, {
  limit: 100,
  prefix: "session:",
  cursor: page.cursor,
});
```

## List All Keys (Auto-Paginated)

Fetches every key in the namespace (or matching a prefix) across as many pages as needed. Returns a flat array of key objects, or `null` on error.

```js
// All keys
const allKeys = await listAllKeys(ACCOUNT_ID, TOKEN, NAMESPACE_ID);

// All keys under a prefix
const sessionKeys = await listAllKeys(ACCOUNT_ID, TOKEN, NAMESPACE_ID, "session:");
console.log(`${sessionKeys.length} active sessions`);
```

## Bulk Write

Writes up to 10,000 key-value pairs in a single API call. Arrays larger than 10,000 are split into sequential batches automatically. Returns `true` if all batches succeeded.

```js
const items = users.map((u) => ({
  key: `user:${u.id}`,
  value: JSON.stringify(u),
  ttl: 3600,
  metadata: { email: u.email },
}));

const ok = await bulkWrite(ACCOUNT_ID, TOKEN, NAMESPACE_ID, items);

// Base64-encoded binary is also supported
await bulkWrite(ACCOUNT_ID, TOKEN, NAMESPACE_ID, [
  { key: "asset:logo", value: base64EncodedPng, base64: true },
]);
```

## Bulk Delete

Deletes up to 10,000 keys in a single API call. Arrays larger than 10,000 are split into sequential batches automatically. Returns `true` if all batches succeeded.

```js
// Delete all keys for a set of user IDs
const keysToDelete = expiredUserIds.map((id) => `user:${id}`);
const ok = await bulkDelete(ACCOUNT_ID, TOKEN, NAMESPACE_ID, keysToDelete);
```

## Edge Cases Handled

- **404 is not an error** — `getValue`, `getValueWithMetadata`, and `deleteValue` treat HTTP 404 as a normal "key not found" result and return `null`/`true` respectively without logging
- **TTL minimum enforced** — `putValue` rejects a `ttl` below 60 seconds before hitting the API, matching Cloudflare's hard limit
- **TTL vs expiration are mutually exclusive** — if both are passed, `ttl` takes precedence; `expiration` is silently ignored
- **Metadata uses multipart** — `putValue` automatically switches to `multipart/form-data` when metadata is provided, as required by the Cloudflare API; plain `text/plain` is used otherwise
- **Bulk batching** — `bulkWrite` and `bulkDelete` automatically split arrays over 10,000 items into sequential batches so callers never need to pre-chunk large datasets
- **Empty bulk calls are no-ops** — passing an empty array to `bulkWrite` or `bulkDelete` returns `true` immediately without making a network request
- **Timeout on all requests** — 15s timeout via `AbortSignal.timeout` (30s for bulk operations); returns `null`/`false` instead of hanging
- **Non-JSON responses handled** — the API occasionally returns plain text or HTML on unexpected errors; those are caught and logged without throwing
- **Cloudflare error envelope unpacked** — all responses are unwrapped from the `{success, errors, result}` envelope; error codes and messages are logged in a readable format
