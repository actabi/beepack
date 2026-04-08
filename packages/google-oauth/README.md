# google-oauth

Complete Google OAuth 2.0 / OIDC flow: authorization URL with PKCE, code exchange, ID token verification via Google's public JWKS, refresh token rotation with storage hooks, incremental consent for additional scopes, and user profile fetching from the People API. Zero dependencies.

This handles the real-world edge cases: PKCE for public clients, ID token RS256 signature verification, Google's one-time refresh token behaviour, refresh token rotation, incremental consent, and the `hd` claim gotcha for Workspace apps.

## Setup

```bash
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

Create credentials at https://console.cloud.google.com/apis/credentials — choose **OAuth 2.0 Client ID**, type **Web application**, and add your callback URL to the Authorised redirect URIs list.

## Usage

### Generate Auth URL (with PKCE)

```js
import { getAuthorizationUrl } from "./index.js";

const { url, state, codeVerifier } = await getAuthorizationUrl({
  clientId: process.env.GOOGLE_CLIENT_ID,
  redirectUri: process.env.GOOGLE_CALLBACK_URL,
  // Request offline access to receive a refresh token on first consent
  accessType: "offline",
  // Optional: restrict account picker to a specific Workspace domain (hint only)
  // hd: "yourcompany.com",
});

// Store both in session — state for CSRF, codeVerifier for PKCE exchange
req.session.oauthState = state;
req.session.oauthCodeVerifier = codeVerifier;
res.redirect(url);
```

### Exchange Code for Tokens

```js
import { exchangeCode } from "./index.js";

const tokens = await exchangeCode({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  code: req.query.code,
  redirectUri: process.env.GOOGLE_CALLBACK_URL,
  codeVerifier: req.session.oauthCodeVerifier,
});

// tokens.accessToken  — short-lived, use for API calls
// tokens.idToken      — JWT with identity claims, always verify before trusting
// tokens.refreshToken — only present on FIRST consent; store it securely now
if (tokens?.refreshToken) {
  await db.saveRefreshToken(userId, tokens.refreshToken);
}
```

### Verify the ID Token (server-side)

Always verify the ID token on the server. Never trust one forwarded from the client without re-verifying it.

```js
import { verifyIdToken } from "./index.js";

const claims = await verifyIdToken(tokens.idToken, process.env.GOOGLE_CLIENT_ID);
if (!claims) {
  // Signature invalid, expired, wrong audience, or wrong issuer
  return res.status(401).json({ error: "Invalid ID token" });
}

// claims.sub          — stable user ID, use this as your primary key
// claims.email        — user's email address
// claims.emailVerified
// claims.name, claims.picture
// claims.hd           — Workspace domain, e.g. "yourcompany.com" (undefined for @gmail.com)

// If you restrict to a Workspace org, check hd yourself:
if (claims.hd !== "yourcompany.com") {
  return res.status(403).json({ error: "Access restricted to company accounts" });
}
```

### Refresh an Access Token

Google only returns a refresh token on the first consent grant. If you didn't store it then, you must re-prompt with `prompt: "consent"`. When rotation is enabled in your Google project, handle the new token in `onRefreshTokenRotated`.

```js
import { refreshAccessToken } from "./index.js";

const newTokens = await refreshAccessToken({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  refreshToken: storedRefreshToken,
  // Called when Google rotates the refresh token (replace the stored one immediately)
  onRefreshTokenRotated: async (newRefreshToken) => {
    await db.saveRefreshToken(userId, newRefreshToken);
  },
});

// newTokens.accessToken — use this for subsequent API calls
// newTokens.expiresIn   — seconds until expiry (typically 3600)
```

### Fetch User Profile

```js
import { getUserProfile } from "./index.js";

const profile = await getUserProfile(tokens.accessToken);
// {
//   sub: "117549...",
//   email: "user@example.com",
//   emailVerified: true,
//   name: "Jane Smith",
//   givenName: "Jane",
//   familyName: "Smith",
//   picture: "https://lh3.googleusercontent.com/...",
//   locale: "en",
// }
```

### Incremental Consent (additional scopes)

Request more scopes later without re-asking for scopes already granted. Prompt the user only when your app needs access to a new resource.

```js
import { getIncrementalConsentUrl } from "./index.js";

// User clicks "Connect Google Calendar"
const { url, state, codeVerifier } = await getIncrementalConsentUrl({
  clientId: process.env.GOOGLE_CLIENT_ID,
  redirectUri: process.env.GOOGLE_CALLBACK_URL,
  newScopes: ["https://www.googleapis.com/auth/calendar.readonly"],
  loginHint: req.session.user.email, // skip account picker
});
req.session.oauthState = state;
req.session.oauthCodeVerifier = codeVerifier;
res.redirect(url);
```

### Express Middleware (Shortcut)

```js
import { getAuthorizationUrl, callbackHandler } from "./index.js";

// Login route
app.get("/auth/google", async (req, res) => {
  const { url, state, codeVerifier } = await getAuthorizationUrl({
    clientId: process.env.GOOGLE_CLIENT_ID,
    redirectUri: process.env.GOOGLE_CALLBACK_URL,
    accessType: "offline",
  });
  req.session.oauthState = state;
  req.session.oauthCodeVerifier = codeVerifier;
  res.redirect(url);
});

// Callback route — validates state, exchanges code, verifies ID token
app.get("/auth/google/callback", callbackHandler({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_CALLBACK_URL,
  onSuccess: (tokens, claims, req, res) => {
    // claims are already cryptographically verified
    req.session.user = { sub: claims.sub, email: claims.email, name: claims.name };
    if (tokens.refreshToken) {
      // Store it — you won't get another one without re-prompting
    }
    res.redirect("/dashboard");
  },
  onError: (error, req, res) => {
    res.redirect(`/login?error=${error}`);
  },
}));
```

## Edge Cases Handled

- **PKCE** — S256 code challenge generated with Web Crypto; verifier stored in session
- **ID token verification** — RS256 signature checked against Google's JWKS; issuer, audience, and expiry validated
- **JWKS caching** — Google's public keys are cached for 1 hour to avoid repeated fetches
- **One-time refresh token** — documented clearly; `refreshToken` field is `undefined` on subsequent exchanges
- **Refresh token rotation** — `onRefreshTokenRotated` callback lets you persist the new token before the old one is revoked
- **`hd` claim not enforced** — the `hd` URL param is a UX hint only; server-side domain restriction is left to your application logic
- **Incremental consent** — `getIncrementalConsentUrl` requests new scopes without re-prompting for existing ones
- **CSRF protection** — state parameter auto-generated with `crypto.getRandomValues`; validated in `callbackHandler`
- **Error propagation** — all functions return `null` on error, never throw
