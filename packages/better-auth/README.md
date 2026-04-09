# better-auth

> **Better Auth** — [better-auth/better-auth](https://github.com/better-auth/better-auth) | 27,698 stars | MIT license

The most comprehensive authentication framework for TypeScript. Framework-agnostic, supports email/password, OAuth, 2FA, organizations.

This beepack package provides integration helpers and references the official [better-auth/better-auth](https://github.com/better-auth/better-auth) repository.

## Installation

For production use, install the official package:

```bash
# See https://github.com/better-auth/better-auth for the latest install instructions
npm install better-auth
```

For beepack usage:

```bash
beepack install better-auth
```

## Environment Variables

```bash
BETTER_AUTH_SECRET=your-value-here
BETTER_AUTH_URL=your-value-here
```

## Capabilities

- **Email Password Auth**
- **Oauth Providers**
- **Two Factor Auth**
- **Organization Management**
- **Session Management**

## Usage

```js
import { getSetupGuide } from "./index.js";
console.log(getSetupGuide());
```

For full API documentation and examples, visit [better-auth/better-auth](https://github.com/better-auth/better-auth).

## Links

- **Repository:** [better-auth/better-auth](https://github.com/better-auth/better-auth)
- **License:** MIT
- **Stars:** 27,698
