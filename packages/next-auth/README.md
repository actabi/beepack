# next-auth

> **NextAuth.js (Auth.js)** — [nextauthjs/next-auth](https://github.com/nextauthjs/next-auth) | 28,172 stars | ISC license

Authentication for the Web. Supports OAuth, Magic Links, Credentials, and session management for Next.js applications.

This beepack package provides integration helpers and references the official [nextauthjs/next-auth](https://github.com/nextauthjs/next-auth) repository.

## Installation

For production use, install the official package:

```bash
# See https://github.com/nextauthjs/next-auth for the latest install instructions
npm install next-auth
```

For beepack usage:

```bash
beepack install next-auth
```

## Environment Variables

```bash
NEXTAUTH_SECRET=your-value-here
NEXTAUTH_URL=your-value-here
```

## Capabilities

- **Oauth Providers**
- **Session Management**
- **Jwt Tokens**
- **Magic Links**
- **Credentials Auth**

## Usage

```js
import { getSetupGuide } from "./index.js";
console.log(getSetupGuide());
```

For full API documentation and examples, visit [nextauthjs/next-auth](https://github.com/nextauthjs/next-auth).

## Links

- **Repository:** [nextauthjs/next-auth](https://github.com/nextauthjs/next-auth)
- **License:** ISC
- **Stars:** 28,172
