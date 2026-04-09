// Auth.js v5 (NextAuth) Setup Helpers
// Zero dependencies beyond next-auth itself.
// Generates auth config, Prisma schema, route handlers, middleware, and session callbacks.
// Targets the Next.js App Router — do NOT use this with the Pages Router.

// ─── Constants ────────────────────────────────────────────────────────────────

const PKG = "[nextauth-setup]";

// ─── Auth Config Builder ──────────────────────────────────────────────────────

/**
 * Build a complete Auth.js v5 configuration object.
 *
 * Pass this to the `NextAuth()` call in `app/api/auth/[...nextauth]/route.ts`.
 * The returned object is plain data — spread in your own overrides as needed.
 *
 * @param {object} options
 * @param {object} [options.prismaAdapter]        - Initialized PrismaAdapter instance (import from @auth/prisma-adapter)
 * @param {boolean} [options.github=false]        - Enable GitHub OAuth provider
 * @param {boolean} [options.google=false]        - Enable Google OAuth provider
 * @param {boolean} [options.magicLink=false]     - Enable email magic-link (Resend / nodemailer)
 * @param {object}  [options.magicLinkConfig]     - Config for the Email provider
 * @param {string}  [options.magicLinkConfig.from]       - Sender address (e.g. "auth@example.com")
 * @param {Function} [options.magicLinkConfig.sendVerificationRequest] - Override send function
 * @param {string[]} [options.pages.signIn]       - Custom sign-in page path
 * @param {object}  [options.sessionConfig]       - Overrides for the session strategy/maxAge
 * @param {Function[]} [options.extraCallbacks]   - Additional callback objects to merge
 * @returns {object} Auth.js config object (pass directly to NextAuth())
 */
export function buildAuthConfig(options = {}) {
  const {
    prismaAdapter,
    github = false,
    google = false,
    magicLink = false,
    magicLinkConfig = {},
    pages = {},
    sessionConfig = {},
    extraCallbacks = [],
  } = options;

  const providers = [];

  if (github) {
    providers.push({
      id: "github",
      name: "GitHub",
      type: "oauth",
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      authorization: { params: { scope: "read:user user:email" } },
      profile(profile) {
        return {
          id: String(profile.id),
          name: profile.name ?? profile.login,
          email: profile.email,
          image: profile.avatar_url,
        };
      },
    });
  }

  if (google) {
    providers.push({
      id: "google",
      name: "Google",
      type: "oidc",
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid email profile",
          // Force account picker on every sign-in; remove if undesired
          prompt: "select_account",
        },
      },
    });
  }

  if (magicLink) {
    const { from = "noreply@example.com", sendVerificationRequest } = magicLinkConfig;
    const emailProvider = {
      id: "email",
      name: "Email",
      type: "email",
      from,
    };
    if (sendVerificationRequest) {
      emailProvider.sendVerificationRequest = sendVerificationRequest;
    }
    providers.push(emailProvider);
  }

  if (providers.length === 0) {
    console.error(`${PKG} buildAuthConfig: no providers enabled. Pass github:true, google:true, or magicLink:true.`);
  }

  const config = {
    adapter: prismaAdapter ?? undefined,
    providers,
    session: {
      strategy: prismaAdapter ? "database" : "jwt",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      ...sessionConfig,
    },
    pages: {
      signIn: "/login",
      error: "/login",
      ...pages,
    },
    callbacks: buildSessionCallbacks(extraCallbacks),
    // Prevents "No secret" warning in production; must be set via env
    secret: process.env.NEXTAUTH_SECRET,
    trustHost: true,
  };

  if (!process.env.NEXTAUTH_SECRET && process.env.NODE_ENV === "production") {
    console.error(`${PKG} NEXTAUTH_SECRET is not set. Authentication will fail in production.`);
  }

  return config;
}

// ─── Callback Helpers ─────────────────────────────────────────────────────────

/**
 * Build the callbacks object that enriches the session and JWT with custom fields.
 *
 * Merges any additional callback objects passed by the caller so you can
 * layer your own logic on top without replacing these defaults.
 *
 * @param {object[]} [extra=[]] - Additional Auth.js callback objects to merge
 * @returns {object} callbacks object for the Auth.js config
 */
export function buildSessionCallbacks(extra = []) {
  const base = {
    /**
     * Called whenever a JWT is created or updated.
     * Add custom claims here — they flow through to the session callback.
     */
    async jwt({ token, user, account }) {
      // On first sign-in, `user` and `account` are populated
      if (user) {
        token.userId = user.id;
        token.role = user.role ?? "user";
      }
      if (account?.provider) {
        token.provider = account.provider;
      }
      return token;
    },

    /**
     * Called whenever a session is checked (client or server).
     * Expose only what the client needs — never put secrets here.
     */
    async session({ session, token, user }) {
      if (session.user) {
        // JWT strategy: enrich from token
        if (token?.userId) {
          session.user.id = token.userId;
          session.user.role = token.role ?? "user";
          session.user.provider = token.provider;
        }
        // Database strategy: enrich from user record
        if (user?.id) {
          session.user.id = user.id;
          session.user.role = user.role ?? "user";
        }
      }
      return session;
    },
  };

  // Merge any extra callbacks, allowing callers to override specific hooks
  return Object.assign({}, base, ...extra);
}

/**
 * Convenience helper — returns a callbacks object that adds a `role` field
 * to the session by reading it from your database on every session check.
 *
 * Usage: pass the result as an element of `extraCallbacks` in buildAuthConfig.
 *
 * @param {Function} getRoleByUserId - async (userId: string) => string
 * @returns {object} partial callbacks object
 */
export function withRoleCallback(getRoleByUserId) {
  return {
    async session({ session, token, user }) {
      const id = token?.userId ?? user?.id;
      if (id && session.user) {
        try {
          session.user.role = await getRoleByUserId(id);
        } catch (err) {
          console.error(`${PKG} withRoleCallback: failed to fetch role for ${id}: ${err.message}`);
        }
      }
      return session;
    },
  };
}

// ─── Middleware Generator ─────────────────────────────────────────────────────

/**
 * Generate a Next.js middleware config that protects routes behind auth.
 *
 * Write this to `middleware.ts` at the project root (not inside `app/`).
 * The returned object has `handler` (the middleware function) and `config`
 * (the Next.js matcher config) — spread `config` as a named export.
 *
 * @param {object} options
 * @param {string[]} [options.protectedPrefixes=["/dashboard","/account","/settings"]] - Route prefixes that require auth
 * @param {string}  [options.loginPath="/login"] - Redirect target for unauthenticated requests
 * @param {Function} [options.auth]              - The `auth` export from your `auth.ts` (NextAuth v5)
 * @returns {{ handler: Function, config: object }}
 */
export function buildMiddleware(options = {}) {
  const {
    protectedPrefixes = ["/dashboard", "/account", "/settings"],
    loginPath = "/login",
    auth,
  } = options;

  if (!auth) {
    console.error(`${PKG} buildMiddleware: no auth function provided. Pass the auth export from your auth.ts.`);
  }

  /**
   * Middleware handler. Wrap with your auth export:
   *   export default auth(handler)
   * or use directly if auth() accepts a middleware function.
   */
  function handler(request) {
    const { pathname } = request.nextUrl;
    const isProtected = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));

    if (!isProtected) return; // Let the request through

    // In Auth.js v5, auth() wraps middleware — the session is available on request.auth
    const session = request.auth;
    if (!session) {
      const loginUrl = new URL(loginPath, request.url);
      loginUrl.searchParams.set("callbackUrl", request.url);
      return Response.redirect(loginUrl);
    }
  }

  const config = {
    matcher: [
      /*
       * Match all request paths EXCEPT:
       *   - _next/static (static files)
       *   - _next/image (image optimization)
       *   - favicon.ico
       *   - Public files with extensions
       */
      "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
  };

  return { handler, config };
}

// ─── Route Handler Generator ──────────────────────────────────────────────────

/**
 * Return the canonical App Router route handler source code as a string.
 *
 * Write this to: `app/api/auth/[...nextauth]/route.ts`
 *
 * COMMON MISTAKE: placing it at `pages/api/auth/[...nextauth].ts` (Pages Router)
 * or at `app/api/auth/route.ts` (missing the catch-all segment).
 *
 * @param {object} [options]
 * @param {string} [options.authImportPath="@/auth"] - Path to your auth.ts export
 * @returns {string} TypeScript source for the route handler file
 */
export function generateRouteHandlerSource(options = {}) {
  const { authImportPath = "@/auth" } = options;

  return `// app/api/auth/[...nextauth]/route.ts
// This file MUST live at this exact path for Auth.js v5 App Router support.
// Do NOT place it in pages/api/auth/ — that is the Pages Router pattern.

import { handlers } from "${authImportPath}";

export const { GET, POST } = handlers;

// Required for streaming responses (magic-link, etc.)
export const runtime = "nodejs";
`;
}

// ─── Prisma Schema Generator ──────────────────────────────────────────────────

/**
 * Generate the Prisma schema additions required by @auth/prisma-adapter.
 *
 * Returns a schema string you can paste into your `prisma/schema.prisma`.
 * Includes the four required models: User, Account, Session, VerificationToken.
 *
 * @param {object} [options]
 * @param {string} [options.provider="postgresql"] - Prisma datasource provider
 * @param {boolean} [options.addRoleField=true]    - Add a `role` String field to User
 * @param {string[]} [options.extraUserFields=[]]  - Additional raw Prisma field lines for the User model
 * @returns {string} Prisma schema fragment
 */
export function generatePrismaSchema(options = {}) {
  const {
    provider = "postgresql",
    addRoleField = true,
    extraUserFields = [],
  } = options;

  const roleField = addRoleField ? `  role          String   @default("user")` : "";
  const extra = extraUserFields.map((f) => `  ${f}`).join("\n");

  return `// ──────────────────────────────────────────────────────────────
// Auth.js v5 (@auth/prisma-adapter) required models
// Add these to your prisma/schema.prisma
// ──────────────────────────────────────────────────────────────

datasource db {
  provider = "${provider}"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
${roleField}
${extra}
  accounts      Account[]
  sessions      Session[]
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
`;
}

// ─── Session Usage Patterns ───────────────────────────────────────────────────

/**
 * Return usage snippet strings for common session access patterns.
 *
 * These are code-generation helpers — each returns a string you can write
 * to a file or display to the user as a starting point.
 *
 * @returns {{ clientComponent: string, serverComponent: string, serverAction: string, apiRoute: string }}
 */
export function getSessionSnippets() {
  return {
    /** useSession in a Client Component */
    clientComponent: `"use client";
import { useSession } from "next-auth/react";

export default function ProfileButton() {
  const { data: session, status } = useSession();

  if (status === "loading") return <p>Loading...</p>;
  if (!session) return <a href="/login">Sign in</a>;

  return (
    <div>
      <img src={session.user.image} alt={session.user.name} />
      <p>{session.user.email}</p>
      <p>Role: {session.user.role}</p>
    </div>
  );
}`,

    /** auth() in a Server Component (Auth.js v5) */
    serverComponent: `// app/dashboard/page.tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return <h1>Hello, {session.user.name}</h1>;
}`,

    /** auth() in a Server Action */
    serverAction: `"use server";
import { auth } from "@/auth";

export async function updateProfile(formData: FormData) {
  const session = await auth();
  if (!session) throw new Error("Unauthenticated");

  // session.user.id is available because of our custom jwt/session callbacks
  const userId = session.user.id;
  // ... update database
}`,

    /** auth() in an API Route Handler */
    apiRoute: `// app/api/me/route.ts
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  return NextResponse.json({ user: session.user });
}`,
  };
}
