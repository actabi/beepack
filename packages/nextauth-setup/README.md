# nextauth-setup

Production-ready Auth.js v5 (NextAuth) setup for Next.js App Router. Generates auth config with GitHub, Google, and magic-link providers; Prisma adapter schema; middleware for protected routes; and session enrichment callbacks. Zero extra dependencies beyond `next-auth` itself.

This covers the parts that trip up even experienced devs: the v5 route handler path, database vs. JWT session strategy, custom session fields, and cross-domain cookie config.

## Setup

### 1. Install dependencies

```bash
npm install next-auth@beta @auth/prisma-adapter @prisma/client
```

### 2. Environment variables

```bash
NEXTAUTH_SECRET=your-secret-here      # Required in production (openssl rand -base64 32)
NEXTAUTH_URL=https://example.com      # Canonical URL — required for cross-domain sessions

# GitHub provider
GITHUB_CLIENT_ID=Ov23li...
GITHUB_CLIENT_SECRET=...

# Google provider
GOOGLE_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

### 3. Prisma schema

Generate the required schema additions and paste them into `prisma/schema.prisma`:

```js
import { generatePrismaSchema } from "./index.js";

console.log(generatePrismaSchema({ provider: "postgresql", addRoleField: true }));
```

Then run:

```bash
npx prisma migrate dev --name add-auth-tables
```

### 4. Create `auth.ts`

```ts
// auth.ts (project root, next to package.json)
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { buildAuthConfig } from "./packages/nextauth-setup/index.js";

export const { handlers, auth, signIn, signOut } = NextAuth(
  buildAuthConfig({
    prismaAdapter: PrismaAdapter(prisma),
    github: true,
    google: true,
    magicLink: true,
    magicLinkConfig: { from: "auth@example.com" },
  })
);
```

### 5. Route handler

**Critical:** the file must be at `app/api/auth/[...nextauth]/route.ts` — not `pages/api/auth/[...nextauth].ts`.

```ts
// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
export const runtime = "nodejs";
```

Or generate it programmatically:

```js
import { generateRouteHandlerSource } from "./index.js";
import { writeFileSync } from "fs";

const src = generateRouteHandlerSource({ authImportPath: "@/auth" });
writeFileSync("app/api/auth/[...nextauth]/route.ts", src);
```

### 6. Middleware

```ts
// middleware.ts (project root — NOT inside app/)
import { auth } from "@/auth";
import { buildMiddleware } from "./packages/nextauth-setup/index.js";

const { handler, config } = buildMiddleware({
  protectedPrefixes: ["/dashboard", "/account", "/settings"],
  loginPath: "/login",
  auth,
});

export default auth(handler);
export { config };
```

## Usage

### Client Component — `useSession`

```tsx
"use client";
import { useSession } from "next-auth/react";

export default function ProfileButton() {
  const { data: session, status } = useSession();

  if (status === "loading") return <p>Loading...</p>;
  if (!session) return <a href="/login">Sign in</a>;

  return (
    <div>
      <p>{session.user.name} ({session.user.role})</p>
    </div>
  );
}
```

Wrap your root layout with the SessionProvider:

```tsx
// app/layout.tsx
import { SessionProvider } from "next-auth/react";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
```

### Server Component — `auth()`

```tsx
// app/dashboard/page.tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return <h1>Hello, {session.user.name}</h1>;
}
```

### Server Action

```ts
"use server";
import { auth } from "@/auth";

export async function deleteAccount() {
  const session = await auth();
  if (!session) throw new Error("Unauthenticated");
  // session.user.id is set by our jwt/session callbacks
  await db.user.delete({ where: { id: session.user.id } });
}
```

### API Route Handler

```ts
// app/api/me/route.ts
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  return NextResponse.json({ user: session.user });
}
```

Get all snippets programmatically:

```js
import { getSessionSnippets } from "./index.js";

const { clientComponent, serverComponent, serverAction, apiRoute } = getSessionSnippets();
```

### Custom role in session

```ts
// auth.ts
import { buildAuthConfig, withRoleCallback } from "./packages/nextauth-setup/index.js";

export const { handlers, auth, signIn, signOut } = NextAuth(
  buildAuthConfig({
    prismaAdapter: PrismaAdapter(prisma),
    github: true,
    extraCallbacks: [
      withRoleCallback(async (userId) => {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        return user?.role ?? "user";
      }),
    ],
  })
);
```

## Edge Cases Handled

- **Wrong route path** — The route handler must be at `app/api/auth/[...nextauth]/route.ts`. Using `pages/api/auth/[...nextauth].ts` is the v4 Pages Router pattern and will 404 in App Router projects.
- **Missing `NEXTAUTH_SECRET`** — `buildAuthConfig` logs an error at startup if this is unset in production. Use `openssl rand -base64 32` to generate one.
- **Session not persisting across domains** — Set `NEXTAUTH_URL` to the canonical production URL. For sub-domains, configure `cookies.sessionToken.options.domain` in `sessionConfig`.
- **JWT vs database strategy** — If no `prismaAdapter` is passed, the strategy defaults to `"jwt"`. The `session` callback handles both paths so `session.user.id` is always populated.
- **Google refresh tokens** — Google only returns a `refresh_token` on first consent. If you need offline access, set `access_type: "offline"` and `prompt: "consent"` in the Google provider's `authorization.params`.
- **Magic-link with custom sender** — Pass `sendVerificationRequest` in `magicLinkConfig` to use Resend, SendGrid, or any transactional email provider instead of the built-in nodemailer.
- **TypeScript augmentation** — Extend `next-auth` types to add `role` and `id` to `Session.user`:

```ts
// types/next-auth.d.ts
import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }
}
```
