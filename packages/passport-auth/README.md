# Passport.js Auth Strategies

Zero-dependency authentication: password hashing (PBKDF2), JWT (HS256), and OAuth2 flows.

## Prerequisites

- Node.js >= 18

## Environment Variables

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secret for signing JWTs |

## Usage

### Password Hashing

```js
import { hashPassword, verifyPassword } from './index.js';
const { hash, salt } = await hashPassword("mypassword");
const valid = await verifyPassword("mypassword", hash, salt);
```

### JWT Tokens

```js
import { createJwt, verifyJwt } from './index.js';
const token = await createJwt({ userId: "123" }, process.env.JWT_SECRET);
const payload = await verifyJwt(token, process.env.JWT_SECRET);
```

### OAuth2 Flow

```js
import { buildOAuth2Url, exchangeOAuth2Code } from './index.js';
const url = buildOAuth2Url({
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  clientId: "xxx", redirectUri: "http://localhost:3000/callback",
  scope: "openid email profile"
});
```

## Source

Inspired by [passport](https://github.com/jaredhanson/passport) (23k+ stars).