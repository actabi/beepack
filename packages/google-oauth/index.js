// Google OAuth 2.0 Flow
// Zero dependencies - uses native fetch and Web Crypto API.
// Handles the full OIDC flow: auth URL with PKCE, code exchange, ID token
// verification via Google's public keys, refresh token rotation, scope
// management, and user profile fetching from the People API.

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_PEOPLE_URL = "https://people.googleapis.com/v1/people/me";
const TIMEOUT_MS = 15000;

// Default scopes for basic authentication. Extend via `extraScopes` for
// incremental consent without re-prompting for already-granted scopes.
const DEFAULT_SCOPES = ["openid", "email", "profile"];

// In-memory cache for Google's public JWKS to avoid refetching on every verify.
let jwksCache = { keys: null, fetchedAt: 0 };
const JWKS_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Generate a Google OAuth authorization URL with PKCE.
 * Returns the URL, state (for CSRF), and codeVerifier (for PKCE exchange).
 * Store both state and codeVerifier in session before redirecting.
 *
 * @param {object} config
 * @param {string} config.clientId - Google OAuth client ID
 * @param {string} config.redirectUri - Callback URL registered in Google Console
 * @param {string[]} [config.extraScopes=[]] - Additional scopes beyond the default openid/email/profile
 * @param {string} [config.state] - CSRF token (auto-generated if omitted)
 * @param {"online"|"offline"} [config.accessType="online"] - "offline" requests a refresh token
 * @param {"none"|"consent"|"select_account"} [config.prompt] - Consent screen behavior
 * @param {string} [config.loginHint] - Pre-fill the email field
 * @param {string} [config.hd] - Restrict to a Google Workspace domain (not enforced server-side — always verify hd claim yourself if needed)
 * @returns {Promise<{url: string, state: string, codeVerifier: string}>}
 */
export async function getAuthorizationUrl(config) {
  const {
    clientId,
    redirectUri,
    extraScopes = [],
    state,
    accessType = "online",
    prompt,
    loginHint,
    hd,
  } = config;

  const stateValue = state || (await generateRandomString(24));
  const codeVerifier = await generateRandomString(48);
  const codeChallenge = await computeCodeChallenge(codeVerifier);

  const scopes = [...DEFAULT_SCOPES, ...extraScopes];

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state: stateValue,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: accessType,
  });

  if (prompt) params.set("prompt", prompt);
  if (loginHint) params.set("login_hint", loginHint);
  // hd only hints to Google which account to prefer — it is NOT a security
  // boundary. Server-side, if you need workspace enforcement, check the `hd`
  // claim in the verified ID token yourself after calling verifyIdToken().
  if (hd) params.set("hd", hd);

  return {
    url: `${GOOGLE_AUTH_URL}?${params.toString()}`,
    state: stateValue,
    codeVerifier,
  };
}

/**
 * Exchange an authorization code for tokens.
 * Google only returns a refresh_token on the *first* consent for a user+client
 * pair. Store it securely on first receipt — subsequent exchanges will omit it.
 *
 * @param {object} params
 * @param {string} params.clientId - Google OAuth client ID
 * @param {string} params.clientSecret - Google OAuth client secret
 * @param {string} params.code - Authorization code from the callback
 * @param {string} params.redirectUri - Same redirect URI used in auth URL
 * @param {string} params.codeVerifier - PKCE verifier from getAuthorizationUrl
 * @returns {Promise<{accessToken: string, idToken: string, tokenType: string, expiresIn: number, scope: string, refreshToken?: string}|null>}
 */
export async function exchangeCode(params) {
  const { clientId, clientSecret, code, redirectUri, codeVerifier } = params;

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      console.error(`[google-oauth] Token exchange error: ${data.error_description || data.error || res.status}`);
      return null;
    }

    return {
      accessToken: data.access_token,
      idToken: data.id_token,
      tokenType: data.token_type,
      expiresIn: data.expires_in,
      scope: data.scope,
      // Only present on first consent — store immediately, Google won't resend it.
      refreshToken: data.refresh_token || undefined,
    };
  } catch (err) {
    console.error(`[google-oauth] Token exchange failed: ${err.message}`);
    return null;
  }
}

/**
 * Verify a Google ID token by fetching Google's public JWKS and validating
 * the RS256 signature, expiry, issuer, and audience.
 *
 * WARNING: This does NOT check the `hd` (hosted domain) claim. If your app
 * restricts access to a specific Google Workspace org, check payload.hd
 * yourself after this call returns.
 *
 * WARNING: Do not trust ID tokens from the client side without server-side
 * verification. Always run this on the server with a token received directly
 * from the token endpoint.
 *
 * @param {string} idToken - Raw JWT from exchangeCode or refreshAccessToken
 * @param {string} clientId - Expected audience (your Google client ID)
 * @returns {Promise<{sub: string, email: string, emailVerified: boolean, name: string, picture: string, hd?: string, iat: number, exp: number}|null>}
 */
export async function verifyIdToken(idToken, clientId) {
  try {
    const [headerB64, payloadB64, sigB64] = idToken.split(".");
    if (!headerB64 || !payloadB64 || !sigB64) {
      console.error("[google-oauth] ID token malformed: not a valid JWT");
      return null;
    }

    const header = JSON.parse(base64UrlDecode(headerB64));
    const payload = JSON.parse(base64UrlDecode(payloadB64));

    // Structural checks before any crypto work
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      console.error("[google-oauth] ID token expired");
      return null;
    }
    if (payload.aud !== clientId) {
      console.error("[google-oauth] ID token audience mismatch");
      return null;
    }
    if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") {
      console.error("[google-oauth] ID token issuer invalid");
      return null;
    }

    // Fetch and cache Google's public keys
    const keys = await getGooglePublicKeys();
    if (!keys) return null;

    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) {
      console.error(`[google-oauth] No matching key for kid=${header.kid}`);
      return null;
    }

    // Import the RSA public key and verify the signature
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = Uint8Array.from(
      atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signature,
      new TextEncoder().encode(signingInput)
    );

    if (!valid) {
      console.error("[google-oauth] ID token signature invalid");
      return null;
    }

    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified,
      name: payload.name,
      picture: payload.picture,
      hd: payload.hd, // present only for Workspace accounts — check this yourself if needed
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch (err) {
    console.error(`[google-oauth] ID token verification failed: ${err.message}`);
    return null;
  }
}

/**
 * Rotate an access token using a stored refresh token.
 * Google may issue a new refresh token alongside the new access token — if
 * present, replace the stored one (refresh token rotation). The old token is
 * immediately revoked by Google.
 *
 * @param {object} params
 * @param {string} params.clientId
 * @param {string} params.clientSecret
 * @param {string} params.refreshToken - The stored refresh token
 * @param {Function} [params.onRefreshTokenRotated] - Called with the new refresh token when Google rotates it: (newRefreshToken: string) => void
 * @returns {Promise<{accessToken: string, idToken?: string, expiresIn: number, tokenType: string}|null>}
 */
export async function refreshAccessToken(params) {
  const { clientId, clientSecret, refreshToken, onRefreshTokenRotated } = params;

  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      console.error(`[google-oauth] Refresh error: ${data.error_description || data.error || res.status}`);
      return null;
    }

    // Google may rotate the refresh token — persist the new one immediately.
    if (data.refresh_token && onRefreshTokenRotated) {
      onRefreshTokenRotated(data.refresh_token);
    }

    return {
      accessToken: data.access_token,
      idToken: data.id_token || undefined,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
    };
  } catch (err) {
    console.error(`[google-oauth] Refresh failed: ${err.message}`);
    return null;
  }
}

/**
 * Fetch the authenticated user's profile from the Google People API.
 * Requires at least the `profile` and `email` scopes.
 *
 * @param {string} accessToken - Google access token
 * @returns {Promise<{sub: string, email: string, emailVerified: boolean, name: string, givenName: string, familyName: string, picture: string, locale?: string}|null>}
 */
export async function getUserProfile(accessToken) {
  const fields = "names,emailAddresses,photos,locales";

  try {
    const res = await fetch(`${GOOGLE_PEOPLE_URL}?personFields=${fields}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`[google-oauth] People API error: ${res.status}`);
      return null;
    }

    const person = await res.json();

    const primaryEmail = person.emailAddresses?.find((e) => e.metadata?.primary) || person.emailAddresses?.[0];
    const primaryName = person.names?.find((n) => n.metadata?.primary) || person.names?.[0];
    const primaryPhoto = person.photos?.find((p) => p.metadata?.primary) || person.photos?.[0];
    const primaryLocale = person.locales?.find((l) => l.metadata?.primary) || person.locales?.[0];

    return {
      sub: primaryEmail?.metadata?.source?.id,
      email: primaryEmail?.value,
      emailVerified: primaryEmail?.metadata?.verified ?? false,
      name: primaryName?.displayName,
      givenName: primaryName?.givenName,
      familyName: primaryName?.familyName,
      picture: primaryPhoto?.url,
      locale: primaryLocale?.value,
    };
  } catch (err) {
    console.error(`[google-oauth] Profile fetch failed: ${err.message}`);
    return null;
  }
}

/**
 * Build an incremental consent URL to request additional scopes without
 * re-prompting for already-granted ones. Pass the new scopes only.
 * Store the returned state and codeVerifier in session as usual.
 *
 * @param {object} config
 * @param {string} config.clientId
 * @param {string} config.redirectUri
 * @param {string[]} config.newScopes - The additional scopes to request
 * @param {string} [config.loginHint] - User's email to skip account picker
 * @returns {Promise<{url: string, state: string, codeVerifier: string}>}
 */
export async function getIncrementalConsentUrl(config) {
  return getAuthorizationUrl({
    ...config,
    extraScopes: config.newScopes,
    prompt: "consent",
    accessType: "offline",
  });
}

/**
 * Express/Connect middleware for the OAuth callback route.
 * Validates state, exchanges the code, verifies the ID token, and calls your
 * onSuccess handler with the token set and verified claims.
 *
 * @param {object} config
 * @param {string} config.clientId
 * @param {string} config.clientSecret
 * @param {string} config.redirectUri
 * @param {(tokens: object, claims: object, req: object, res: object) => void} config.onSuccess
 * @param {(error: string, req: object, res: object) => void} [config.onError]
 * @returns {Function} Express middleware
 */
export function callbackHandler(config) {
  const { clientId, clientSecret, redirectUri, onSuccess, onError } = config;

  return async (req, res) => {
    const code = req.query?.code;
    const state = req.query?.state;
    const error = req.query?.error;

    if (error) {
      if (onError) return onError(error, req, res);
      return res.status(400).json({ error });
    }

    if (!code) {
      if (onError) return onError("missing_code", req, res);
      return res.status(400).json({ error: "Missing authorization code" });
    }

    if (state !== req.session?.oauthState) {
      if (onError) return onError("state_mismatch", req, res);
      return res.status(400).json({ error: "State mismatch — possible CSRF" });
    }

    const codeVerifier = req.session?.oauthCodeVerifier;
    if (!codeVerifier) {
      if (onError) return onError("missing_code_verifier", req, res);
      return res.status(400).json({ error: "Missing PKCE code verifier" });
    }

    const tokens = await exchangeCode({ clientId, clientSecret, code, redirectUri, codeVerifier });
    if (!tokens) {
      if (onError) return onError("token_exchange_failed", req, res);
      return res.status(500).json({ error: "Token exchange failed" });
    }

    const claims = await verifyIdToken(tokens.idToken, clientId);
    if (!claims) {
      if (onError) return onError("id_token_invalid", req, res);
      return res.status(500).json({ error: "ID token verification failed" });
    }

    return onSuccess(tokens, claims, req, res);
  };
}

// --- Helpers ---

/** Fetch and cache Google's public JWKS. */
async function getGooglePublicKeys() {
  const now = Date.now();
  if (jwksCache.keys && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }

  try {
    const res = await fetch(GOOGLE_CERTS_URL, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[google-oauth] JWKS fetch failed: ${res.status}`);
      return null;
    }
    const { keys } = await res.json();
    jwksCache = { keys, fetchedAt: now };
    return keys;
  } catch (err) {
    console.error(`[google-oauth] JWKS fetch error: ${err.message}`);
    return null;
  }
}

/** Generate a cryptographically random URL-safe string of `byteLength` bytes. */
async function generateRandomString(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Compute the PKCE S256 code challenge from a verifier. */
async function computeCodeChallenge(verifier) {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode a base64url-encoded string to a UTF-8 string. */
function base64UrlDecode(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    str.length + ((4 - (str.length % 4)) % 4),
    "="
  );
  return atob(padded);
}
