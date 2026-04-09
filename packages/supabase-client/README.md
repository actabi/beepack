# supabase-client

Full Supabase integration: CRUD with RLS-aware patterns, real-time table subscriptions, auth helpers (signIn, signOut, session, refresh), and storage uploads with presigned URLs. Zero dependencies — uses native `fetch` and `WebSocket`.

Handles the sharp edges: RLS blocking inserts when `auth.uid()` is null, server-side session hydration, and real-time subscriptions leaking on unmount.

## Setup

```bash
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
```

Find these in your Supabase dashboard under **Project Settings → API**.

## Usage

### CRUD (PostgREST)

```js
import { selectRows, insertRows, updateRows, deleteRows } from "./index.js";

const config = {
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  accessToken: session.accessToken, // from signIn() — required when table has RLS
};

// Select with filters
const posts = await selectRows({
  ...config,
  table: "posts",
  select: "id,title,created_at",
  filters: { user_id: "uuid-here" },
  order: { column: "created_at", ascending: false },
  limit: 20,
});

// Insert (RLS note: omitting accessToken means auth.uid() is null)
const created = await insertRows({
  ...config,
  table: "posts",
  rows: { title: "Hello", body: "World", user_id: session.user.id },
});

// Upsert (ON CONFLICT DO UPDATE)
const upserted = await insertRows({
  ...config,
  table: "user_profiles",
  rows: { id: session.user.id, username: "alice" },
  upsert: true,
});

// Update by filter
const updated = await updateRows({
  ...config,
  table: "posts",
  filters: { id: "post-uuid" },
  patch: { title: "Updated title" },
});

// Delete
const ok = await deleteRows({
  ...config,
  table: "posts",
  filters: { id: "post-uuid" },
});
```

### Auth

```js
import { signIn, signOut, getSession, refreshToken } from "./index.js";

// Sign in
const session = await signIn({
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  email: "user@example.com",
  password: "hunter2",
});
// { accessToken, refreshToken, expiresAt, user }
// Store accessToken + refreshToken in your session store

// Server-side: always hydrate the session before querying
// If you skip this, auth.uid() in RLS policies will be null
const user = await getSession({
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  accessToken: storedAccessToken,
});
// user is null with a 401 log if the token is expired → call refreshToken()

// Refresh an expired access token
const renewed = await refreshToken({
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  refreshToken: storedRefreshToken,
});
// { accessToken, refreshToken, expiresAt }

// Sign out
await signOut({
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  accessToken: session.accessToken,
});
```

### Real-time Subscriptions

```js
import { subscribeToTable } from "./index.js";

// Subscribe to all changes on a table
const subscription = subscribeToTable({
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  accessToken: session.accessToken, // for RLS-protected tables
  table: "messages",
  event: "*", // "INSERT" | "UPDATE" | "DELETE" | "*"
  schema: "public",
  filter: `room_id=eq.${roomId}`, // optional PostgREST filter
  onMessage: (payload) => {
    console.log(payload.eventType, payload.new, payload.old);
  },
  onError: (err) => console.error("Realtime error:", err),
});

// IMPORTANT: always unsubscribe on cleanup to avoid leaks
// React example:
// useEffect(() => {
//   const sub = subscribeToTable({ ... });
//   return () => sub.unsubscribe();
// }, []);

subscription.unsubscribe();
```

### Storage

```js
import { uploadFile, createPresignedUrl } from "./index.js";

// Upload a file (works with File, Blob, ArrayBuffer, Uint8Array)
const result = await uploadFile({
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  accessToken: session.accessToken, // required for private buckets
  bucket: "avatars",
  path: `users/${session.user.id}/avatar.png`,
  file: imageBlob,
  contentType: "image/png",
  upsert: true, // overwrite if the file already exists
});
// { key: "avatars/users/.../avatar.png", fullPath: "https://...supabase.co/storage/v1/..." }

// Create a time-limited presigned URL for a private object
const signed = await createPresignedUrl({
  url: process.env.SUPABASE_URL,
  anonKey: process.env.SUPABASE_ANON_KEY,
  accessToken: session.accessToken,
  bucket: "documents",
  path: "invoices/invoice-123.pdf",
  expiresIn: 3600, // seconds (default: 1 hour)
});
// { signedUrl: "https://...?token=...", expiresAt: "2026-04-08T13:00:00.000Z" }
```

## Edge Cases Handled

- **RLS blocking inserts** — `insertRows` logs a specific warning when a 403 or `42501` code is returned, pointing to the missing `accessToken` as the likely cause
- **Server-side session** — `getSession` logs a reminder to call `refreshToken()` on 401, preventing the silent "RLS passes but returns zero rows" failure
- **Realtime leaks** — `subscribeToTable` returns an `{ unsubscribe }` handle; the heartbeat timer is always cleared on close
- **Token expiry** — `refreshToken` exchanges a refresh token for a fresh pair; pair it with `getSession` for automatic renewal
- **Network failures** — all functions return `null`/`false` on error and log via `console.error`, never throw
- **Private storage** — presigned URL creation requires an `accessToken`; public bucket URLs are returned directly from `uploadFile`
