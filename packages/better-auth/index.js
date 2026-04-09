// Better Auth — Integration helper for beepack
// Points to the real SDK: https://github.com/better-auth/better-auth
// Install the real package: npm install better-auth

/**
 * Create a Better Auth configuration with sensible defaults.
 * @param {object} config
 * @param {string} config.secret - Auth secret key
 * @param {string} config.baseURL - Application base URL
 * @param {object} config.database - Database connection config
 */
export function createBetterAuth({ secret, baseURL, database }) {
  return {
    secret,
    baseURL,
    database,
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    account: { accountLinking: { enabled: true } },
  };
}

/**
 * Create auth client for frontend usage.
 * @param {string} baseURL - API base URL
 */
export function createAuthClient(baseURL) {
  const headers = () => ({ "Content-Type": "application/json" });
  return {
    async signUp(email, password, name) {
      const res = await fetch(`${baseURL}/api/auth/sign-up/email`, {
        method: "POST", headers: headers(), body: JSON.stringify({ email, password, name }) });
      return res.json();
    },
    async signIn(email, password) {
      const res = await fetch(`${baseURL}/api/auth/sign-in/email`, {
        method: "POST", headers: headers(), body: JSON.stringify({ email, password }) });
      return res.json();
    },
    async getSession(token) {
      const res = await fetch(`${baseURL}/api/auth/get-session`, {
        headers: { ...headers(), Authorization: `Bearer ${token}` } });
      return res.json();
    },
  };
}
