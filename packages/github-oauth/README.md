# github-oauth

Complete GitHub OAuth 2.0 flow: authorization URL generation, code exchange, token refresh, user profile, and email fetching. Includes an Express callback handler. Zero dependencies.

This handles all the OAuth edge cases: CSRF state parameter, token refresh for GitHub Apps, primary email extraction, and proper error handling.

## Setup

```bash
GITHUB_CLIENT_ID=Ov23li...
GITHUB_CLIENT_SECRET=secret
GITHUB_CALLBACK_URL=http://localhost:3000/auth/github/callback
```

Create a GitHub OAuth App at https://github.com/settings/developers

## Usage

### Generate Auth URL

```js
import { getAuthorizationUrl } from "./index.js";

const { url, state } = await getAuthorizationUrl({
  clientId: process.env.GITHUB_CLIENT_ID,
  redirectUri: process.env.GITHUB_CALLBACK_URL,
  scopes: ["read:user", "user:email"],
});
// Store state in session for CSRF verification
req.session.oauthState = state;
res.redirect(url);
```

### Handle Callback

```js
import { exchangeCode, getUserProfile, getUserEmails } from "./index.js";

// In your callback route
const token = await exchangeCode({
  clientId: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  code: req.query.code,
  redirectUri: process.env.GITHUB_CALLBACK_URL,
});

const user = await getUserProfile(token.accessToken);
const emails = await getUserEmails(token.accessToken);
const primaryEmail = emails?.[0]?.email; // Sorted primary-first
```

### Express Middleware (Shortcut)

```js
import { getAuthorizationUrl, callbackHandler } from "./index.js";

// Login route
app.get("/auth/github", async (req, res) => {
  const { url, state } = await getAuthorizationUrl({
    clientId: process.env.GITHUB_CLIENT_ID,
    redirectUri: process.env.GITHUB_CALLBACK_URL,
  });
  req.session.oauthState = state;
  res.redirect(url);
});

// Callback route
app.get("/auth/github/callback", callbackHandler({
  clientId: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  redirectUri: process.env.GITHUB_CALLBACK_URL,
  onSuccess: (token, user, req, res) => {
    req.session.user = user;
    res.redirect("/dashboard");
  },
  onError: (error, req, res) => {
    res.redirect(`/login?error=${error}`);
  },
}));
```

### Token Refresh (GitHub Apps)

```js
import { refreshAccessToken } from "./index.js";

const newToken = await refreshAccessToken({
  clientId: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  refreshToken: storedRefreshToken,
});
```

## Edge Cases Handled

- **CSRF protection** — auto-generates cryptographically secure state parameter
- **Primary email** — emails sorted with primary first, handles private email settings
- **Token refresh** — supports GitHub Apps with expiring tokens
- **Error propagation** — all functions return null on error, never throw
- **User-Agent header** — required by GitHub API, included automatically
