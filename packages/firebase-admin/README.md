# Firebase Admin SDK

Zero-dependency Firebase Admin client using the REST API. Manage Auth users, read/write Firestore documents, and send FCM push notifications.

## Prerequisites

- Node.js >= 18
- Firebase project with service account key (JSON)
- \`FIREBASE_PROJECT_ID\` and \`FIREBASE_SERVICE_ACCOUNT_KEY\` env vars

## Environment Variables

| Variable | Description |
|----------|-------------|
| \`FIREBASE_PROJECT_ID\` | Your Firebase project ID |
| \`FIREBASE_SERVICE_ACCOUNT_KEY\` | JSON string of the service account key |

## Usage

### Get Access Token

\`\`\`js
import { getAccessToken } from './index.js';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
const token = await getAccessToken(key);
\`\`\`

### List Auth Users

\`\`\`js
import { listUsers } from './index.js';
const users = await listUsers("my-project", token);
console.log(users);
\`\`\`

### Read Firestore Document

\`\`\`js
import { getFirestoreDoc } from './index.js';
const doc = await getFirestoreDoc("my-project", token, "users/abc123");
console.log(doc);
\`\`\`

### Send Push Notification

\`\`\`js
import { sendPushNotification } from './index.js';
await sendPushNotification("my-project", token, {
  token: "device-fcm-token",
  notification: { title: "Hello", body: "World" }
});
\`\`\`

## Source

Based on [firebase/firebase-admin-node](https://github.com/firebase/firebase-admin-node) by **Firebase (Google)** — 1,727+ stars on GitHub.