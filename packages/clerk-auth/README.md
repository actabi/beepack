# clerk-auth

Zero-dependency server-side wrapper for the **Clerk Backend API**. Manage users, verify sessions, and validate tokens — all with native `fetch`.

## Environment Variables

| Variable | Description |
|---|---|
| `CLERK_SECRET_KEY` | Your Clerk secret key (starts with `sk_`) |

## Installation

```bash
bee add clerk-auth
```

## Usage

```js
import { getUser, listUsers, createUser, verifySession, verifyToken } from 'clerk-auth';

// Fetch a user by ID
const user = await getUser('user_2NNEqL2nrIRdJ197rcg');

// List users with pagination
const users = await listUsers({ limit: '20', offset: '0' });

// Create a new user
const newUser = await createUser({
  email_address: ['alice@example.com'],
  first_name: 'Alice',
  password: 'securePassword123',
});

// Verify a session is valid
const session = await verifySession('sess_2NNEqL2nrIRdJ197');

// Verify a session token (JWT)
const claims = await verifyToken('eyJhbGciOi...');
```

## API

### `getUser(userId, opts?)` — Fetch a single user by Clerk user ID.
### `listUsers(query?, opts?)` — List users with optional filtering and pagination.
### `createUser(params, opts?)` — Create a new user.
### `verifySession(sessionId, opts?)` — Verify a session is valid and active.
### `verifyToken(token, opts?)` — Verify a session JWT token.

All functions return parsed JSON or `null` on failure.

## License

MIT
