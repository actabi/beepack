# Auth0 Authentication

Zero-dependency Auth0 Management and Authentication API client. Manage users, get tokens, and decode JWTs.

## Prerequisites

- Node.js >= 18
- Auth0 tenant with a Machine-to-Machine application

## Environment Variables

| Variable | Description |
|----------|-------------|
| \`AUTH0_DOMAIN\` | Auth0 domain (e.g. myapp.auth0.com) |
| \`AUTH0_CLIENT_ID\` | M2M app client ID |
| \`AUTH0_CLIENT_SECRET\` | M2M app client secret |

## Usage

### Get Management Token

\`\`\`js
import { getManagementToken } from './index.js';

const token = await getManagementToken({
  domain: process.env.AUTH0_DOMAIN,
  clientId: process.env.AUTH0_CLIENT_ID,
  clientSecret: process.env.AUTH0_CLIENT_SECRET,
});
\`\`\`

### List Users

\`\`\`js
import { listUsers } from './index.js';
const users = await listUsers(process.env.AUTH0_DOMAIN, token, { q: 'email:"*@company.com"' });
\`\`\`

### Create a User

\`\`\`js
import { createUser } from './index.js';
const user = await createUser(domain, token, {
  email: "alice@example.com",
  password: "SecureP@ss123",
  connection: "Username-Password-Authentication",
});
\`\`\`

## Source

Based on [node-auth0](https://github.com/auth0/node-auth0) (680+ stars).