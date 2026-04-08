// GitHub OAuth 2.0 Flow
// Zero dependencies - uses native fetch and Web Crypto API.
// Handles the full flow: auth URL, code exchange, token refresh, and user profile.

const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API = "https://api.github.com";
const TIMEOUT_MS = 15000;

/**
 * Generate a GitHub OAuth authorization URL.
 *
 * @param {object} config
 * @param {string} config.clientId - GitHub OAuth App client ID
 * @param {string} config.redirectUri - Callback URL registered with GitHub
 * @param {string[]} [config.scopes=["read:user","user:email"]] - OAuth scopes
 * @param {string} [config.state] - CSRF protection state (auto-generated if omitted)
 * @returns {Promise<{url: string, state: string}>}
 */
export async function getAuthorizationUrl(config) {
  const {
    clientId,
    redirectUri,
    scopes = ["read:user", "user:email"],
    state,
  } = config;

  const stateValue = state || generateRandomState();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    state: stateValue,
    allow_signup: "true",
  });

  return {
    url: `${GITHUB_AUTH_URL}?${params.toString()}`,
    state: stateValue,
  };
}

/**
 * Exchange an authorization code for an access token.
 *
 * @param {object} params
 * @param {string} params.clientId - GitHub OAuth App client ID
 * @param {string} params.clientSecret - GitHub OAuth App client secret
 * @param {string} params.code - Authorization code from callback
 * @param {string} params.redirectUri - Same redirect URI used in auth URL
 * @returns {Promise<{accessToken: string, tokenType: string, scope: string, refreshToken?: string, expiresIn?: number}|null>}
 */
export async function exchangeCode(params) {
  const { clientId, clientSecret, code, redirectUri } = params;

  try {
    const res = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const data = await res.json();

    if (data.error) {
      console.error(`[github-oauth] Token exchange error: ${data.error_description || data.error}`);
      return null;
    }

    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
      scope: data.scope,
      refreshToken: data.refresh_token || undefined,
      expiresIn: data.expires_in || undefined,
    };
  } catch (err) {
    console.error(`[github-oauth] Token exchange failed: ${err.message}`);
    return null;
  }
}

/**
 * Refresh an access token (GitHub Apps with expiring tokens).
 *
 * @param {object} params
 * @param {string} params.clientId
 * @param {string} params.clientSecret
 * @param {string} params.refreshToken
 * @returns {Promise<{accessToken: string, refreshToken: string, expiresIn: number}|null>}
 */
export async function refreshAccessToken(params) {
  const { clientId, clientSecret, refreshToken } = params;

  try {
    const res = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const data = await res.json();

    if (data.error) {
      console.error(`[github-oauth] Refresh error: ${data.error_description || data.error}`);
      return null;
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  } catch (err) {
    console.error(`[github-oauth] Refresh failed: ${err.message}`);
    return null;
  }
}

/**
 * Get the authenticated user's profile.
 *
 * @param {string} accessToken - GitHub access token
 * @returns {Promise<{id: number, login: string, name: string|null, email: string|null, avatarUrl: string, bio: string|null, publicRepos: number, followers: number, createdAt: string}|null>}
 */
export async function getUserProfile(accessToken) {
  try {
    const res = await fetch(`${GITHUB_API}/user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "beepack-github-oauth",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) return null;
    const user = await res.json();

    return {
      id: user.id,
      login: user.login,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatar_url,
      bio: user.bio,
      publicRepos: user.public_repos,
      followers: user.followers,
      createdAt: user.created_at,
    };
  } catch (err) {
    console.error(`[github-oauth] Profile fetch failed: ${err.message}`);
    return null;
  }
}

/**
 * Get the authenticated user's email addresses.
 * Requires `user:email` scope. Returns primary email first.
 *
 * @param {string} accessToken - GitHub access token
 * @returns {Promise<Array<{email: string, primary: boolean, verified: boolean}>|null>}
 */
export async function getUserEmails(accessToken) {
  try {
    const res = await fetch(`${GITHUB_API}/user/emails`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "beepack-github-oauth",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) return null;
    const emails = await res.json();

    return emails
      .map((e) => ({ email: e.email, primary: e.primary, verified: e.verified }))
      .sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
  } catch (err) {
    console.error(`[github-oauth] Email fetch failed: ${err.message}`);
    return null;
  }
}

/**
 * Express/Connect middleware for the OAuth callback route.
 * Handles code exchange and calls your onSuccess handler.
 *
 * @param {object} config
 * @param {string} config.clientId
 * @param {string} config.clientSecret
 * @param {string} config.redirectUri
 * @param {(token: object, user: object, req: object, res: object) => void} config.onSuccess
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

    const token = await exchangeCode({ clientId, clientSecret, code, redirectUri });
    if (!token) {
      if (onError) return onError("token_exchange_failed", req, res);
      return res.status(500).json({ error: "Token exchange failed" });
    }

    const user = await getUserProfile(token.accessToken);
    return onSuccess(token, user, req, res);
  };
}

// --- Helpers ---

function generateRandomState() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
