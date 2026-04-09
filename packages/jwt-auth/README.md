# jwt-auth

HMAC-SHA256 access + refresh token pair generation and verification. Includes refresh token rotation with family tracking (replay attack prevention), a blacklist check hook, and HTTP-only cookie helpers. Zero dependencies — uses the native Web Crypto API.

Algorithm is pinned to HS256. Tokens without an expiry claim are rejected. Missing or mismatched audience claims are rejected when an audience is expected.

## Setup

```bash
JWT_SECRET=your-long-random-secret-at-least-32-chars
```

Generate a strong secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Usage

### Generate a token pair

```js
import { generateTokenPair } from "./index.js";

const pair = await generateTokenPair(
  { sub: "user_123", aud: "my-app", role: "admin" },
  process.env.JWT_SECRET,
  { accessTtlSec: 900, refreshTtlSec: 7 * 24 * 3600 }
);

// pair: { accessToken, refreshToken, accessExpiresAt, refreshExpiresAt, family }
```

### Verify an access token

```js
import { verifyAccessToken } from "./index.js";

const payload = await verifyAccessToken(token, process.env.JWT_SECRET, {
  audience: "my-app",
});

if (!payload) {
  // null = expired, wrong algorithm, bad signature, missing exp, wrong aud
  return res.status(401).json({ error: "Unauthorized" });
}

console.log(payload.sub, payload.role);
```

### Rotate a refresh token

Fetch the stored record for the incoming refresh token from your DB, then call `rotateRefreshToken`. The old token is immediately invalidated — store the new one.

```js
import { rotateRefreshToken } from "./index.js";

// stored comes from your DB: { token, family, expiresAt }
const result = await rotateRefreshToken({
  refreshToken: req.body.refreshToken,
  stored: await db.getRefreshToken(req.body.refreshToken),
  claims: { sub: user.id, aud: "my-app" },
  secret: process.env.JWT_SECRET,
});

if (!result) {
  return res.status(401).json({ error: "Invalid refresh token" });
}

if (result.reason === "replay") {
  // A previously-used token was presented — potential token theft.
  // Invalidate the entire family immediately.
  await db.revokeFamily(stored.family);
  return res.status(401).json({ error: "Session invalidated" });
}

const { pair, invalidate } = result;
await db.deleteRefreshToken(invalidate);
await db.saveRefreshToken({
  token: pair.refreshToken,
  family: pair.family,
  expiresAt: pair.refreshExpiresAt,
  userId: user.id,
});
```

### Blacklist check hook

Pass an `isBlacklisted` async function to block revoked tokens or families:

```js
const result = await rotateRefreshToken({
  refreshToken,
  stored,
  claims,
  secret: process.env.JWT_SECRET,
  isBlacklisted: async (token, family) => {
    return redis.sismember("revoked_families", family);
  },
});
```

### HTTP-only cookie helpers

```js
import { buildCookies, clearCookies, parseCookies } from "./index.js";

// After login — set both cookies
const { accessCookie, refreshCookie } = buildCookies(pair, {
  secure: process.env.NODE_ENV === "production",
  sameSite: "Strict",
});
res.setHeader("Set-Cookie", [accessCookie, refreshCookie]);

// On a request — read tokens from Cookie header
const { accessToken, refreshToken } = parseCookies(req.headers.cookie);

// On logout — clear both cookies
const { accessCookie, refreshCookie } = clearCookies();
res.setHeader("Set-Cookie", [accessCookie, refreshCookie]);
```

### Express middleware example

```js
import { verifyAccessToken, parseCookies } from "./index.js";

function requireAuth(audience) {
  return async (req, res, next) => {
    const { accessToken } = parseCookies(req.headers.cookie);
    const payload = await verifyAccessToken(accessToken, process.env.JWT_SECRET, { audience });
    if (!payload) return res.status(401).json({ error: "Unauthorized" });
    req.user = payload;
    next();
  };
}

app.get("/dashboard", requireAuth("my-app"), (req, res) => {
  res.json({ user: req.user });
});
```

## Edge cases enforced

| Condition | Behaviour |
|---|---|
| Token missing `exp` claim | Rejected — `verifyAccessToken` returns null |
| Wrong algorithm (e.g. `none`, RS256) | Rejected — algorithm pinned to HS256 |
| Missing or wrong `aud` claim | Rejected when `audience` option is provided |
| Expired access token | Rejected — returns null |
| Replay attack on refresh token | Returns `{ pair: null, reason: "replay" }` — caller must revoke the whole family |
| Blacklisted token or family | Returns null before issuing a new pair |
| Missing `JWT_SECRET` | Returns null with `console.error` log |
| `sub` missing from claims | Returns null with `console.error` log |

## Security defaults

- Algorithm pinned to **HS256** — `alg: "none"` and asymmetric algorithms are blocked
- Access tokens expire in **15 minutes** by default
- Refresh tokens expire in **7 days** by default
- Cookies set with `HttpOnly`, `Secure`, `SameSite=Strict` by default
- All errors return null — no stack traces leaked to callers
- Signature verification uses `crypto.subtle.verify` (constant-time)
