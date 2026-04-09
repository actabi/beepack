// NextAuth.js (Auth.js) — Integration helper for beepack
// Points to the real SDK: https://github.com/nextauthjs/next-auth
// Install the real package: npm install next-auth

/**
 * Helper to configure NextAuth with common providers.
 * This module wraps common NextAuth patterns for quick setup.
 *
 * @param {object} config
 * @param {string} config.secret - NEXTAUTH_SECRET
 * @param {Array<object>} config.providers - Array of provider configs
 * @returns {object} NextAuth configuration object
 */
export function createAuthConfig({ secret, providers = [] }) {
  return {
    secret,
    providers,
    session: { strategy: "jwt" },
    pages: { signIn: "/auth/signin", error: "/auth/error" },
    callbacks: {
      async jwt({ token, user }) {
        if (user) { token.id = user.id; token.role = user.role; }
        return token;
      },
      async session({ session, token }) {
        if (token) { session.user.id = token.id; session.user.role = token.role; }
        return session;
      },
    },
  };
}

/**
 * Create a GitHub OAuth provider config.
 * @param {string} clientId
 * @param {string} clientSecret
 */
export function githubProvider(clientId, clientSecret) {
  return { id: "github", name: "GitHub", type: "oauth", clientId, clientSecret,
    authorization: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    userinfo: "https://api.github.com/user" };
}

/**
 * Create a Google OAuth provider config.
 * @param {string} clientId
 * @param {string} clientSecret
 */
export function googleProvider(clientId, clientSecret) {
  return { id: "google", name: "Google", type: "oauth", clientId, clientSecret,
    authorization: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    userinfo: "https://openidconnect.googleapis.com/v1/userinfo" };
}
