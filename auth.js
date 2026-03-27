/**
 * GitHub OAuth Authentication for Beepack
 */

import crypto from 'crypto';

// Config (set via environment variables)
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'your_client_id';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || 'your_client_secret';
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL || 'http://localhost:3011/auth/github/callback';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

// In-memory session store (use Redis in production)
const sessions = new Map();
const pendingStates = new Map();

/**
 * Generate OAuth state parameter
 */
export function generateState() {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { createdAt: Date.now() });
  
  // Clean old states (older than 10 minutes)
  const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
  for (const [key, value] of pendingStates.entries()) {
    if (value.createdAt < tenMinutesAgo) {
      pendingStates.delete(key);
    }
  }
  
  return state;
}

/**
 * Validate OAuth state parameter
 */
export function validateState(state) {
  if (pendingStates.has(state)) {
    pendingStates.delete(state);
    return true;
  }
  return false;
}

/**
 * Get GitHub OAuth URL
 */
export function getGitHubAuthUrl() {
  const state = generateState();
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_CALLBACK_URL,
    scope: 'read:user user:email',
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
}

/**
 * Exchange code for access token
 */
export async function exchangeCodeForToken(code) {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const data = await response.json();
  
  if (data.error) {
    throw new Error(data.error_description || data.error);
  }
  
  return data.access_token;
}

/**
 * Get GitHub user info
 */
export async function getGitHubUser(accessToken) {
  const [userResponse, emailsResponse] = await Promise.all([
    fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Beepack',
      },
    }),
    fetch('https://api.github.com/user/emails', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Beepack',
      },
    }),
  ]);

  const user = await userResponse.json();
  const emails = await emailsResponse.json();
  
  // Get primary email
  const primaryEmail = emails.find(e => e.primary)?.email || emails[0]?.email;

  return {
    id: user.id,
    login: user.login,
    name: user.name,
    email: primaryEmail,
    avatarUrl: user.avatar_url,
    bio: user.bio,
    company: user.company,
    location: user.location,
    blog: user.blog,
    publicRepos: user.public_repos,
  };
}

/**
 * Create session token (simple JWT-like)
 */
export function createSessionToken(user) {
  const payload = {
    userId: user.id,
    login: user.login,
    iat: Date.now(),
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
  };
  
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(data)
    .digest('base64url');
  
  const token = `${data}.${signature}`;
  
  // Store session
  sessions.set(token, { user, createdAt: Date.now() });
  
  return token;
}

/**
 * Verify session token
 */
export function verifySessionToken(token) {
  if (!token) return null;
  
  try {
    const [data, signature] = token.split('.');
    
    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(data)
      .digest('base64url');
    
    if (signature !== expectedSignature) {
      return null;
    }
    
    // Parse payload
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    
    // Check expiration
    if (payload.exp < Date.now()) {
      sessions.delete(token);
      return null;
    }
    
    // Get full session data
    const session = sessions.get(token);
    return session?.user || null;
  } catch (e) {
    return null;
  }
}

/**
 * Middleware to extract user from request
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    req.user = verifySessionToken(token);
  }
  
  next();
}

/**
 * Middleware to require authentication
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please login with GitHub.',
      },
    });
  }
  next();
}

/**
 * Setup auth routes
 */
export function setupAuthRoutes(app, db) {
  // DEV MODE: Quick login without GitHub (only in development)
  app.get('/auth/dev-login', (req, res) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).send('Dev login disabled in production');
    }
    
    const handle = req.query.user || 'dev-user';
    
    // Upsert dev user
    let user = db.prepare('SELECT * FROM users WHERE handle = ?').get(handle);
    
    if (!user) {
      const result = db.prepare(`
        INSERT INTO users (github_id, handle, email, avatar_url, role)
        VALUES (?, ?, ?, ?, 'user')
      `).run(`dev-${Date.now()}`, handle, `${handle}@localhost`, `https://api.dicebear.com/7.x/bottts/svg?seed=${handle}`);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    }
    
    // Create session
    const sessionToken = createSessionToken({
      id: user.id,
      githubId: user.github_id,
      login: user.handle,
      email: user.email,
      avatarUrl: user.avatar_url,
    });
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Dev Login - Beepack</title>
        <style>
          body { font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white; }
          .container { text-align: center; max-width: 600px; }
          .emoji { font-size: 48px; margin-bottom: 16px; }
          h1 { margin: 0 0 8px 0; color: #fbbf24; }
          p { color: #94a3b8; }
          code { background: #1e293b; padding: 8px 16px; border-radius: 8px; display: block; margin: 16px 0; word-break: break-all; font-size: 12px; }
          .warning { background: #78350f; color: #fbbf24; padding: 12px; border-radius: 8px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="emoji">🐝</div>
          <h1>Dev Mode Login</h1>
          <p>Logged in as <strong>${user.handle}</strong></p>
          <p>Your token:</p>
          <code>${sessionToken}</code>
          <p>CLI login:</p>
          <code>beepack login --token ${sessionToken}</code>
          <div class="warning">⚠️ Dev mode only - not for production</div>
        </div>
        <script>
          localStorage.setItem('beepack_token', '${sessionToken}');
          localStorage.setItem('beepack_user', JSON.stringify(${JSON.stringify({
            login: user.handle,
            email: user.email,
            avatarUrl: user.avatar_url,
          })}));
        </script>
      </body>
      </html>
    `);
  });

  // Start OAuth flow
  app.get('/auth/github', (req, res) => {
    res.redirect(getGitHubAuthUrl());
  });

  // OAuth callback
  app.get('/auth/github/callback', async (req, res) => {
    const { code, state } = req.query;
    
    try {
      // Validate state
      if (!validateState(state)) {
        return res.status(400).send('Invalid state parameter');
      }
      
      // Exchange code for token
      const accessToken = await exchangeCodeForToken(code);
      
      // Get user info
      const githubUser = await getGitHubUser(accessToken);
      
      // Upsert user in database
      const existingUser = db.prepare('SELECT * FROM users WHERE github_id = ?').get(githubUser.id);
      
      let userId;
      if (existingUser) {
        // Update existing user
        db.prepare(`
          UPDATE users SET
            handle = ?,
            email = ?,
            avatar_url = ?,
            github_token = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE github_id = ?
        `).run(githubUser.login, githubUser.email, githubUser.avatarUrl, accessToken, githubUser.id);
        userId = existingUser.id;
      } else {
        // Create new user
        const result = db.prepare(`
          INSERT INTO users (github_id, handle, email, avatar_url, github_token)
          VALUES (?, ?, ?, ?, ?)
        `).run(githubUser.id, githubUser.login, githubUser.email, githubUser.avatarUrl, accessToken);
        userId = result.lastInsertRowid;
      }
      
      // Get full user record
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      
      // Create session
      const sessionToken = createSessionToken({
        id: user.id,
        githubId: user.github_id,
        login: user.handle,
        email: user.email,
        avatarUrl: user.avatar_url,
      });
      
      // Return HTML that stores token and redirects
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Login Successful - Beepack</title>
          <style>
            body { font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: white; }
            .container { text-align: center; }
            .emoji { font-size: 48px; margin-bottom: 16px; }
            h1 { margin: 0 0 8px 0; }
            p { color: #94a3b8; }
            code { background: #1e293b; padding: 8px 16px; border-radius: 8px; display: block; margin: 16px 0; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="emoji">🐝</div>
            <h1>Welcome, ${user.handle}!</h1>
            <p>You're now logged in to Beepack.</p>
            <p>Your CLI token:</p>
            <code>${sessionToken}</code>
            <p>Run: <code>export BEEPACK_TOKEN="${sessionToken}"</code></p>
            <p>Or save to ~/.beepack/config.json</p>
          </div>
          <script>
            // Store token for web app
            localStorage.setItem('beepack_token', '${sessionToken}');
            localStorage.setItem('beepack_user', JSON.stringify(${JSON.stringify({
              login: user.handle,
              email: user.email,
              avatarUrl: user.avatar_url,
            })}));
          </script>
        </body>
        </html>
      `);
    } catch (error) {
      console.error('OAuth error:', error);
      res.status(500).send(`Authentication failed: ${error.message}`);
    }
  });

  // Get current user
  app.get('/api/v1/me', authMiddleware, (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not logged in',
        },
      });
    }
    
    res.json({
      user: req.user,
    });
  });

  // Logout
  app.post('/api/v1/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      sessions.delete(token);
    }
    res.json({ success: true });
  });
}
